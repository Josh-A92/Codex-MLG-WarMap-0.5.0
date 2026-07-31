(function initializeUnionRegistryPersistenceServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "storageAdapter",
    "serializeUnionRegistry",
    "deserializeUnionRegistryEnvelope",
    "createUnionRegistryService",
    "clock"
  ]);
  const STORAGE_IDENTITY = Object.freeze({
    scope: "union_registry",
    registryId: "global"
  });

  class UnionRegistryPersistenceServiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "UnionRegistryPersistenceServiceError";
      this.code = code;
      if (cause !== undefined) {
        this.cause = cause;
      }
    }
  }

  function fail(code, message, cause) {
    throw new UnionRegistryPersistenceServiceError(code, message, cause);
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireOptions(value) {
    if (!isRecordObject(value)) {
      fail("invalid_factory", "Union Registry Persistence Service options must be a plain object.");
    }
    const unknown = Object.keys(value).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Union Registry Persistence Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_factory", `Union Registry Persistence Service requires options.${field}.`);
      }
    });
    return value;
  }

  function bindMethod(owner, method, path) {
    if (typeof method !== "function") {
      fail("invalid_factory", `Union Registry Persistence Service requires ${path} to be a function.`);
    }
    return method.bind(owner);
  }

  function requireAdapter(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", "Union Registry Persistence Service requires options.storageAdapter.");
    }
    return {
      loadEnvelope: bindMethod(value, value.loadEnvelope, "options.storageAdapter.loadEnvelope"),
      saveEnvelope: bindMethod(value, value.saveEnvelope, "options.storageAdapter.saveEnvelope")
    };
  }

  function cloneIdentity() {
    return { ...STORAGE_IDENTITY };
  }

  function createUnionRegistryPersistenceService(options) {
    const input = requireOptions(options);
    const adapter = requireAdapter(input.storageAdapter);
    const serialize = bindMethod(input, input.serializeUnionRegistry, "options.serializeUnionRegistry");
    const deserialize = bindMethod(
      input,
      input.deserializeUnionRegistryEnvelope,
      "options.deserializeUnionRegistryEnvelope"
    );
    const createRegistry = bindMethod(
      input,
      input.createUnionRegistryService,
      "options.createUnionRegistryService"
    );
    const clock = bindMethod(input, input.clock, "options.clock");

    async function load(bundledIdentities) {
      if (!Array.isArray(bundledIdentities)) {
        fail("invalid_input", "Union Registry Persistence Service requires bundledIdentities to be an array.");
      }
      let storedEnvelope;
      try {
        storedEnvelope = await adapter.loadEnvelope(cloneIdentity());
      } catch (error) {
        fail("storage_load_failed", "Union Registry Persistence Service could not load storage.", error);
      }

      if (storedEnvelope === null || storedEnvelope === undefined) {
        let unionRegistryService;
        try {
          unionRegistryService = createRegistry(bundledIdentities);
        } catch (error) {
          fail("bundled_registry_invalid", "Bundled Union Registry data is invalid.", error);
        }
        return {
          status: "missing",
          source: "bundled",
          unionRegistryService
        };
      }

      let envelope;
      try {
        envelope = deserialize(storedEnvelope);
      } catch (error) {
        fail("stored_registry_invalid", "Stored Union Registry data is invalid.", error);
      }

      try {
        return {
          status: "restored",
          source: "storage",
          savedAt: envelope.savedAt,
          unionRegistryService: createRegistry(envelope.identities)
        };
      } catch (error) {
        fail("stored_registry_invalid", "Stored Union Registry identities are invalid.", error);
      }
    }

    async function save(unionRegistryService) {
      let timestamp;
      try {
        const clockValue = clock();
        if (!(clockValue instanceof Date) || Number.isNaN(clockValue.getTime())) {
          fail("invalid_clock", "Union Registry Persistence Service clock must return a valid Date.");
        }
        timestamp = clockValue.toISOString();
      } catch (error) {
        if (error instanceof UnionRegistryPersistenceServiceError) {
          throw error;
        }
        fail("invalid_clock", "Union Registry Persistence Service clock failed.", error);
      }

      let envelope;
      try {
        envelope = serialize(unionRegistryService, timestamp);
      } catch (error) {
        fail("serialization_failed", "Union Registry Persistence Service could not serialize state.", error);
      }

      try {
        await adapter.saveEnvelope(cloneIdentity(), envelope);
      } catch (error) {
        fail("storage_save_failed", "Union Registry Persistence Service could not save storage.", error);
      }
      return {
        status: "saved",
        savedAt: timestamp
      };
    }

    return { load, save };
  }

  const exportsObject = {
    createUnionRegistryPersistenceService,
    UnionRegistryPersistenceServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
