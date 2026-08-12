(function initializeWarMapApplicationPersistenceComposition(globalScope) {
  function createWarMapApplicationPersistenceCoordinator(options) {
    const input = options || {};
    const required = [
      "generationStore", "mutationCoordinator", "legacyStateClassifier", "unionRegistryService",
      "strategicDomainRuntime", "evidenceDomainRuntime", "serverStateService",
      "serializeUnionRegistry", "deserializeUnionRegistryEnvelope",
      "serializeStrategicDomainRuntime", "deserializeStrategicDomainEnvelope",
      "serializeEvidenceRuntime", "deserializeEvidenceEnvelope",
      "serializeServerState", "deserializeServerState", "createTransactionId", "clock"
      , "createApplicationPersistenceCoordinator"
    ];
    required.forEach((field) => { if (typeof input[field] === "undefined") throw new TypeError(`Missing ${field}.`); });

    function serializeDocuments() {
      const clockValue = input.clock();
      const savedAt = clockValue instanceof Date ? clockValue.toISOString() : clockValue;
      return [
        { documentId: "union-registry-global", scope: "global", type: "union-registry", value: input.serializeUnionRegistry(input.unionRegistryService, savedAt) },
        { documentId: `strategic-${input.seasonId}`, scope: input.seasonId, type: "strategic-domain", value: input.serializeStrategicDomainRuntime(input.strategicDomainRuntime, input.seasonId, savedAt) },
        { documentId: `evidence-${input.seasonId}`, scope: input.seasonId, type: "evidence-domain", value: input.serializeEvidenceRuntime(input.evidenceDomainRuntime, savedAt) },
        { documentId: `projection-${input.seasonId}-${input.baseMapId}`, scope: `${input.seasonId}/${input.baseMapId}`, type: "server-state", value: input.serializeServerState(input.serverStateService, savedAt) }
      ];
    }

    async function deserializeDocuments(documents) {
      const values = Object.fromEntries(documents.map((document) => [document.documentId, document.value]));
      return {
        unionRegistry: input.deserializeUnionRegistryEnvelope(values["union-registry-global"]),
        strategicDomain: input.deserializeStrategicDomainEnvelope(values[`strategic-${input.seasonId}`]),
        evidenceDomain: input.deserializeEvidenceEnvelope(values[`evidence-${input.seasonId}`]),
        serverState: input.deserializeServerState(values[`projection-${input.seasonId}-${input.baseMapId}`])
      };
    }

    async function applyState(state) {
      input.unionRegistryService.restoreTransactionState(state.unionRegistry.identities);
      input.strategicDomainRuntime.relationService.restoreTransactionState(state.strategicDomain.state.relations);
      input.strategicDomainRuntime.nativeAssignmentService.restoreTransactionState(state.strategicDomain.state.nativeAssignments);
      input.strategicDomainRuntime.activeStatusService.restoreTransactionState(state.strategicDomain.state.activeStatuses);
      input.strategicDomainRuntime.combatStrengthObservationService.restoreTransactionState(state.strategicDomain.state.combatStrengthObservations);
      input.strategicDomainRuntime.serverObservationService.restoreTransactionState(state.strategicDomain.state.serverObservations);
      input.strategicDomainRuntime.ownershipRecordService.restoreTransactionState({
        territoryRecords: state.strategicDomain.state.territoryOwnershipRecords,
        structureRecords: state.strategicDomain.state.structureOwnershipRecords
      });
      input.strategicDomainRuntime.targetVerificationService.restoreTransactionState(state.strategicDomain.state.targetVerifications);
      input.strategicDomainRuntime.confirmedSnapshotService.restoreTransactionState(state.strategicDomain.state.confirmedSnapshots);
      input.strategicDomainRuntime.activityFactHistoryService.restoreTransactionState({
        confirmedPresenceFacts: state.strategicDomain.state.confirmedPresenceFacts,
        qualifyingFullMapConfirmations: state.strategicDomain.state.qualifyingFullMapConfirmations
      });
      input.evidenceDomainRuntime.evidenceAssetService.restoreTransactionState(state.evidenceDomain.assets);
      input.evidenceDomainRuntime.evidenceRecordService.restoreTransactionState(state.evidenceDomain.evidenceRecords);
      input.serverStateService.replaceTerritoryOwnership(Object.fromEntries(state.serverState.servers.map((server) => [server.id, server.ownership])));
    }

    return input.createApplicationPersistenceCoordinator({
      generationStore: input.generationStore,
      mutationCoordinator: input.mutationCoordinator,
      legacyStateClassifier: input.legacyStateClassifier,
      serializeDocuments,
      deserializeDocuments,
      applyState,
      clock: input.clock,
      createTransactionId: input.createTransactionId
    });
  }

  globalScope.createWarMapApplicationPersistenceCoordinator = createWarMapApplicationPersistenceCoordinator;
  if (typeof module !== "undefined" && module.exports) module.exports = { createWarMapApplicationPersistenceCoordinator };
}(typeof window !== "undefined" ? window : globalThis));
