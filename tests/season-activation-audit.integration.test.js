const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createSeasonAdministrationService } = require("../src/services/season-administration-service.js");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");
const { SEASON_2_PACKAGE } = require("../src/seasons/season2-package.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationAuditRecordService } = require("../src/services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../src/services/application-audit-record-validator.js");

function createFixture(overrides = {}) {
  const audit = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord: overrides.validateAuditRecord || validateAuditRecord, validateAuditHistory, createAuditId: () => "audit-activation", clock: () => new Date("2026-08-13T10:00:00.000Z") });
  const authorization = overrides.authorizationPolicyService || { requireAuthorized(actor) { return { actorId: actor.actorId }; } };
  let commitFailure = false;
  const service = createSeasonAdministrationService({
    preparedPackages: [SEASON_1_PACKAGE, SEASON_2_PACKAGE], validateSeasonPackage,
    authorizationPolicyService: authorization,
    persistenceCoordinator: {
      execute(mutate, auditIntent) {
        const mutation = createApplicationMutationCoordinator({ participants: [service, audit], auditRecordService: audit, createTransactionId: () => "tx-activation" });
        return mutation.execute(mutate, async () => { if (commitFailure) throw new Error("generation commit failed"); }, auditIntent);
      }
    },
    initialState: { schemaVersion: 2, activeSeason: null, completedSeasons: [] },
    clock: () => new Date("2026-08-13T10:00:00.000Z")
  });
  return { service, audit, setCommitFailure(value) { commitFailure = value; } };
}

(async () => {
  const fixture = createFixture();
  await fixture.service.initialize();
  const active = await fixture.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: ["366"], confirmations: { mapAndStructures: true, resourcesAndValues: true } });
  assert.strictEqual(active.seasonId, "season-1");
  const records = fixture.audit.listRecords();
  assert.strictEqual(records.length, 1);
  assert.deepStrictEqual(records[0], {
    auditId: "audit-activation", transactionId: "tx-activation", sequence: 1,
    actionType: "season_activated", targetType: "season_administration", targetId: "season-1",
    seasonId: "season-1", serverId: null, actorId: "desktop-user", recordedAt: "2026-08-13T10:00:00.000Z", outcome: "accepted", details: {}
  });
  console.log("PASS reachable activation appends exactly one audit record");

  const denied = createFixture({ authorizationPolicyService: { requireAuthorized() { const error = new Error("denied"); error.code = "authorization_denied"; throw error; } } });
  await denied.service.initialize();
  await assert.rejects(() => denied.service.activateSeason({ actorId: "viewer" }, { seasonId: "season-1", serverIds: ["366"], confirmations: { mapAndStructures: true, resourcesAndValues: true } }), /denied/);
  assert.deepStrictEqual(denied.audit.listRecords(), []);
  console.log("PASS authorization failure creates no audit");

  const invalid = createFixture();
  await invalid.service.initialize();
  await assert.rejects(() => invalid.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: [], confirmations: { mapAndStructures: true, resourcesAndValues: true } }), /serverIds/);
  assert.strictEqual(invalid.service.getActiveSeason(), null);
  assert.deepStrictEqual(invalid.audit.listRecords(), []);
  console.log("PASS invalid activation creates no state or audit");

  const alreadyActive = createFixture();
  await alreadyActive.service.initialize();
  await alreadyActive.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: ["366"], confirmations: { mapAndStructures: true, resourcesAndValues: true } });
  await assert.rejects(() => alreadyActive.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: ["367"], confirmations: { mapAndStructures: true, resourcesAndValues: true } }), /already active/);
  assert.strictEqual(alreadyActive.audit.listRecords().length, 1);
  console.log("PASS already-active rejection creates no additional audit");

  const auditFailure = createFixture({ validateAuditRecord: () => ({ valid: false, errors: [{ code: "AUDIT_REJECTED", message: "audit invalid" }], warnings: [] }) });
  await auditFailure.service.initialize();
  await assert.rejects(() => auditFailure.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: ["366"], confirmations: { mapAndStructures: true, resourcesAndValues: true } }), /Audit validator rejected/);
  assert.strictEqual(auditFailure.service.getActiveSeason(), null);
  assert.deepStrictEqual(auditFailure.audit.listRecords(), []);
  console.log("PASS audit validation failure rolls back activation");

  const overrideAudit = createFixture();
  await overrideAudit.service.initialize();
  const overrideCoordinator = createApplicationMutationCoordinator({ participants: [overrideAudit.service, overrideAudit.audit], auditRecordService: overrideAudit.audit, createTransactionId: () => "system-tx" });
  await assert.rejects(() => overrideCoordinator.execute(() => overrideAudit.service.getActiveSeason(), async () => {}, { actionType: "season_activated", targetType: "season_administration", targetId: "season-1", actorId: "desktop-user", details: {}, transactionId: "forged-tx", sequence: 999, auditId: "forged-audit", recordedAt: "2000-01-01T00:00:00.000Z" }), /system-controlled/);
  assert.deepStrictEqual(overrideAudit.audit.listRecords(), []);
  console.log("PASS caller audit metadata is rejected before system assignment");

  const failed = createFixture();
  await failed.service.initialize();
  failed.setCommitFailure(true);
  await assert.rejects(() => failed.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: ["366"], confirmations: { mapAndStructures: true, resourcesAndValues: true } }), /generation commit failed/);
  assert.strictEqual(failed.service.getActiveSeason(), null);
  assert.deepStrictEqual(failed.audit.listRecords(), []);
  console.log("PASS generation failure rolls back activation and audit");
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-activation-audit-real-"));
  try {
    const store = createGenerationStore({ baseDirectory: directory });
    const real = createFixture();
    await real.service.initialize();
    await real.service.activateSeason({ actorId: "desktop-user" }, { seasonId: "season-1", serverIds: ["366"], confirmations: { mapAndStructures: true, resourcesAndValues: true } });
    const record = real.audit.listRecords()[0];
    await store.commit({ expectedGeneration: 0, transactionId: "real-tx", createdAt: "2026-08-13T10:00:00.000Z", documents: [{ documentId: "season-administration", scope: "global", type: "season-administration", value: real.service.captureTransactionState() }, { documentId: "application-audit-global", scope: "global", type: "application-audit", value: { schemaVersion: 1, records: real.audit.listRecords() } }] });
    const reopened = await createGenerationStore({ baseDirectory: directory }).loadCommittedGeneration();
    const activationDocument = reopened.documents.find((document) => document.documentId === "season-administration").value;
    const auditDocument = reopened.documents.find((document) => document.documentId === "application-audit-global").value;
    assert.strictEqual(activationDocument.activeSeason.seasonId, "season-1");
    assert.deepStrictEqual(auditDocument.records[0], record);
    console.log("PASS real GenerationStore reopens activation and audit together");
  } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
  console.log("8 season activation audit scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
