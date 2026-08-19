(function initializeStrategicDomainPersistenceServiceFactory(globalScope) {
  const FIELDS = new Set([
    "storageAdapter",
    "serializeStrategicDomainRuntime",
    "deserializeStrategicDomainEnvelope",
    "createStrategicDomainRuntime",
    "modules",
    "clock"
  ]);
  const STATE_FIELDS = [
    "relations", "nativeAssignments", "activeStatuses", "combatStrengthObservations",
    "serverObservations", "territoryOwnershipRecords", "structureOwnershipRecords",
    "ownershipRetractions",
    "targetVerifications", "confirmedSnapshots", "confirmedPresenceFacts",
    "qualifyingFullMapConfirmations"
  ];

  class StrategicDomainPersistenceServiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "StrategicDomainPersistenceServiceError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }
  function fail(code, message, cause) {
    throw new StrategicDomainPersistenceServiceError(code, message, cause);
  }
  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Strategic Domain Persistence Service requires ${path} to be non-empty.`);
    }
    return value;
  }
  function bind(owner, method, path) {
    if (typeof method !== "function") {
      fail("invalid_factory", `Strategic Domain Persistence Service requires ${path}.`);
    }
    return method.bind(owner);
  }

  function createStrategicDomainPersistenceService(options) {
    if (!isObject(options)) fail("invalid_factory", "Strategic Domain Persistence Service requires options.");
    const unknown = Object.keys(options).filter((field) => !FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unknown option '${unknown[0]}'.`);
    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Strategic Domain Persistence Service requires options.${field}.`);
      }
    });
    if (!isObject(options.storageAdapter) || !isObject(options.modules)) {
      fail("invalid_factory", "Strategic Domain Persistence Service requires adapter and modules objects.");
    }
    const loadEnvelope = bind(options.storageAdapter, options.storageAdapter.loadEnvelope, "options.storageAdapter.loadEnvelope");
    const saveEnvelope = bind(options.storageAdapter, options.storageAdapter.saveEnvelope, "options.storageAdapter.saveEnvelope");
    const serialize = bind(options, options.serializeStrategicDomainRuntime, "options.serializeStrategicDomainRuntime");
    const deserialize = bind(options, options.deserializeStrategicDomainEnvelope, "options.deserializeStrategicDomainEnvelope");
    const createRuntime = bind(options, options.createStrategicDomainRuntime, "options.createStrategicDomainRuntime");
    const clock = bind(options, options.clock, "options.clock");

    function requireRegistry(registry) {
      if (!isObject(registry) || typeof registry.getUnionIdentity !== "function") {
        fail("invalid_input", "Strategic Domain Persistence Service requires a Union Registry Service.");
      }
      return registry.getUnionIdentity.bind(registry);
    }
    function storageIdentity(seasonId) {
      return { scope: "strategic_domain", seasonId };
    }
    function emptyState() {
      return STATE_FIELDS.reduce((state, field) => {
        state[field] = [];
        return state;
      }, {});
    }
    function validateUnionReferences(state, getUnionIdentity) {
      if (!isObject(state)) {
        fail("invalid_state_shape", "Strategic state must be an object.");
      }
      STATE_FIELDS.forEach((field) => {
        if (!Array.isArray(state[field])) {
          fail("invalid_state_shape", `Strategic state.${field} must be an array.`);
        }
        state[field].forEach((record, index) => {
          if (!isObject(record)) return;
          ["unionId", "ownerUnionId"].forEach((idField) => {
            if (typeof record[idField] !== "string") return;
            let identity;
            try {
              identity = getUnionIdentity(record[idField]);
            } catch (error) {
              fail(
                "unknown_union_reference",
                `Strategic state ${field}[${index}].${idField} could not be resolved.`,
                error
              );
            }
            if (identity === null || identity === undefined) {
              fail(
                "unknown_union_reference",
                `Strategic state ${field}[${index}].${idField} '${record[idField]}' is unknown.`
              );
            }
          });
        });
      });
    }

    async function load(seasonId, unionRegistryService) {
      const id = requireString(seasonId, "seasonId");
      const getUnionIdentity = requireRegistry(unionRegistryService);
      let stored;
      try {
        stored = await loadEnvelope(storageIdentity(id));
      } catch (error) {
        fail("storage_load_failed", "Strategic Domain Persistence Service could not load storage.", error);
      }
      if (stored === null || stored === undefined) {
        try {
          return {
            status: "missing",
            runtime: createRuntime({
              modules: options.modules,
              unionRegistryService,
              initialState: emptyState()
            })
          };
        } catch (error) {
          fail("runtime_creation_failed", "Strategic Domain Persistence Service could not create empty runtime.", error);
        }
      }
      let envelope;
      try {
        envelope = deserialize(stored);
      } catch (error) {
        fail("stored_state_invalid", "Stored strategic domain envelope is invalid.", error);
      }
      if (envelope.seasonId !== id) {
        fail("season_mismatch", "Stored strategic domain seasonId does not match requested season.");
      }
      try {
        validateUnionReferences(envelope.state, getUnionIdentity);
      } catch (error) {
        if (error instanceof StrategicDomainPersistenceServiceError
            && error.code === "unknown_union_reference") {
          throw error;
        }
        fail("stored_state_invalid", "Stored strategic domain state shape is invalid.", error);
      }
      try {
        return {
          status: "restored",
          savedAt: envelope.savedAt,
          runtime: createRuntime({
            modules: options.modules,
            unionRegistryService,
            initialState: envelope.state
          })
        };
      } catch (error) {
        fail("stored_state_invalid", "Stored strategic domain histories are invalid.", error);
      }
    }

    async function save(runtime, seasonId, unionRegistryService) {
      const id = requireString(seasonId, "seasonId");
      const getUnionIdentity = requireRegistry(unionRegistryService);
      let now;
      try {
        now = clock();
      } catch (error) {
        fail("invalid_clock", "Strategic Domain Persistence Service clock failed.", error);
      }
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        fail("invalid_clock", "Strategic Domain Persistence Service clock must return a valid Date.");
      }
      let envelope;
      try {
        envelope = serialize(runtime, id, now.toISOString());
      } catch (error) {
        fail("serialization_failed", "Strategic Domain Persistence Service could not serialize runtime.", error);
      }
      try {
        validateUnionReferences(envelope.state, getUnionIdentity);
      } catch (error) {
        if (error instanceof StrategicDomainPersistenceServiceError
            && error.code === "unknown_union_reference") {
          throw error;
        }
        fail("serialization_failed", "Serialized strategic domain state shape is invalid.", error);
      }
      try {
        await saveEnvelope(storageIdentity(id), envelope);
      } catch (error) {
        fail("storage_save_failed", "Strategic Domain Persistence Service could not save storage.", error);
      }
      return { status: "saved", savedAt: envelope.savedAt };
    }

    return { load, save };
  }

  const exportsObject = {
    createStrategicDomainPersistenceService,
    StrategicDomainPersistenceServiceError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
