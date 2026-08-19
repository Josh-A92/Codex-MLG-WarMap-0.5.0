(function initializeStrategicDomainStateSerializer(globalScope) {
  const SUPPORTED_SCHEMA_VERSION = 2;
  const LEGACY_SCHEMA_VERSION = 1;
  const TOP_LEVEL_FIELDS = ["schemaVersion", "seasonId", "savedAt", "state"];
  const STATE_FIELDS = [
    "relations",
    "nativeAssignments",
    "activeStatuses",
    "combatStrengthObservations",
    "serverObservations",
    "territoryOwnershipRecords",
    "structureOwnershipRecords",
    "ownershipRetractions",
    "targetVerifications",
    "confirmedSnapshots",
    "confirmedPresenceFacts",
    "qualifyingFullMapConfirmations"
  ];
  const CANONICAL_UTC_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map((item) => deepClone(item));
    }
    if (!isPlainObject(value)) {
      return value;
    }
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });
    return clone;
  }

  function createValidationResult() {
    return { valid: true, errors: [], warnings: [] };
  }

  function pushError(result, code, path, message) {
    result.valid = false;
    result.errors.push({ code, path, message });
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function validateRequiredAndUnknownFields(result, value, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        const fieldPath = path ? `${path}.${field}` : field;
        pushError(result, "MISSING_REQUIRED_FIELD", fieldPath, `${fieldPath} is required.`);
      }
    });
    Object.keys(value).sort().forEach((field) => {
      if (!fields.includes(field)) {
        const fieldPath = path ? `${path}.${field}` : field;
        pushError(result, "UNKNOWN_FIELD", fieldPath, `Unknown field '${field}'.`);
      }
    });
  }

  function validateCanonicalTimestamp(result, value, path) {
    if (typeof value !== "string" || !CANONICAL_UTC_TIMESTAMP_PATTERN.test(value)) {
      pushError(
        result,
        "INVALID_TIMESTAMP_FORMAT",
        path,
        `${path} must match YYYY-MM-DDTHH:mm:ss.sssZ.`
      );
      return;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      pushError(result, "INVALID_TIMESTAMP", path, `${path} must be a real UTC timestamp.`);
    }
  }

  function validateStateCollection(result, collection, field, seasonId) {
    const path = `state.${field}`;
    if (!Array.isArray(collection)) {
      pushError(result, "INVALID_ARRAY", path, `${path} must be an array.`);
      return;
    }
    collection.forEach((record, index) => {
      const recordPath = `${path}[${index}]`;
      if (!isPlainObject(record)) {
        pushError(result, "INVALID_RECORD", recordPath, `${recordPath} must be a plain object.`);
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(record, "seasonId")) {
        pushError(
          result,
          "MISSING_RECORD_SEASON_ID",
          `${recordPath}.seasonId`,
          `${recordPath}.seasonId is required.`
        );
      } else if (!isNonEmptyString(record.seasonId)) {
        pushError(
          result,
          "INVALID_RECORD_SEASON_ID",
          `${recordPath}.seasonId`,
          `${recordPath}.seasonId must be a non-empty, non-whitespace string.`
        );
      } else if (isNonEmptyString(seasonId) && record.seasonId !== seasonId) {
        pushError(
          result,
          "SEASON_ID_MISMATCH",
          `${recordPath}.seasonId`,
          `${recordPath}.seasonId must match envelope seasonId.`
        );
      }
    });
  }

  function validateStrategicDomainEnvelope(candidate) {
    const result = createValidationResult();
    if (!isPlainObject(candidate)) {
      pushError(result, "INVALID_OBJECT", "", "Strategic domain envelope must be a plain object.");
      return result;
    }

    validateRequiredAndUnknownFields(result, candidate, TOP_LEVEL_FIELDS, "");

    if (Object.prototype.hasOwnProperty.call(candidate, "schemaVersion")) {
      if (!Number.isInteger(candidate.schemaVersion) || candidate.schemaVersion <= 0) {
        pushError(
          result,
          "INVALID_SCHEMA_VERSION",
          "schemaVersion",
          "schemaVersion must be a positive integer."
        );
      } else if (candidate.schemaVersion !== SUPPORTED_SCHEMA_VERSION
          && candidate.schemaVersion !== LEGACY_SCHEMA_VERSION) {
        pushError(
          result,
          "UNSUPPORTED_SCHEMA_VERSION",
          "schemaVersion",
          `Only schema versions ${LEGACY_SCHEMA_VERSION} and ${SUPPORTED_SCHEMA_VERSION} are supported.`
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "seasonId")
        && !isNonEmptyString(candidate.seasonId)) {
      pushError(
        result,
        "INVALID_STRING",
        "seasonId",
        "seasonId must be a non-empty, non-whitespace string."
      );
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "savedAt")) {
      validateCanonicalTimestamp(result, candidate.savedAt, "savedAt");
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "state")) {
      if (!isPlainObject(candidate.state)) {
        pushError(result, "INVALID_OBJECT", "state", "state must be a plain object.");
      } else {
        validateRequiredAndUnknownFields(result, candidate.state, STATE_FIELDS, "state");
        STATE_FIELDS.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(candidate.state, field)) {
            validateStateCollection(result, candidate.state[field], field, candidate.seasonId);
          }
        });
      }
    }

    return result;
  }

  function createSerializerError(code, message, errors) {
    const error = new Error(message);
    error.name = "StrategicDomainSerializationError";
    error.code = code;
    error.validationErrors = Array.isArray(errors)
      ? errors.map((entry) => deepClone(entry))
      : [];
    return error;
  }

  function requireService(runtime, field, methods) {
    const service = runtime[field];
    if (service === null || typeof service !== "object" || Array.isArray(service)) {
      throw createSerializerError(
        "INVALID_RUNTIME",
        `serializeStrategicDomainRuntime requires runtime.${field}.`,
        [{ code: "INVALID_DEPENDENCY", path: `runtime.${field}`, message: "Service object is required." }]
      );
    }
    const bound = {};
    methods.forEach((method) => {
      if (typeof service[method] !== "function") {
        throw createSerializerError(
          "INVALID_RUNTIME",
          `serializeStrategicDomainRuntime requires runtime.${field}.${method}().`,
          [{
            code: "MISSING_DEPENDENCY",
            path: `runtime.${field}.${method}`,
            message: `${method} must be a function.`
          }]
        );
      }
      bound[method] = service[method].bind(service);
    });
    return bound;
  }

  function requireCollection(value, path) {
    if (!Array.isArray(value)) {
      throw createSerializerError(
        "INVALID_RUNTIME_RESULT",
        `serializeStrategicDomainRuntime requires ${path} to return an array.`,
        [{ code: "INVALID_DEPENDENCY_RESULT", path, message: `${path} must return an array.` }]
      );
    }
    return value;
  }

  function serializeStrategicDomainRuntime(runtime, seasonId, savedAt) {
    if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) {
      throw createSerializerError(
        "INVALID_RUNTIME",
        "serializeStrategicDomainRuntime requires runtime to be an object.",
        [{ code: "INVALID_DEPENDENCY", path: "runtime", message: "Runtime object is required." }]
      );
    }

    const relations = requireService(runtime, "relationService", ["listRelations"]);
    const nativeAssignments = requireService(runtime, "nativeAssignmentService", ["listAssignments"]);
    const activeStatuses = requireService(runtime, "activeStatusService", ["listStatuses"]);
    const combatStrength = requireService(
      runtime,
      "combatStrengthObservationService",
      ["listObservations"]
    );
    const serverObservations = requireService(
      runtime,
      "serverObservationService",
      ["listObservations"]
    );
    const ownership = requireService(runtime, "ownershipRecordService", [
      "listTerritoryRecords",
      "listStructureRecords"
    ]);
    const retractions = requireService(runtime, "ownershipRetractionService", ["listRetractions"]);
    const verifications = requireService(runtime, "targetVerificationService", ["listVerifications"]);
    const snapshots = requireService(runtime, "confirmedSnapshotService", ["listSnapshots"]);
    const activityFacts = requireService(runtime, "activityFactHistoryService", ["getAllFacts"]);

    const facts = activityFacts.getAllFacts();
    if (!isPlainObject(facts)) {
      throw createSerializerError(
        "INVALID_RUNTIME_RESULT",
        "serializeStrategicDomainRuntime requires getAllFacts() to return an object.",
        [{
          code: "INVALID_DEPENDENCY_RESULT",
          path: "runtime.activityFactHistoryService.getAllFacts",
          message: "getAllFacts must return an object."
        }]
      );
    }

    const envelope = {
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      seasonId,
      savedAt,
      state: {
        relations: requireCollection(relations.listRelations(), "runtime.relationService.listRelations"),
        nativeAssignments: requireCollection(
          nativeAssignments.listAssignments(),
          "runtime.nativeAssignmentService.listAssignments"
        ),
        activeStatuses: requireCollection(
          activeStatuses.listStatuses(),
          "runtime.activeStatusService.listStatuses"
        ),
        combatStrengthObservations: requireCollection(
          combatStrength.listObservations(),
          "runtime.combatStrengthObservationService.listObservations"
        ),
        serverObservations: requireCollection(
          serverObservations.listObservations(),
          "runtime.serverObservationService.listObservations"
        ),
        territoryOwnershipRecords: requireCollection(
          ownership.listTerritoryRecords(),
          "runtime.ownershipRecordService.listTerritoryRecords"
        ),
        structureOwnershipRecords: requireCollection(
          ownership.listStructureRecords(),
          "runtime.ownershipRecordService.listStructureRecords"
        ),
        ownershipRetractions: requireCollection(
          retractions.listRetractions(),
          "runtime.ownershipRetractionService.listRetractions"
        ),
        targetVerifications: requireCollection(
          verifications.listVerifications(),
          "runtime.targetVerificationService.listVerifications"
        ),
        confirmedSnapshots: requireCollection(
          snapshots.listSnapshots(),
          "runtime.confirmedSnapshotService.listSnapshots"
        ),
        confirmedPresenceFacts: requireCollection(
          facts.confirmedPresenceFacts,
          "runtime.activityFactHistoryService.getAllFacts.confirmedPresenceFacts"
        ),
        qualifyingFullMapConfirmations: requireCollection(
          facts.qualifyingFullMapConfirmations,
          "runtime.activityFactHistoryService.getAllFacts.qualifyingFullMapConfirmations"
        )
      }
    };

    const validation = validateStrategicDomainEnvelope(envelope);
    if (!validation.valid) {
      throw createSerializerError(
        "INVALID_ENVELOPE",
        "serializeStrategicDomainRuntime produced an invalid strategic domain envelope.",
        validation.errors
      );
    }
    return deepClone(envelope);
  }

  function migrateLegacyEnvelope(candidate) {
    if (!isPlainObject(candidate) || candidate.schemaVersion !== LEGACY_SCHEMA_VERSION) {
      return candidate;
    }
    const migrated = deepClone(candidate);
    if (!isPlainObject(migrated.state)) {
      return migrated;
    }
    if (!Object.prototype.hasOwnProperty.call(migrated.state, "ownershipRetractions")) {
      migrated.state.ownershipRetractions = [];
    }
    migrated.schemaVersion = SUPPORTED_SCHEMA_VERSION;
    return migrated;
  }

  function deserializeStrategicDomainEnvelope(candidate) {
    const migrated = migrateLegacyEnvelope(candidate);
    const validation = validateStrategicDomainEnvelope(migrated);
    if (!validation.valid) {
      throw createSerializerError(
        "INVALID_ENVELOPE",
        "deserializeStrategicDomainEnvelope rejected an invalid strategic domain envelope.",
        validation.errors
      );
    }
    return deepClone(migrated);
  }

  const exportsObject = {
    validateStrategicDomainEnvelope,
    serializeStrategicDomainRuntime,
    deserializeStrategicDomainEnvelope
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
