const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createApplicationPersistenceCoordinator } = require("../src/services/application-persistence-coordinator.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationAuditRecordService } = require("../src/services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../src/services/application-audit-record-validator.js");
const { createApplicationAuditRecordSerializer } = require("../src/services/application-audit-record-serializer.js");

function participant(value) {
  return { value, captureTransactionState() { return structuredClone(this.value); }, restoreTransactionState(snapshot) { this.value = structuredClone(snapshot); } };
}
function context(generationResult, auditDocument) {
  const live = participant("before");
  const audit = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord, validateAuditHistory, createAuditId: () => "audit-1", clock: () => new Date("2026-08-13T10:00:00.000Z") });
  const serializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
  const coordinator = createApplicationPersistenceCoordinator({
    generationStore: {
      async loadCommittedGeneration() { return generationResult; },
      async commit() { return { generation: 2 }; }
    },
    mutationCoordinator: createApplicationMutationCoordinator({ participants: [live, audit] }),
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    serializeDocuments: async () => [], deserializeDocuments: async (documents) => ({ value: documents, audit: auditDocument }),
    applyState: async (state) => { live.value = state.value; audit.restoreTransactionState(state.audit ? state.audit.records : []); },
    clock: () => new Date("2026-08-13T10:00:00.000Z"), createTransactionId: () => "tx"
  });
  return { coordinator, live, audit, serializer };
}

(async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-audit-generation-"));
  try {
    const store = createGenerationStore({ baseDirectory: directory });
    const audit = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord, validateAuditHistory, createAuditId: () => "audit-real", clock: () => new Date("2026-08-13T10:00:00.000Z") });
    const serializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
    const original = audit.append({ transactionId: "tx-real", sequence: 1, actionType: "snapshot_confirmed", targetType: "snapshot", targetId: "snapshot-real", seasonId: "season-1", serverId: "server-366", actorId: "desktop-user", details: { accepted: true } });
    await store.commit({ expectedGeneration: 0, transactionId: "tx-real", createdAt: "2026-08-13T10:00:00.000Z", documents: [{ documentId: "application-audit-global", scope: "global", type: "application-audit", value: serializer.serializeRecords(audit.listRecords()) }] });
    const reopenedStore = createGenerationStore({ baseDirectory: directory });
    const loaded = await reopenedStore.loadCommittedGeneration();
    const restored = serializer.deserializeEnvelope(loaded.documents.find((document) => document.documentId === "application-audit-global").value);
    assert.deepStrictEqual(restored.records[0], original);
    assert.strictEqual(loaded.documents.filter((document) => document.documentId === "application-audit-global").length, 1);
    console.log("PASS real GenerationStore audit close/reopen round-trip");
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }

  const missing = context({ status: "committed", source: "current", manifest: { generation: 1 }, documents: [] });
  const missingResult = await missing.coordinator.load({});
  assert.strictEqual(missingResult.status, "committed");
  assert.deepStrictEqual(missing.audit.listRecords(), []);
  console.log("PASS missing audit document loads as empty history");

  const malformed = context({ status: "committed", source: "current", manifest: { generation: 1 }, documents: [] }, { schemaVersion: 1, records: [{ bad: true }] });
  let applied = false;
  malformed.coordinator = createApplicationPersistenceCoordinator({
    generationStore: { async loadCommittedGeneration() { return { status: "committed", source: "current", manifest: { generation: 1 }, documents: [] }; }, async commit() { return { generation: 2 }; } },
    mutationCoordinator: createApplicationMutationCoordinator({ participants: [malformed.live, malformed.audit] }),
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    serializeDocuments: async () => [], deserializeDocuments: async () => { throw new Error("malformed audit document"); },
    applyState: async () => { applied = true; }, clock: () => new Date("2026-08-13T10:00:00.000Z"), createTransactionId: () => "tx"
  });
  const recovery = await malformed.coordinator.load({});
  assert.deepStrictEqual(recovery, { status: "recovery_required", reason: "generation_document_invalid" });
  assert.strictEqual(applied, false);
  console.log("PASS malformed audit document blocks adoption");

  const rollback = context({ status: "missing" });
  await rollback.coordinator.load({});
  rollback.audit.append({ transactionId: "tx-1", sequence: 1, actionType: "snapshot_confirmed", targetType: "snapshot", targetId: "snapshot-1", actorId: "desktop-user", details: {} });
  const before = rollback.audit.captureTransactionState();
  rollback.live.value = "changed";
  const mutation = createApplicationMutationCoordinator({ participants: [rollback.live, rollback.audit] });
  await assert.rejects(() => mutation.execute(() => { rollback.live.value = "new"; }, async () => { throw new Error("commit failed"); }), /commit failed/);
  assert.deepStrictEqual(rollback.audit.captureTransactionState(), before);
  console.log("PASS audit participant rolls back with mutation failure");

  const generationFailure = context({ status: "missing" });
  await generationFailure.coordinator.load({});
  generationFailure.audit.append({ transactionId: "tx-existing", sequence: 1, actionType: "snapshot_confirmed", targetType: "snapshot", targetId: "snapshot-existing", actorId: "desktop-user", details: {} });
  const auditBeforeGenerationFailure = generationFailure.audit.captureTransactionState();
  const failingCoordinator = createApplicationPersistenceCoordinator({
    generationStore: { async loadCommittedGeneration() { return { status: "missing" }; }, async commit() { throw new Error("generation commit failed"); } },
    mutationCoordinator: createApplicationMutationCoordinator({ participants: [generationFailure.live, generationFailure.audit] }),
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    serializeDocuments: async () => [], deserializeDocuments: async () => ({}), applyState: async () => {},
    clock: () => new Date("2026-08-13T10:00:00.000Z"), createTransactionId: () => "tx-failure"
  });
  await failingCoordinator.load({});
  await assert.rejects(() => failingCoordinator.execute(() => { generationFailure.live.value = "mutated"; }), /generation commit failed/);
  assert.deepStrictEqual(generationFailure.audit.captureTransactionState(), auditBeforeGenerationFailure);
  assert.strictEqual(generationFailure.live.value, "before");
  console.log("PASS generation commit failure restores audit and other participants");
  console.log("3 audit generation integration scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
