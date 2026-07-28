(function initializePersistenceService(globalScope) {
  function isStrictPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isNonNullObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map((item) => deepClone(item));
    }

    if (!isStrictPlainObject(value)) {
      return value;
    }

    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      clone[key] = deepClone(value[key]);
    });

    return clone;
  }

  class PersistenceServiceError extends Error {
    constructor(code, message, options) {
      super(message);
      this.name = "PersistenceServiceError";
      this.code = code;

      if (options && Object.prototype.hasOwnProperty.call(options, "cause")) {
        this.cause = options.cause;
      }

      if (options && Array.isArray(options.validationErrors)) {
        this.validationErrors = options.validationErrors.map((entry) => ({ ...entry }));
      }
    }
  }

  function createPersistenceServiceError(code, message, cause, validationErrors) {
    return new PersistenceServiceError(code, message, {
      cause,
      validationErrors: Array.isArray(validationErrors)
        ? validationErrors
        : (cause && Array.isArray(cause.validationErrors) ? cause.validationErrors : undefined)
    });
  }

  function requireFunction(value, fieldPath) {
    if (typeof value !== "function") {
      throw new TypeError(`createPersistenceService requires ${fieldPath} to be a function.`);
    }

    return value;
  }

  function requireServerStateMethod(serverStateService, methodName, operationName) {
    if (!isNonNullObject(serverStateService) || typeof serverStateService[methodName] !== "function") {
      throw createPersistenceServiceError(
        "INVALID_SERVER_STATE_SERVICE",
        `${operationName} requires serverStateService.${methodName}() to be available.`
      );
    }

    return serverStateService[methodName].bind(serverStateService);
  }

  function createIdentity(seasonId, baseMapId) {
    return {
      seasonId,
      baseMapId
    };
  }

  function assertEnvelopeIdentityMatch(envelope, seasonId, baseMapId) {
    if (envelope.seasonId !== seasonId) {
      throw createPersistenceServiceError(
        "SEASON_MISMATCH",
        `Saved envelope seasonId '${envelope.seasonId}' does not match active seasonId '${seasonId}'.`
      );
    }

    if (envelope.baseMapId !== baseMapId) {
      throw createPersistenceServiceError(
        "BASE_MAP_MISMATCH",
        `Saved envelope baseMapId '${envelope.baseMapId}' does not match active baseMapId '${baseMapId}'.`
      );
    }
  }

  function buildOwnershipReplacement(envelope, hasServer) {
    const ownershipByServerId = {};

    envelope.servers.forEach((serverRecord) => {
      if (!hasServer(serverRecord.id)) {
        throw createPersistenceServiceError(
          "UNKNOWN_PERSISTED_SERVER",
          `Saved envelope contains unknown server id '${serverRecord.id}'.`
        );
      }

      ownershipByServerId[serverRecord.id] = deepClone(serverRecord.ownership);
    });

    return ownershipByServerId;
  }

  function createPersistenceService(dependencies) {
    const resolvedDependencies = dependencies || {};

    if (!isStrictPlainObject(resolvedDependencies)) {
      throw new TypeError("createPersistenceService requires a dependency object.");
    }

    if (!isNonNullObject(resolvedDependencies.storageAdapter)) {
      throw new TypeError("createPersistenceService requires storageAdapter to be an object.");
    }

    const storageAdapter = resolvedDependencies.storageAdapter;
    const loadEnvelope = requireFunction(storageAdapter.loadEnvelope, "storageAdapter.loadEnvelope").bind(storageAdapter);
    const saveEnvelope = requireFunction(storageAdapter.saveEnvelope, "storageAdapter.saveEnvelope").bind(storageAdapter);
    const serializeServerState = requireFunction(resolvedDependencies.serializeServerState, "serializeServerState");
    const deserializePersistenceEnvelope = requireFunction(resolvedDependencies.deserializePersistenceEnvelope, "deserializePersistenceEnvelope");
    const clock = requireFunction(resolvedDependencies.clock, "clock");

    async function load(serverStateService) {
      const getSeasonId = requireServerStateMethod(serverStateService, "getSeasonId", "load");
      const getBaseMapId = requireServerStateMethod(serverStateService, "getBaseMapId", "load");
      const hasServer = requireServerStateMethod(serverStateService, "hasServer", "load");
      const replaceTerritoryOwnership = requireServerStateMethod(serverStateService, "replaceTerritoryOwnership", "load");

      const seasonId = getSeasonId();
      const baseMapId = getBaseMapId();

      let loadedEnvelope;
      try {
        loadedEnvelope = await loadEnvelope(createIdentity(seasonId, baseMapId));
      } catch (error) {
        throw createPersistenceServiceError(
          "STORAGE_LOAD_FAILED",
          "Persistence load failed while reading from storage adapter.",
          error
        );
      }

      if (loadedEnvelope === null || loadedEnvelope === undefined) {
        return {
          status: "missing",
          seasonId,
          baseMapId
        };
      }

      let deserializedEnvelope;
      try {
        deserializedEnvelope = deserializePersistenceEnvelope(loadedEnvelope);
      } catch (error) {
        throw createPersistenceServiceError(
          "INVALID_SAVED_ENVELOPE",
          "Persistence load rejected an invalid saved envelope.",
          error
        );
      }

      assertEnvelopeIdentityMatch(deserializedEnvelope, seasonId, baseMapId);

      const ownershipByServerId = buildOwnershipReplacement(deserializedEnvelope, hasServer);

      try {
        replaceTerritoryOwnership(ownershipByServerId);
      } catch (error) {
        throw createPersistenceServiceError(
          "RESTORATION_FAILED",
          "Persistence load failed while applying restored ownership state.",
          error
        );
      }

      return {
        status: "restored",
        seasonId,
        baseMapId,
        savedAt: deserializedEnvelope.savedAt
      };
    }

    async function save(serverStateService) {
      const getSeasonId = requireServerStateMethod(serverStateService, "getSeasonId", "save");
      const getBaseMapId = requireServerStateMethod(serverStateService, "getBaseMapId", "save");

      const seasonId = getSeasonId();
      const baseMapId = getBaseMapId();

      let now;
      try {
        now = clock();
      } catch (error) {
        throw createPersistenceServiceError(
          "INVALID_CLOCK_RESULT",
          "Persistence save clock failed to return a valid Date.",
          error
        );
      }

      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw createPersistenceServiceError(
          "INVALID_CLOCK_RESULT",
          "Persistence save clock must return a valid Date instance."
        );
      }

      const savedAt = now.toISOString();

      let envelope;
      try {
        envelope = serializeServerState(serverStateService, savedAt);
      } catch (error) {
        throw createPersistenceServiceError(
          "SERIALIZATION_FAILED",
          "Persistence save failed while serializing server state.",
          error
        );
      }

      assertEnvelopeIdentityMatch(envelope, seasonId, baseMapId);

      try {
        await saveEnvelope(createIdentity(seasonId, baseMapId), deepClone(envelope));
      } catch (error) {
        throw createPersistenceServiceError(
          "STORAGE_SAVE_FAILED",
          "Persistence save failed while writing through storage adapter.",
          error
        );
      }

      return {
        status: "saved",
        seasonId,
        baseMapId,
        savedAt
      };
    }

    return {
      load,
      save
    };
  }

  globalScope.PersistenceServiceError = PersistenceServiceError;
  globalScope.createPersistenceService = createPersistenceService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PersistenceServiceError,
      createPersistenceService
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
