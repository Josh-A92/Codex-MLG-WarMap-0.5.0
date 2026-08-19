const assert = require("assert");
const { createMapOwnershipCoordinator } = require("../src/services/map-ownership-coordinator.js");
const { createAtomicOperationExecutor } = require("../src/services/atomic-operation-executor.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");

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

  const projectionState = participant({ "server-366": {} });
  projectionState.replaceTerritoryOwnership = function replaceTerritoryOwnership(next) {
    this.value = structuredClone(next);
  };

  const evidenceState = participant({});
  evidenceState.getEvidenceRecord = function getEvidenceRecord() {
    return null;
  };

  const auditState = participant([]);
  auditState.append = function append(record) {
    this.value.push(structuredClone(record));
    return structuredClone(record);
  };

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
      { actionType: "ownership_retracted", targetType: "ownership_record", targetId: "normal_map_cell:1:1", details: {} }
    ),
    /retraction generation commit failed/
  );
  assert.deepStrictEqual(retractionState.value, []);
  assert.deepStrictEqual(auditState.value, []);
  assert.strictEqual(projectionState.value["server-366"]["1-1"], "union-1");

  await persistenceCoordinator.execute(
    (transactionId) => captureCoordinator.retractTerritoryOwnership({ actorId: "desktop-user" }, { ...retractionInput, transactionId }),
    async () => {},
    { actionType: "ownership_retracted", targetType: "ownership_record", targetId: "normal_map_cell:1:1", details: {} }
  );
  assert.strictEqual(retractionState.value[0].transactionId, "generated-retraction-transaction");
  assert.strictEqual(auditState.value[0].transactionId, retractionState.value[0].transactionId);
  assert.strictEqual(projectionState.value["server-366"]["1-1"], undefined);
  console.log("PASS ownership capture rolls back on durable persistence failure");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
