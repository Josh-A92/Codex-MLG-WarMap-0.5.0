(function initializeEvidenceDomainPersistenceServiceFactory(globalScope) {
  const FIELDS = new Set([
    "storageAdapter",
    "stateSerializer",
    "createEvidenceDomainRuntime",
    "modules",
    "clock"
  ]);
  const STORAGE_IDENTITY = Object.freeze({
    scope: "evidence_domain",
    domainId: "global"
  });

  class EvidenceDomainPersistenceServiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "EvidenceDomainPersistenceServiceError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new EvidenceDomainPersistenceServiceError(code, message, cause);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireOptions(value) {
    if (!isObject(value)) fail("invalid_factory", "Evidence Domain Persistence Service requires options.");
    const unknown = Object.keys(value).filter((field) => !FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unknown option '${unknown[0]}'.`);
    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_factory", `Evidence Domain Persistence Service requires options.${field}.`);
      }
    });
    return value;
  }

  function bind(owner, method, path) {
    if (typeof method !== "function") {
      fail("invalid_factory", `Evidence Domain Persistence Service requires ${path}.`);
    }
    return method.bind(owner);
  }

  function createEvidenceDomainPersistenceService(options) {
    const input = requireOptions(options);
    if (!isObject(input.storageAdapter)) {
      fail("invalid_factory", "Evidence Domain Persistence Service requires options.storageAdapter.");
    }
    if (!isObject(input.stateSerializer)) {
      fail("invalid_factory", "Evidence Domain Persistence Service requires options.stateSerializer.");
    }
    if (!isObject(input.modules)) {
      fail("invalid_factory", "Evidence Domain Persistence Service requires options.modules.");
    }
    const loadEnvelope = bind(
      input.storageAdapter,
      input.storageAdapter.loadEnvelope,
      "options.storageAdapter.loadEnvelope"
    );
    const saveEnvelope = bind(
      input.storageAdapter,
      input.storageAdapter.saveEnvelope,
      "options.storageAdapter.saveEnvelope"
    );
    const serializeRuntime = bind(
      input.stateSerializer,
      input.stateSerializer.serializeRuntime,
      "options.stateSerializer.serializeRuntime"
    );
    const deserializeEnvelope = bind(
      input.stateSerializer,
      input.stateSerializer.deserializeEnvelope,
      "options.stateSerializer.deserializeEnvelope"
    );
    const createRuntime = bind(
      input,
      input.createEvidenceDomainRuntime,
      "options.createEvidenceDomainRuntime"
    );
    const clock = bind(input, input.clock, "options.clock");

    function storageIdentity() {
      return { ...STORAGE_IDENTITY };
    }

    async function load() {
      let stored;
      try {
        stored = await loadEnvelope(storageIdentity());
      } catch (error) {
        fail("storage_load_failed", "Evidence Domain Persistence Service could not load storage.", error);
      }
      if (stored === null || stored === undefined) {
        try {
          return {
            status: "missing",
            runtime: createRuntime({
              modules: input.modules,
              initialState: { assets: [], evidenceRecords: [] }
            })
          };
        } catch (error) {
          fail("runtime_creation_failed", "Evidence Domain Persistence Service could not create empty runtime.", error);
        }
      }
      let envelope;
      try {
        envelope = deserializeEnvelope(stored);
      } catch (error) {
        fail("stored_evidence_invalid", "Stored evidence domain data is invalid.", error);
      }
      try {
        return {
          status: "restored",
          savedAt: envelope.savedAt,
          runtime: createRuntime({
            modules: input.modules,
            initialState: {
              assets: envelope.assets,
              evidenceRecords: envelope.evidenceRecords
            }
          })
        };
      } catch (error) {
        fail("stored_evidence_invalid", "Stored evidence domain histories are invalid.", error);
      }
    }

    async function save(runtime) {
      let now;
      try {
        now = clock();
      } catch (error) {
        fail("invalid_clock", "Evidence Domain Persistence Service clock failed.", error);
      }
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        fail("invalid_clock", "Evidence Domain Persistence Service clock must return a valid Date.");
      }
      let envelope;
      try {
        envelope = serializeRuntime(runtime, now.toISOString());
      } catch (error) {
        fail("serialization_failed", "Evidence Domain Persistence Service could not serialize runtime.", error);
      }
      try {
        await saveEnvelope(storageIdentity(), envelope);
      } catch (error) {
        fail("storage_save_failed", "Evidence Domain Persistence Service could not save storage.", error);
      }
      return { status: "saved", savedAt: envelope.savedAt };
    }

    return { load, save };
  }

  const exportsObject = {
    createEvidenceDomainPersistenceService,
    EvidenceDomainPersistenceServiceError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
