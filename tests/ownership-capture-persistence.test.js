const assert = require("assert");
const { createMapOwnershipCoordinator } = require("../src/services/map-ownership-coordinator.js");
const { createAtomicOperationExecutor } = require("../src/services/atomic-operation-executor.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationAuditRecordService } = require("../src/services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../src/services/application-audit-record-validator.js");

function participant(initialValue) {
  return {
    value: structuredClone(initialValue),
    captureTransactionState() { return structuredClone(this.value); },
    restoreTransactionState(snapshot) { this.value = structuredClone(snapshot); }
  };
}

async function run() {
  const relationState = participant([]);
  relationState.hasRelation = () => true;

  const ownershipState = participant({ territory: [], structures: [] });
  ownershipState.listTerritoryRecords = function listTerritoryRecords(filter) {
    return this.value.territory.filter((record) => (
      record.seasonId === filter.seasonId
      && record.serverId === filter.serverId
      && (filter.reviewState === undefined || record.reviewState === filter.reviewState)
    )).map((record) => structuredClone(record));
  };
  ownershipState.listStructureRecords = function listStructureRecords() {
    return [];
  };

  const retractionState = participant([]);
  retractionState.listRetractions = function listRetractions() {
    return this.value.map((record) => structuredClone(record));
  };
  retractionState.addManualRetraction = function addManualRetraction(record) {
    this.value.push(structuredClone(record));
    return structuredClone(record);
  };

  const verificationState = participant([]);
  verificationState.addConfirmedVerification = function addConfirmedVerification(record) {
    this.value.push(structuredClone(record));
    return structuredClone(record);
  };
  verificationState.getCurrentVerification = function getCurrentVerification(serverId, seasonId, targetRef) {
    const record = this.value.find((entry) => (
      entry.serverId === serverId
      && entry.seasonId === seasonId
      && entry.reviewState === "confirmed"
      && entry.supersededBy === null
      && JSON.stringify(entry.targetRef) === JSON.stringify(targetRef)
    ));
    return record ? structuredClone(record) : null;
  };
  verificationState.correctVerification = function correctVerification(verificationId, replacement) {
    const current = this.value.find((entry) => entry.verificationId === verificationId);
    current.reviewState = "superseded";
    current.supersededBy = replacement.verificationId;
    this.value.push(structuredClone(replacement));
    return structuredClone(replacement);
  };

  const projectionState = participant({ "server-366": {} });
  projectionState.replaceTerritoryOwnership = function replaceTerritoryOwnership(next) {
    this.value = structuredClone(next);
  };

  const evidenceState = participant({});
  evidenceState.getEvidenceRecord = function getEvidenceRecord() {
    return null;
  };

  let auditId = 0;
  const auditState = createApplicationAuditRecordService({
    initialRecords: [],
    validateAuditRecord,
    validateAuditHistory,
    createAuditId: () => `audit-${++auditId}`,
    clock: () => new Date("2026-08-19T10:00:00.000Z")
  });

  const management = {
    addKnownUnion() {},
    recordManualTerritoryOwnership(actor, input) {
      const nextRecord = {
        ownershipRecordId: "territory-1",
        ...structuredClone(input),
        effectiveAt: input.eventAt.at,
        sourceType: "manual_entry",
        reviewState: "confirmed",
        actorId: actor.actorId,
        reviewerId: actor.actorId,
        reviewedAt: "2026-08-19T10:00:00.000Z",
        supersededBy: null
      };
      ownershipState.value.territory.push(nextRecord);
      return structuredClone(nextRecord);
    },
    recordManualStructureOwnership() {
      throw new Error("not used");
    }
  };

  const domainAtomic = createAtomicOperationExecutor({
    participants: [relationState, ownershipState, retractionState, verificationState, projectionState, evidenceState]
  });

  const captureCoordinator = createMapOwnershipCoordinator({
    relationService: relationState,
    serverIntelligenceManagementService: management,
    targetVerificationService: verificationState,
    ownershipRecordService: ownershipState,
    ownershipRetractionService: retractionState,
    evidenceRecordService: evidenceState,
    resolveEvidenceScope() {
      return { seasonId: "season-1", serverId: "server-366" };
    },
    seasonAdministrationService: {
      getActiveSeason() {
        return { seasonId: "season-1", serverIds: ["server-366"] };
      }
    },
    serverStateService: projectionState,
    targetCatalog: {
      territoryKeys: [{ row: 1, col: 1 }],
      structures: []
    },
    executeAtomically: domainAtomic.executeAtomically,
    createId() {
      return "verification-1";
    },
    clock() {
      return new Date("2026-08-19T10:00:00.000Z");
    }
  });

  const persistenceCoordinator = createApplicationMutationCoordinator({
    participants: [relationState, ownershipState, retractionState, verificationState, projectionState, evidenceState, auditState],
    auditRecordService: auditState,
    createTransactionId: () => "generated-retraction-transaction"
  });
  const auditIntent = (actionType) => ({
    actionType,
    targetType: "ownership_record",
    targetId: "normal_map_cell:1:1",
    seasonId: "season-1",
    serverId: "server-366",
    actorId: "desktop-user",
    details: { reason: "undo capture" }
  });

  await assert.rejects(
    () => persistenceCoordinator.execute(
      () => captureCoordinator.setTerritoryOwnership({ actorId: "desktop-user" }, {
        seasonId: "season-1",
        serverId: "server-366",
        row: 1,
        col: 1,
        ownerUnionId: "union-1",
        eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" },
        evidenceIds: []
      }),
      async () => {
        throw new Error("generation commit failed");
      }
    ),
    /generation commit failed/
  );

  assert.deepStrictEqual(ownershipState.value, { territory: [], structures: [] });
  assert.deepStrictEqual(retractionState.value, []);
  assert.deepStrictEqual(verificationState.value, []);
  assert.deepStrictEqual(projectionState.value, { "server-366": {} });

  const captured = await captureCoordinator.setTerritoryOwnership({ actorId: "desktop-user" }, {
    seasonId: "season-1",
    serverId: "server-366",
    row: 1,
    col: 1,
    ownerUnionId: "union-1",
    eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" },
    evidenceIds: []
  });
  const retractionInput = {
    seasonId: "season-1",
    serverId: "server-366",
    row: 1,
    col: 1,
    retractedRecordId: captured.record.ownershipRecordId,
    reason: "undo capture"
  };
  await assert.rejects(
    () => persistenceCoordinator.execute(
      (transactionId) => captureCoordinator.retractTerritoryOwnership({ actorId: "desktop-user" }, { ...retractionInput, transactionId }),
      async () => { throw new Error("retraction generation commit failed"); },
      auditIntent("ownership_retracted")
    ),
    /retraction generation commit failed/
  );
  assert.deepStrictEqual(retractionState.value, []);
  assert.deepStrictEqual(auditState.listRecords(), []);
  assert.strictEqual(projectionState.value["server-366"]["1-1"], "union-1");

  await persistenceCoordinator.execute(
    (transactionId) => captureCoordinator.retractTerritoryOwnership({ actorId: "desktop-user" }, { ...retractionInput, transactionId }),
    async () => {},
    auditIntent("ownership_retracted")
  );
  assert.strictEqual(retractionState.value[0].transactionId, "generated-retraction-transaction");
  assert.strictEqual(auditState.listRecords()[0].transactionId, retractionState.value[0].transactionId);
  assert.strictEqual(validateAuditRecord({
    ...auditState.listRecords()[0],
    auditId: "audit-redo",
    actionType: "ownership_redone"
  }).valid, true);
  assert.strictEqual(projectionState.value["server-366"]["1-1"], undefined);

  const conflictBase = {
    ...structuredClone(captured.record),
    reviewState: "confirmed",
    supersededBy: null
  };
  ownershipState.value.territory = [
    { ...structuredClone(conflictBase), ownershipRecordId: "conflict-a", ownerUnionId: "union-a" },
    {
      ...structuredClone(conflictBase),
      ownershipRecordId: "conflict-b",
      ownerUnionId: "union-b",
      eventAt: { precision: "exact", at: "2026-08-19T09:30:00.000Z" },
      effectiveAt: "2026-08-19T09:30:00.000Z",
      reviewedAt: "2026-08-19T10:30:00.000Z"
    }
  ];
  retractionState.value = [];
  projectionState.value = { "server-366": { "1-1": "stale-owner" } };
  const conflictPersistence = createApplicationMutationCoordinator({
    participants: [relationState, ownershipState, retractionState, verificationState, projectionState, evidenceState, auditState],
    auditRecordService: auditState,
    createTransactionId: () => "generated-conflict-transaction"
  });
  const conflictInput = {
    seasonId: "season-1",
    serverId: "server-366",
    kind: "territory",
    retainedRecordId: "conflict-a",
    reason: "Conflict B was a duplicate import."
  };
  const conflictAudit = {
    actionType: "ownership_conflict_resolved",
    targetType: "ownership_record",
    targetId: "ownership-conflict:normal_map_cell:1:1",
    seasonId: "season-1",
    serverId: "server-366",
    actorId: "desktop-user",
    details: { retainedRecordId: "conflict-a", retractedRecordId: "conflict-b", reason: conflictInput.reason }
  };
  await assert.rejects(
    conflictPersistence.execute(
      (transactionId) => captureCoordinator.resolveOwnershipConflict(
        { actorId: "desktop-user" },
        { ...conflictInput, transactionId }
      ),
      async () => { throw new Error("conflict generation commit failed"); },
      conflictAudit
    ),
    /conflict generation commit failed/
  );
  assert.deepStrictEqual(retractionState.value, []);
  assert.strictEqual(projectionState.value["server-366"]["1-1"], "stale-owner");
  assert.strictEqual(auditState.listRecords().length, 1);

  await conflictPersistence.execute(
    (transactionId) => captureCoordinator.resolveOwnershipConflict(
      { actorId: "desktop-user" },
      { ...conflictInput, transactionId }
    ),
    async () => {},
    conflictAudit
  );
  assert.strictEqual(retractionState.value[0].transactionId, "generated-conflict-transaction");
  assert.strictEqual(projectionState.value["server-366"]["1-1"], "union-a");
  const conflictAuditRecord = auditState.listRecords().find((record) => record.actionType === "ownership_conflict_resolved");
  assert.ok(conflictAuditRecord);
  assert.strictEqual(conflictAuditRecord.transactionId, retractionState.value[0].transactionId);
  console.log("PASS ownership capture rolls back on durable persistence failure");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
