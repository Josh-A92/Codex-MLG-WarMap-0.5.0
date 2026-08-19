(function initializeApplicationDocumentCodec(globalScope) {
  const FACTORY_FIELDS = new Set([
    "seasonId",
    "baseMapId",
    "services",
    "provenanceSerializer",
    "deserializeUnionRegistryEnvelope",
    "deserializeStrategicDomainEnvelope",
    "deserializeEvidenceEnvelope",
    "deserializeServerState",
    "deserializeApplicationAuditEnvelope"
  ]);

  class ApplicationDocumentCodecError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "ApplicationDocumentCodecError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new ApplicationDocumentCodecError(code, message, cause);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, {
      value: clone(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    }));
    return output;
  }

  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_factory", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unsupported ${path}.${unknown[0]}.`);
  }

  function requireFunction(value, path) {
    if (typeof value !== "function") fail("invalid_factory", `${path} must be a function.`);
    return value;
  }

  function createApplicationDocumentCodec(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    const seasonId = options.seasonId;
    const baseMapId = options.baseMapId;
    if (typeof seasonId !== "string" || seasonId.trim() === "") fail("invalid_factory", "options.seasonId must be a non-empty string.");
    if (typeof baseMapId !== "string" || baseMapId.trim() === "") fail("invalid_factory", "options.baseMapId must be a non-empty string.");
    if (!isRecord(options.services)) fail("invalid_factory", "options.services must be an object.");
    const services = options.services;
    if (!isRecord(services.strategicDomainRuntime)) fail("invalid_factory", "options.services.strategicDomainRuntime must be an object.");
    if (!isRecord(services.evidenceDomainRuntime)) fail("invalid_factory", "options.services.evidenceDomainRuntime must be an object.");
    const deserializeUnionRegistryEnvelope = options.deserializeUnionRegistryEnvelope;
    const deserializeStrategicDomainEnvelope = options.deserializeStrategicDomainEnvelope;
    const deserializeEvidenceEnvelope = options.deserializeEvidenceEnvelope;
    const deserializeServerState = options.deserializeServerState;
    const deserializeApplicationAuditEnvelope = options.deserializeApplicationAuditEnvelope;
    const provenanceSerializer = options.provenanceSerializer || null;
    const provenanceEnabled = Boolean(provenanceSerializer && services.ownershipHistoryProvenanceStateService);

    async function deserializeDocuments(documents) {
      const values = Object.fromEntries(documents.map((document) => [document.documentId, document.value]));
      const provenanceDocumentId = provenanceSerializer ? provenanceSerializer.createDocumentId(seasonId, baseMapId) : null;
      return {
        unionRegistry: deserializeUnionRegistryEnvelope(values["union-registry-global"]),
        strategicDomain: deserializeStrategicDomainEnvelope(values[`strategic-${seasonId}`]),
        evidenceDomain: deserializeEvidenceEnvelope(values[`evidence-${seasonId}`]),
        serverState: deserializeServerState(values[`projection-${seasonId}-${baseMapId}`]),
        seasonAdministration: values["season-administration"] || { schemaVersion: 2, activeSeason: null, completedSeasons: [] },
        applicationAudit: values["application-audit-global"] ? deserializeApplicationAuditEnvelope(values["application-audit-global"]) : { schemaVersion: 1, records: [] },
        ownershipHistoryProvenance: provenanceEnabled
          ? (Object.prototype.hasOwnProperty.call(values, provenanceDocumentId)
            ? provenanceSerializer.deserialize(values[provenanceDocumentId], { seasonId, baseMapId, activeSeasonId: seasonId })
            : { status: "unknown_provenance", seasonId, baseMapId, records: [] })
          : null
      };
    }

    async function applyState(state) {
      services.unionRegistryService.restoreTransactionState(state.unionRegistry.identities);
      services.strategicDomainRuntime.relationService.restoreTransactionState(state.strategicDomain.state.relations);
      services.strategicDomainRuntime.nativeAssignmentService.restoreTransactionState(state.strategicDomain.state.nativeAssignments);
      services.strategicDomainRuntime.activeStatusService.restoreTransactionState(state.strategicDomain.state.activeStatuses);
      services.strategicDomainRuntime.combatStrengthObservationService.restoreTransactionState(state.strategicDomain.state.combatStrengthObservations);
      services.strategicDomainRuntime.serverObservationService.restoreTransactionState(state.strategicDomain.state.serverObservations);
      services.strategicDomainRuntime.ownershipRecordService.restoreTransactionState({
        territoryRecords: state.strategicDomain.state.territoryOwnershipRecords,
        structureRecords: state.strategicDomain.state.structureOwnershipRecords
      });
      services.strategicDomainRuntime.ownershipRetractionService.restoreTransactionState(
        state.strategicDomain.state.ownershipRetractions
      );
      services.strategicDomainRuntime.targetVerificationService.restoreTransactionState(state.strategicDomain.state.targetVerifications);
      services.strategicDomainRuntime.confirmedSnapshotService.restoreTransactionState(state.strategicDomain.state.confirmedSnapshots);
      services.strategicDomainRuntime.activityFactHistoryService.restoreTransactionState({
        confirmedPresenceFacts: state.strategicDomain.state.confirmedPresenceFacts,
        qualifyingFullMapConfirmations: state.strategicDomain.state.qualifyingFullMapConfirmations
      });
      services.evidenceDomainRuntime.evidenceAssetService.restoreTransactionState(state.evidenceDomain.assets);
      services.evidenceDomainRuntime.evidenceRecordService.restoreTransactionState(state.evidenceDomain.evidenceRecords);
      state.serverState.servers.forEach((server) => {
        if (!services.serverStateService.hasServer(server.id)) {
          services.serverStateService.registerServer({ id: server.id, label: server.label || server.id });
        }
      });
      services.serverStateService.replaceTerritoryOwnership(Object.fromEntries(state.serverState.servers.map((server) => [server.id, server.ownership])));
      services.seasonAdministrationService.restoreTransactionState(state.seasonAdministration);
      services.applicationAuditRecordService.restoreTransactionState(state.applicationAudit.records);
      if (provenanceEnabled && state.ownershipHistoryProvenance) {
        services.ownershipHistoryProvenanceStateService.restoreState(state.ownershipHistoryProvenance.status === "present"
          ? { status: "present", document: state.ownershipHistoryProvenance.document }
          : { status: "unknown_provenance" });
      }
    }

    return Object.freeze({ deserializeDocuments, applyState });
  }

  const exportsObject = { createApplicationDocumentCodec, ApplicationDocumentCodecError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
