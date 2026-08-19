(function initializeWarMapApplicationPersistenceComposition(globalScope) {
  const codecExports = typeof globalScope.createApplicationDocumentCodec === "function"
    ? globalScope
    : (typeof require === "function" ? require("./application-document-codec.js") : {});

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
    if (typeof codecExports.createApplicationDocumentCodec !== "function") throw new TypeError("Missing application document codec.");
    const documentCodec = codecExports.createApplicationDocumentCodec({
      seasonId: input.seasonId,
      baseMapId: input.baseMapId,
      services: {
        unionRegistryService: input.unionRegistryService,
        strategicDomainRuntime: input.strategicDomainRuntime,
        evidenceDomainRuntime: input.evidenceDomainRuntime,
        serverStateService: input.serverStateService,
        seasonAdministrationService: input.seasonAdministrationService,
        applicationAuditRecordService: input.applicationAuditRecordService,
        ownershipHistoryProvenanceStateService: provenanceState
      },
      provenanceSerializer,
      deserializeUnionRegistryEnvelope: input.deserializeUnionRegistryEnvelope,
      deserializeStrategicDomainEnvelope: input.deserializeStrategicDomainEnvelope,
      deserializeEvidenceEnvelope: input.deserializeEvidenceEnvelope,
      deserializeServerState: input.deserializeServerState,
      deserializeApplicationAuditEnvelope: input.deserializeApplicationAuditEnvelope
    });

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

    return input.createApplicationPersistenceCoordinator({
      generationStore: input.generationStore,
      mutationCoordinator: input.mutationCoordinator,
      legacyStateClassifier: input.legacyStateClassifier,
      seasonAdministrationService: input.seasonAdministrationService,
      serializeDocuments,
      deserializeDocuments: documentCodec.deserializeDocuments,
      applyState: documentCodec.applyState,
      clock: input.clock,
      createTransactionId: input.createTransactionId,
      ownershipProjectionReplacementCoordinator: input.ownershipProjectionReplacementCoordinator,
      legacyWrite: input.legacyWrite
    });
  }

  globalScope.createWarMapApplicationPersistenceCoordinator = createWarMapApplicationPersistenceCoordinator;
  if (typeof module !== "undefined" && module.exports) module.exports = { createWarMapApplicationPersistenceCoordinator };
}(typeof window !== "undefined" ? window : globalThis));
