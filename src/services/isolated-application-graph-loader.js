(function initializeIsolatedApplicationGraphLoader(globalScope) {
  const FACTORY_FIELDS = new Set(["createFreshServices", "createApplicationDocumentCodec"]);

  class IsolatedApplicationGraphLoaderError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "IsolatedApplicationGraphLoaderError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new IsolatedApplicationGraphLoaderError(code, message, cause);
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

  function freeze(value) {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => freeze(value[key]));
    return Object.freeze(value);
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

  function requireParticipant(value, path) {
    if (!isRecord(value) || typeof value.captureTransactionState !== "function") {
      fail("invalid_services", `${path} must expose captureTransactionState.`);
    }
    return value;
  }

  function createIsolatedApplicationGraphLoader(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    const createFreshServices = requireFunction(options.createFreshServices, "options.createFreshServices");
    const createApplicationDocumentCodec = requireFunction(options.createApplicationDocumentCodec, "options.createApplicationDocumentCodec");

    async function load(input) {
      if (!isRecord(input) || !Array.isArray(input.documents)) fail("invalid_input", "input.documents must be an array.");
      let fresh;
      try {
        fresh = await createFreshServices();
        if (!isRecord(fresh) || !isRecord(fresh.codecOptions) || !isRecord(fresh.services)) fail("invalid_services", "createFreshServices must return services and codecOptions.");
        const codec = createApplicationDocumentCodec({ ...fresh.codecOptions, services: fresh.services });
        const state = await codec.deserializeDocuments(input.documents);
        await codec.applyState(state);
        const participants = {
          unionRegistryService: requireParticipant(fresh.services.unionRegistryService, "services.unionRegistryService"),
          strategicDomainRuntime: fresh.services.strategicDomainRuntime,
          evidenceDomainRuntime: fresh.services.evidenceDomainRuntime,
          serverStateService: requireParticipant(fresh.services.serverStateService, "services.serverStateService"),
          seasonAdministrationService: requireParticipant(fresh.services.seasonAdministrationService, "services.seasonAdministrationService"),
          applicationAuditRecordService: requireParticipant(fresh.services.applicationAuditRecordService, "services.applicationAuditRecordService")
        };
        const strategicServices = ["relationService", "nativeAssignmentService", "activeStatusService", "combatStrengthObservationService", "serverObservationService", "ownershipRecordService", "targetVerificationService", "confirmedSnapshotService", "activityFactHistoryService"];
        const evidenceServices = ["evidenceAssetService", "evidenceRecordService"];
        strategicServices.forEach((name) => requireParticipant(participants.strategicDomainRuntime[name], `services.strategicDomainRuntime.${name}`));
        evidenceServices.forEach((name) => requireParticipant(participants.evidenceDomainRuntime[name], `services.evidenceDomainRuntime.${name}`));
        const snapshot = {
          unionRegistry: participants.unionRegistryService.captureTransactionState(),
          strategicDomain: Object.fromEntries(strategicServices.map((name) => [name, participants.strategicDomainRuntime[name].captureTransactionState()])),
          evidenceDomain: Object.fromEntries(evidenceServices.map((name) => [name, participants.evidenceDomainRuntime[name].captureTransactionState()])),
          serverState: participants.serverStateService.captureTransactionState(),
          serverStateDocument: clone(state.serverState),
          seasonAdministration: participants.seasonAdministrationService.captureTransactionState(),
          applicationAudit: participants.applicationAuditRecordService.captureTransactionState()
        };
        if (fresh.services.ownershipHistoryProvenanceStateService && typeof fresh.services.ownershipHistoryProvenanceStateService.captureTransactionState === "function") {
          snapshot.ownershipHistoryProvenance = fresh.services.ownershipHistoryProvenanceStateService.captureTransactionState();
        }
        return freeze(clone({ status: "loaded", state: snapshot }));
      } catch (error) {
        if (error instanceof IsolatedApplicationGraphLoaderError) throw error;
        fail("graph_load_failed", "Isolated application graph could not be loaded.", error);
      }
    }

    return Object.freeze({ load });
  }

  const exportsObject = { createIsolatedApplicationGraphLoader, IsolatedApplicationGraphLoaderError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
