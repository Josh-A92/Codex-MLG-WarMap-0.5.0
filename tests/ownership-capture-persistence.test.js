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
      && record.reviewState === filter.reviewState
    )).map((record) => structuredClone(record));
  };
  ownershipState.listStructureRecords = function listStructureRecords() {
    return [];
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
    participants: [relationState, ownershipState, verificationState, projectionState, evidenceState]
  });

  const captureCoordinator = createMapOwnershipCoordinator({
    relationService: relationState,
    serverIntelligenceManagementService: management,
    targetVerificationService: verificationState,
    ownershipRecordService: ownershipState,
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
    }
  });

  const persistenceCoordinator = createApplicationMutationCoordinator({
    participants: [relationState, ownershipState, verificationState, projectionState, evidenceState]
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
  assert.deepStrictEqual(verificationState.value, []);
  assert.deepStrictEqual(projectionState.value, { "server-366": {} });
  console.log("PASS ownership capture rolls back on durable persistence failure");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
