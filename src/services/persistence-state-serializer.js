(function initializePersistenceStateSerializer(globalScope) {
  const SUPPORTED_SCHEMA_VERSION = 1;
  const ALLOWED_TOP_LEVEL_KEYS = ["schemaVersion", "seasonId", "baseMapId", "savedAt", "servers"];
  const REQUIRED_TOP_LEVEL_KEYS = ["schemaVersion", "seasonId", "baseMapId", "savedAt", "servers"];
  const ALLOWED_SERVER_KEYS = ["id", "label", "ownership"];
  const REQUIRED_SERVER_KEYS = ["id", "ownership"];
  const CANONICAL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  function isStrictPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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

  function createValidationResult() {
    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }

  function pushError(result, code, path, message) {
    result.errors.push({
      code,
      path,
      message
    });
    result.valid = false;
  }

  function sortedKeys(value) {
    return Object.keys(value).sort();
  }

  function checkRequiredFields(result, value, requiredKeys, pathPrefix) {
    requiredKeys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        pushError(result, "MISSING_REQUIRED_FIELD", path, `${path} is required.`);
      }
    });
  }

  function checkUnknownFields(result, value, allowedKeys, pathPrefix) {
    sortedKeys(value).forEach((key) => {
      if (!allowedKeys.includes(key)) {
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        pushError(result, "UNKNOWN_FIELD", path, `Unknown field '${key}'.`);
      }
    });
  }

  function isNonEmptyNonWhitespaceString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function validateNonEmptyString(result, value, path, label) {
    if (!isNonEmptyNonWhitespaceString(value)) {
      pushError(result, "INVALID_STRING", path, `${label} must be a non-empty, non-whitespace string.`);
      return false;
    }

    return true;
  }

  function validateCanonicalUtcTimestamp(result, value, path, label) {
    if (typeof value !== "string") {
      pushError(result, "INVALID_TIMESTAMP", path, `${label} must be a canonical UTC timestamp string.`);
      return false;
    }

    if (!CANONICAL_UTC_TIMESTAMP_PATTERN.test(value)) {
      pushError(result, "INVALID_TIMESTAMP_FORMAT", path, `${label} must match YYYY-MM-DDTHH:mm:ss.sssZ.`);
      return false;
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      pushError(result, "INVALID_TIMESTAMP", path, `${label} must represent a real UTC timestamp.`);
      return false;
    }

    if (parsedDate.toISOString() !== value) {
      pushError(result, "INVALID_TIMESTAMP", path, `${label} must represent a real UTC timestamp.`);
      return false;
    }

    return true;
  }

  function validateOwnershipObject(result, ownership, path) {
    if (!isStrictPlainObject(ownership)) {
      pushError(result, "INVALID_OBJECT", path, `${path} must be a plain object.`);
      return;
    }

    sortedKeys(ownership).forEach((territoryKey) => {
      const keyPath = `${path}.${territoryKey}`;
      if (!isNonEmptyNonWhitespaceString(territoryKey)) {
        pushError(result, "INVALID_OWNERSHIP_KEY", keyPath, `${path} keys must be non-empty, non-whitespace strings.`);
      }

      const ownerValue = ownership[territoryKey];
      if (ownerValue !== null && !isNonEmptyNonWhitespaceString(ownerValue)) {
        pushError(result, "INVALID_OWNERSHIP_VALUE", keyPath, `${keyPath} must be null or a non-empty, non-whitespace string.`);
      }
    });
  }

  function validateServerRecord(result, serverRecord, index, seenServerIds) {
    const serverPath = `servers[${index}]`;

    if (!isStrictPlainObject(serverRecord)) {
      pushError(result, "INVALID_OBJECT", serverPath, `${serverPath} must be a plain object.`);
      return;
    }

    checkRequiredFields(result, serverRecord, REQUIRED_SERVER_KEYS, serverPath);
    checkUnknownFields(result, serverRecord, ALLOWED_SERVER_KEYS, serverPath);

    if (Object.prototype.hasOwnProperty.call(serverRecord, "id")) {
      const idPath = `${serverPath}.id`;
      if (validateNonEmptyString(result, serverRecord.id, idPath, idPath)) {
        if (seenServerIds.has(serverRecord.id)) {
          pushError(result, "DUPLICATE_SERVER_ID", idPath, `Duplicate server id '${serverRecord.id}'.`);
        } else {
          seenServerIds.add(serverRecord.id);
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(serverRecord, "label")) {
      validateNonEmptyString(result, serverRecord.label, `${serverPath}.label`, `${serverPath}.label`);
    }

    if (Object.prototype.hasOwnProperty.call(serverRecord, "ownership")) {
      validateOwnershipObject(result, serverRecord.ownership, `${serverPath}.ownership`);
    }
  }

  function validatePersistenceEnvelope(candidate) {
    const result = createValidationResult();

    if (!isStrictPlainObject(candidate)) {
      pushError(result, "INVALID_OBJECT", "", "Persistence envelope must be a plain object.");
      return result;
    }

    checkRequiredFields(result, candidate, REQUIRED_TOP_LEVEL_KEYS, "");
    checkUnknownFields(result, candidate, ALLOWED_TOP_LEVEL_KEYS, "");

    if (Object.prototype.hasOwnProperty.call(candidate, "schemaVersion")) {
      const schemaVersion = candidate.schemaVersion;
      if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
        pushError(result, "INVALID_SCHEMA_VERSION", "schemaVersion", "schemaVersion must be a positive integer.");
      } else if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        pushError(result, "UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", `Only schema version ${SUPPORTED_SCHEMA_VERSION} is supported.`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "seasonId")) {
      validateNonEmptyString(result, candidate.seasonId, "seasonId", "seasonId");
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "baseMapId")) {
      validateNonEmptyString(result, candidate.baseMapId, "baseMapId", "baseMapId");
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "savedAt")) {
      validateCanonicalUtcTimestamp(result, candidate.savedAt, "savedAt", "savedAt");
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "servers")) {
      if (!Array.isArray(candidate.servers)) {
        pushError(result, "INVALID_ARRAY", "servers", "servers must be an array.");
      } else {
        const seenServerIds = new Set();
        candidate.servers.forEach((serverRecord, index) => {
          validateServerRecord(result, serverRecord, index, seenServerIds);
        });
      }
    }

    return result;
  }

  function createSerializationError(message, errors) {
    const error = new Error(message);
    error.name = "PersistenceSerializationError";
    error.code = "PERSISTENCE_SERIALIZATION_FAILED";
    error.validationErrors = Array.isArray(errors) ? errors.map((entry) => ({ ...entry })) : [];
    return error;
  }

  function createDeserializationError(message, errors) {
    const error = new Error(message);
    error.name = "PersistenceDeserializationError";
    error.code = "PERSISTENCE_DESERIALIZATION_FAILED";
    error.validationErrors = Array.isArray(errors) ? errors.map((entry) => ({ ...entry })) : [];
    return error;
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw createSerializationError(`serializeServerState requires ${name}() to be available.`, [
        {
          code: "MISSING_DEPENDENCY",
          path: name,
          message: `${name} must be a function.`
        }
      ]);
    }

    return value;
  }

  function serializeServerState(serverStateService, savedAt) {
    if (!isStrictPlainObject(serverStateService)) {
      throw createSerializationError("serializeServerState requires serverStateService to be an object.", [
        {
          code: "INVALID_DEPENDENCY",
          path: "serverStateService",
          message: "serverStateService must be an object exposing required methods."
        }
      ]);
    }

    const getSeasonId = requireFunction(serverStateService.getSeasonId, "getSeasonId");
    const getBaseMapId = requireFunction(serverStateService.getBaseMapId, "getBaseMapId");
    const listServers = requireFunction(serverStateService.listServers, "listServers");

    const servers = listServers();
    if (!Array.isArray(servers)) {
      throw createSerializationError("serializeServerState requires listServers() to return an array.", [
        {
          code: "INVALID_DEPENDENCY_RESULT",
          path: "listServers",
          message: "listServers must return an array."
        }
      ]);
    }

    const envelope = {
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      seasonId: getSeasonId(),
      baseMapId: getBaseMapId(),
      savedAt,
      servers: servers.map((server, index) => {
        const serverRecord = isStrictPlainObject(server) ? server : {};
        const ownershipSource = Object.prototype.hasOwnProperty.call(serverRecord, "ownership")
          ? serverRecord.ownership
          : {};

        const persistedServer = {
          id: serverRecord.id,
          ownership: deepClone(ownershipSource)
        };
        if (Object.prototype.hasOwnProperty.call(serverRecord, "label")) {
          persistedServer.label = serverRecord.label;
        }
        return persistedServer;
      })
    };

    const validation = validatePersistenceEnvelope(envelope);
    if (!validation.valid) {
      throw createSerializationError("serializeServerState produced an invalid persistence envelope.", validation.errors);
    }

    return deepClone(envelope);
  }

  function deserializePersistenceEnvelope(candidate) {
    const validation = validatePersistenceEnvelope(candidate);
    if (!validation.valid) {
      throw createDeserializationError("deserializePersistenceEnvelope rejected an invalid persistence envelope.", validation.errors);
    }

    return deepClone(candidate);
  }

  globalScope.validatePersistenceEnvelope = validatePersistenceEnvelope;
  globalScope.serializeServerState = serializeServerState;
  globalScope.deserializePersistenceEnvelope = deserializePersistenceEnvelope;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validatePersistenceEnvelope,
      serializeServerState,
      deserializePersistenceEnvelope
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
