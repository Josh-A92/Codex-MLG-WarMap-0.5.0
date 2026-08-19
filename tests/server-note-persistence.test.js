const assert = require("assert");
const { createServerObservationService } = require("../src/services/server-observation-service.js");
const { validateServerObservation, validateServerObservationHistory } = require("../src/services/server-observation-validator.js");
const { createServerIntelligenceManagementService } = require("../src/services/server-intelligence-management-service.js");
const { createApplicationAuditRecordService } = require("../src/services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../src/services/application-audit-record-validator.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");

async function run() {
  let domainId = 0;
  let auditId = 0;
  let transactionId = 0;
  const clockText = "2026-08-19T12:00:00.000Z";
  const observations = createServerObservationService({
    initialObservations: [],
    validateServerObservation,
    validateServerObservationHistory,
    clock: () => new Date(clockText)
  });
  const audit = createApplicationAuditRecordService({
    initialRecords: [],
    validateAuditRecord,
    validateAuditHistory,
    createAuditId: () => `audit-${++auditId}`,
    clock: () => new Date(clockText)
  });
  const management = createServerIntelligenceManagementService({
    authorizationPolicyService: {
      requireAuthorized(actor) { return { actorId: actor.actorId }; }
    },
    unionRegistryService: { getUnionIdentity() { return null; } },
    relationService: { hasRelation() { return false; }, addKnownUnion() {} },
    nativeAssignmentService: { addConfirmedManualAssignment() {} },
    combatStrengthObservationService: { addObservation() {} },
    serverObservationService: observations,
    ownershipRecordService: {
      addConfirmedManualTerritoryRecord() {},
      addConfirmedManualStructureRecord() {}
    },
    clock: () => clockText,
    createId: (kind) => `${kind}-${++domainId}`
  });
  const coordinator = createApplicationMutationCoordinator({
    participants: [observations, audit],
    auditRecordService: audit,
    createTransactionId: () => `transaction-${++transactionId}`
  });
  const actor = { actorId: "desktop-user" };
  const auditIntent = (actionType, details) => ({
    actionType,
    targetType: "server_observation",
    targetId: "server-note:server-366",
    seasonId: "season-1",
    serverId: "server-366",
    actorId: actor.actorId,
    details
  });

  const created = await coordinator.execute(
    () => management.recordManualServerObservation(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      text: "Eastern sector is obscured.",
      evidenceIds: []
    }),
    async () => {},
    auditIntent("server_observation_confirmed", { text: "Eastern sector is obscured." })
  );
  assert.strictEqual(created.reviewState, "confirmed");
  assert.strictEqual(audit.listRecords()[0].transactionId, "transaction-1");

  const correction = {
    seasonId: "season-1",
    serverId: "server-366",
    observationId: created.observationId,
    text: "Eastern sector is visible.",
    reason: "A clearer screenshot supersedes the earlier note."
  };
  await assert.rejects(
    coordinator.execute(
      () => management.correctManualServerObservation(actor, correction),
      async () => { throw new Error("generation commit failed"); },
      auditIntent("server_observation_corrected", {
        correctionOf: created.observationId,
        correctionReason: correction.reason
      })
    ),
    /generation commit failed/
  );
  assert.strictEqual(observations.listObservations().length, 1);
  assert.strictEqual(observations.getObservation(created.observationId).reviewState, "confirmed");
  assert.strictEqual(audit.listRecords().length, 1);

  const corrected = await coordinator.execute(
    () => management.correctManualServerObservation(actor, correction),
    async () => {},
    auditIntent("server_observation_corrected", {
      correctionOf: created.observationId,
      correctionReason: correction.reason
    })
  );
  assert.strictEqual(corrected.superseded.supersededBy, corrected.replacement.observationId);
  assert.strictEqual(audit.listRecords()[1].details.correctionReason, correction.reason);
  assert.strictEqual(audit.listRecords()[1].transactionId, "transaction-3");

  const reopened = createServerObservationService({
    initialObservations: observations.listObservations(),
    validateServerObservation,
    validateServerObservationHistory,
    clock: () => new Date(clockText)
  });
  assert.strictEqual(reopened.getObservation(created.observationId).reviewState, "superseded");
  assert.strictEqual(reopened.getObservation(corrected.replacement.observationId).text, "Eastern sector is visible.");
  console.log("PASS factual server notes persist, correct, audit, roll back, and reopen");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
