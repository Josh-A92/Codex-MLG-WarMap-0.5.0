(function initializeDataManagementStatePersistenceServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "storageAdapter",
    "serializeUnionRegistry",
    "deserializeUnionRegistryEnvelope",
    "serializeStrategicDomainRuntime",
    "deserializeStrategicDomainEnvelope",
    "evidenceStateSerializer",
    "createUnionRegistryService",
    "createStrategicDomainRuntime",
    "createEvidenceDomainRuntime",
    "strategicDomainModules",
    "evidenceDomainModules",
    "clock"
  ]);
  const LOAD_FIELDS = new Set(["seasonId", "bundledIdentities"]);
  const SAVE_FIELDS = new Set([
    "seasonId",
    "unionRegistryService",
    "strategicDomainRuntime",
    "evidenceDomainRuntime"
  ]);
  const ENVELOPE_FIELDS = new Set([
    "schemaVersion",
    "seasonId",
    "savedAt",
    "unionRegistry",
    "strategicDomain",
    "evidenceDomain"
  ]);

  class DataManagementStatePersistenceServiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "DataManagementStatePersistenceServiceError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new DataManagementStatePersistenceServiceError(code, message, cause);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exact(value, fields, path, code) {
    if (!isRecord(value)) fail(code, `Data Management State Persistence requires ${path}.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail(code, `Data Management State Persistence does not recognize ${path}.${unknown[0]}.`);
    }
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(code, `Data Management State Persistence requires ${path}.${field}.`);
      }
    });
    return value;
  }

  function requireString(value, path, code = "invalid_input") {
    if (typeof value !== "string" || value.trim() === "") {
      fail(code, `Data Management State Persistence requires ${path} to be non-empty.`);
    }
    return value;
  }

  function bind(owner, method, path) {
    if (typeof method !== "function") {
      fail("invalid_factory", `Data Management State Persistence requires ${path}.`);
    }
    return method.bind(owner);
  }

  function requireObject(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Data Management State Persistence requires ${path}.`);
    }
    return value;
  }

  function emptyStrategicState() {
    return {
      relations: [],
      nativeAssignments: [],
      activeStatuses: [],
      combatStrengthObservations: [],
      serverObservations: [],
      territoryOwnershipRecords: [],
      structureOwnershipRecords: [],
      ownershipRetractions: [],
      targetVerifications: [],
      confirmedSnapshots: [],
      confirmedPresenceFacts: [],
      qualifyingFullMapConfirmations: []
    };
  }

  function createDataManagementStatePersistenceService(options) {
    const input = exact(options, FACTORY_FIELDS, "options", "invalid_factory");
    const adapter = requireObject(input.storageAdapter, "options.storageAdapter");
    const evidenceSerializer = requireObject(
      input.evidenceStateSerializer,
      "options.evidenceStateSerializer"
    );
    requireObject(input.strategicDomainModules, "options.strategicDomainModules");
    requireObject(input.evidenceDomainModules, "options.evidenceDomainModules");

    const loadEnvelope = bind(adapter, adapter.loadEnvelope, "options.storageAdapter.loadEnvelope");
    const saveEnvelope = bind(adapter, adapter.saveEnvelope, "options.storageAdapter.saveEnvelope");
    const serializeRegistry = bind(input, input.serializeUnionRegistry, "options.serializeUnionRegistry");
    const deserializeRegistry = bind(
      input,
      input.deserializeUnionRegistryEnvelope,
      "options.deserializeUnionRegistryEnvelope"
    );
    const serializeStrategic = bind(
      input,
      input.serializeStrategicDomainRuntime,
      "options.serializeStrategicDomainRuntime"
    );
    const deserializeStrategic = bind(
      input,
      input.deserializeStrategicDomainEnvelope,
      "options.deserializeStrategicDomainEnvelope"
    );
    const serializeEvidence = bind(
      evidenceSerializer,
      evidenceSerializer.serializeRuntime,
      "options.evidenceStateSerializer.serializeRuntime"
    );
    const deserializeEvidence = bind(
      evidenceSerializer,
      evidenceSerializer.deserializeEnvelope,
      "options.evidenceStateSerializer.deserializeEnvelope"
    );
    const createRegistry = bind(
      input,
      input.createUnionRegistryService,
      "options.createUnionRegistryService"
    );
    const createStrategic = bind(
      input,
      input.createStrategicDomainRuntime,
      "options.createStrategicDomainRuntime"
    );
    const createEvidence = bind(
      input,
      input.createEvidenceDomainRuntime,
      "options.createEvidenceDomainRuntime"
    );
    const clock = bind(input, input.clock, "options.clock");

    function storageIdentity(seasonId) {
      return { scope: "data_management", seasonId };
    }

    function createRuntimes(identities, strategicState, evidenceState) {
      const unionRegistryService = createRegistry(identities);
      const strategicDomainRuntime = createStrategic({
        modules: input.strategicDomainModules,
        unionRegistryService,
        initialState: strategicState
      });
      const evidenceDomainRuntime = createEvidence({
        modules: input.evidenceDomainModules,
        initialState: evidenceState
      });
      return {
        unionRegistryService,
        strategicDomainRuntime,
        evidenceDomainRuntime
      };
    }

    function validateEnvelope(candidate, seasonId) {
      const envelope = exact(candidate, ENVELOPE_FIELDS, "stored envelope", "stored_state_invalid");
      if (envelope.schemaVersion !== 1) {
        fail("unsupported_schema", "Data Management State Persistence supports schemaVersion 1.");
      }
      if (envelope.seasonId !== seasonId) {
        fail("season_mismatch", "Stored Data Management season does not match the active season.");
      }
      requireString(envelope.savedAt, "stored envelope.savedAt", "stored_state_invalid");
      return envelope;
    }

    async function load(value) {
      const request = exact(value, LOAD_FIELDS, "load input", "invalid_input");
      const seasonId = requireString(request.seasonId, "load input.seasonId");
      if (!Array.isArray(request.bundledIdentities)) {
        fail("invalid_input", "Data Management State Persistence requires bundledIdentities.");
      }
      let stored;
      try {
        stored = await loadEnvelope(storageIdentity(seasonId));
      } catch (error) {
        fail("storage_load_failed", "Data Management state could not be loaded.", error);
      }

      if (stored === null || stored === undefined) {
        try {
          return {
            status: "missing",
            source: "bundled",
            ...createRuntimes(
              request.bundledIdentities,
              emptyStrategicState(),
              { assets: [], evidenceRecords: [] }
            )
          };
        } catch (error) {
          fail("runtime_creation_failed", "Bundled Data Management state is invalid.", error);
        }
      }

      const envelope = validateEnvelope(stored, seasonId);
      try {
        const registryEnvelope = deserializeRegistry(envelope.unionRegistry);
        const strategicEnvelope = deserializeStrategic(envelope.strategicDomain);
        const evidenceEnvelope = deserializeEvidence(envelope.evidenceDomain);
        if (
          registryEnvelope.savedAt !== envelope.savedAt
          || strategicEnvelope.savedAt !== envelope.savedAt
          || evidenceEnvelope.savedAt !== envelope.savedAt
          || strategicEnvelope.seasonId !== seasonId
        ) {
          fail("stored_state_invalid", "Stored Data Management sub-envelopes are inconsistent.");
        }
        return {
          status: "restored",
          source: "storage",
          savedAt: envelope.savedAt,
          ...createRuntimes(
            registryEnvelope.identities,
            strategicEnvelope.state,
            {
              assets: evidenceEnvelope.assets,
              evidenceRecords: evidenceEnvelope.evidenceRecords
            }
          )
        };
      } catch (error) {
        if (error instanceof DataManagementStatePersistenceServiceError) throw error;
        fail("stored_state_invalid", "Stored Data Management state is invalid.", error);
      }
    }

    async function save(value) {
      const request = exact(value, SAVE_FIELDS, "save input", "invalid_input");
      const seasonId = requireString(request.seasonId, "save input.seasonId");
      let now;
      try {
        now = clock();
      } catch (error) {
        fail("invalid_clock", "Data Management persistence clock failed.", error);
      }
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        fail("invalid_clock", "Data Management persistence clock must return a valid Date.");
      }
      const savedAt = now.toISOString();
      let envelope;
      try {
        envelope = {
          schemaVersion: 1,
          seasonId,
          savedAt,
          unionRegistry: serializeRegistry(request.unionRegistryService, savedAt),
          strategicDomain: serializeStrategic(
            request.strategicDomainRuntime,
            seasonId,
            savedAt
          ),
          evidenceDomain: serializeEvidence(request.evidenceDomainRuntime, savedAt)
        };
      } catch (error) {
        fail("serialization_failed", "Data Management state could not be serialized.", error);
      }
      try {
        await saveEnvelope(storageIdentity(seasonId), envelope);
      } catch (error) {
        fail("storage_save_failed", "Data Management state could not be saved.", error);
      }
      return { status: "saved", savedAt };
    }

    return Object.freeze({ load, save });
  }

  const exportsObject = {
    createDataManagementStatePersistenceService,
    DataManagementStatePersistenceServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
