(function initializeWarMapApplicationPersistenceComposition(globalScope) {
  function createWarMapApplicationPersistenceCoordinator(options) {
    const input = options || {};
    const required = [
      "generationStore", "mutationCoordinator", "legacyStateClassifier", "unionRegistryService",
      "strategicDomainRuntime", "evidenceDomainRuntime", "serverStateService", "seasonAdministrationService",
      "applicationAuditRecordService", "serializeApplicationAuditRecords", "deserializeApplicationAuditEnvelope",
      "serializeUnionRegistry", "deserializeUnionRegistryEnvelope",
      "serializeStrategicDomainRuntime", "deserializeStrategicDomainEnvelope",
      "serializeEvidenceRuntime", "deserializeEvidenceEnvelope",
      "serializeServerState", "deserializeServerState", "createTransactionId", "clock"
      , "createApplicationPersistenceCoordinator"
    ];
    required.forEach((field) => { if (typeof input[field] === "undefined") throw new TypeError(`Missing ${field}.`); });
    const provenanceState = input.ownershipHistoryProvenanceStateService || null;
    const provenanceSerializer = input.ownershipHistoryProvenanceSerializer || null;

    function serializeDocuments() {
      const clockValue = input.clock();
      const savedAt = clockValue instanceof Date ? clockValue.toISOString() : clockValue;
      const documents = [
        { documentId: "union-registry-global", scope: "global", type: "union-registry", value: input.serializeUnionRegistry(input.unionRegistryService, savedAt) },
        { documentId: `strategic-${input.seasonId}`, scope: input.seasonId, type: "strategic-domain", value: input.serializeStrategicDomainRuntime(input.strategicDomainRuntime, input.seasonId, savedAt) },
        { documentId: `evidence-${input.seasonId}`, scope: input.seasonId, type: "evidence-domain", value: input.serializeEvidenceRuntime(input.evidenceDomainRuntime, savedAt) },
        { documentId: `projection-${input.seasonId}-${input.baseMapId}`, scope: `${input.seasonId}/${input.baseMapId}`, type: "server-state", value: input.serializeServerState(input.serverStateService, savedAt) }
        , { documentId: "season-administration", scope: "global", type: "season-administration", value: input.seasonAdministrationService.captureTransactionState() }
        , { documentId: "application-audit-global", scope: "global", type: "application-audit", value: input.serializeApplicationAuditRecords(input.applicationAuditRecordService.listRecords()) }
      ];
      if (provenanceState && provenanceSerializer && provenanceState.isPresent()) {
        documents.push({ documentId: provenanceSerializer.createDocumentId(input.seasonId, input.baseMapId), scope: `${input.seasonId}/${input.baseMapId}`, type: "ownership-history-provenance", value: provenanceState.serialize() });
      }
      return documents;
    }

    async function deserializeDocuments(documents) {
      const values = Object.fromEntries(documents.map((document) => [document.documentId, document.value]));
      const provenanceDocumentId = provenanceSerializer ? provenanceSerializer.createDocumentId(input.seasonId, input.baseMapId) : null;
      return {
        unionRegistry: input.deserializeUnionRegistryEnvelope(values["union-registry-global"]),
        strategicDomain: input.deserializeStrategicDomainEnvelope(values[`strategic-${input.seasonId}`]),
        evidenceDomain: input.deserializeEvidenceEnvelope(values[`evidence-${input.seasonId}`]),
        serverState: input.deserializeServerState(values[`projection-${input.seasonId}-${input.baseMapId}`])
        , seasonAdministration: values["season-administration"] || { schemaVersion: 2, activeSeason: null, completedSeasons: [] }
        , applicationAudit: values["application-audit-global"] ? input.deserializeApplicationAuditEnvelope(values["application-audit-global"]) : { schemaVersion: 1, records: [] }
        , ownershipHistoryProvenance: provenanceState && provenanceSerializer ? (Object.prototype.hasOwnProperty.call(values, provenanceDocumentId) ? provenanceSerializer.deserialize(values[provenanceDocumentId], { seasonId: input.seasonId, baseMapId: input.baseMapId, activeSeasonId: input.seasonId }) : { status: "unknown_provenance", seasonId: input.seasonId, baseMapId: input.baseMapId, records: [] }) : null
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
      state.serverState.servers.forEach((server) => {
        if (!input.serverStateService.hasServer(server.id)) {
          input.serverStateService.registerServer({ id: server.id, label: server.label || server.id });
        }
      });
      input.serverStateService.replaceTerritoryOwnership(Object.fromEntries(state.serverState.servers.map((server) => [server.id, server.ownership])));
      input.seasonAdministrationService.restoreTransactionState(state.seasonAdministration);
      input.applicationAuditRecordService.restoreTransactionState(state.applicationAudit.records);
      if (provenanceState && state.ownershipHistoryProvenance) provenanceState.restoreState(state.ownershipHistoryProvenance.status === "present" ? { status: "present", document: state.ownershipHistoryProvenance.document } : { status: "unknown_provenance" });
    }

    return input.createApplicationPersistenceCoordinator({
      generationStore: input.generationStore,
      mutationCoordinator: input.mutationCoordinator,
      legacyStateClassifier: input.legacyStateClassifier,
      serializeDocuments,
      deserializeDocuments,
      applyState,
      clock: input.clock,
      createTransactionId: input.createTransactionId,
      ownershipProjectionReplacementCoordinator: input.ownershipProjectionReplacementCoordinator
    });
  }

  globalScope.createWarMapApplicationPersistenceCoordinator = createWarMapApplicationPersistenceCoordinator;
  if (typeof module !== "undefined" && module.exports) module.exports = { createWarMapApplicationPersistenceCoordinator };
}(typeof window !== "undefined" ? window : globalThis));
