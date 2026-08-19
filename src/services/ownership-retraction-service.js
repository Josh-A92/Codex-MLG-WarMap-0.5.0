(function initializeOwnershipRetractionServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialRetractions",
    "validateOwnershipRetractionRecord",
    "validateOwnershipRetractionHistory"
  ]);
  const RETRACTION_FIELDS = new Set([
    "retractionId",
    "seasonId",
    "serverId",
    "targetKind",
    "retractedRecordId",
    "actorId",
    "reason",
    "recordedAt",
    "transactionId",
    "sourceType"
  ]);
  const FILTER_FIELDS = new Set([
    "retractionId",
    "seasonId",
    "serverId",
    "targetKind",
    "retractedRecordId",
    "actorId",
    "transactionId",
    "sourceType"
  ]);

  class OwnershipRetractionServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "OwnershipRetractionServiceError";
      this.code = code;
      if (validationErrors) this.validationErrors = validationErrors;
    }
  }

  function throwServiceError(code, message, validationErrors) {
    throw new OwnershipRetractionServiceError(code, message, validationErrors);
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (!isRecordObject(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(output, key, {
        value: deepClone(value[key]),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });
    return output;
  }

  function cloneErrors(errors) {
    if (!Array.isArray(errors)) return [];
    return errors.map((error) => ({
      code: isRecordObject(error) && typeof error.code === "string" ? error.code : "UNKNOWN",
      path: isRecordObject(error) && typeof error.path === "string" ? error.path : "",
      message: isRecordObject(error) && typeof error.message === "string" ? error.message : ""
    }));
  }

  function requireRecordObject(value, path) {
    if (!isRecordObject(value)) {
      throwServiceError("invalid_input", `Ownership Retraction Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) {
      throwServiceError("invalid_input", `Ownership Retraction Service requires ${path} to be an array.`);
    }
    return value;
  }

  function requireCallable(owner, value, path) {
    if (typeof value !== "function") {
      throwServiceError("invalid_factory", `Ownership Retraction Service requires ${path}.`);
    }
    return function boundCallable() {
      return value.apply(owner, arguments);
    };
  }

  function requireKnownFields(record, allowedFields, path) {
    const unknown = Object.keys(record).filter((field) => !allowedFields.has(field)).sort();
    if (unknown.length > 0) {
      throwServiceError("invalid_input", `Ownership Retraction Service does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function requireRequiredFields(record, requiredFields, path) {
    Array.from(requiredFields).forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throwServiceError("invalid_input", `Ownership Retraction Service requires ${path}.${field}.`);
      }
    });
  }

  function validateRecord(validator, record) {
    let result;
    try {
      result = validator(record);
    } catch (_error) {
      throwServiceError("invalid_history", "Ownership Retraction validator threw while validating a retraction record.");
    }
    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwServiceError("invalid_history", "Ownership Retraction validator returned an invalid result shape.");
    }
    if (!result.valid) {
      throwServiceError("invalid_history", "Ownership Retraction record validation failed.", cloneErrors(result.errors));
    }
  }

  function validateHistory(validator, records) {
    let result;
    try {
      result = validator(records);
    } catch (_error) {
      throwServiceError("invalid_history", "Ownership Retraction validator threw while validating retraction history.");
    }
    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwServiceError("invalid_history", "Ownership Retraction history validator returned an invalid result shape.");
    }
    if (!result.valid) {
      throwServiceError("invalid_history", "Ownership Retraction history validation failed.", cloneErrors(result.errors));
    }
  }

  function createOwnershipRetractionService(options) {
    if (!isRecordObject(options)) {
      throwServiceError("invalid_factory", "Ownership Retraction Service requires options to be a plain object.");
    }
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      throwServiceError("invalid_factory", `Ownership Retraction Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        throwServiceError("invalid_factory", `Ownership Retraction Service requires options.${field}.`);
      }
    });
    const input = options;

    const validateRetractionRecord = requireCallable(
      input,
      input.validateOwnershipRetractionRecord,
      "options.validateOwnershipRetractionRecord"
    );
    const validateRetractionHistory = requireCallable(
      input,
      input.validateOwnershipRetractionHistory,
      "options.validateOwnershipRetractionHistory"
    );

    const state = {
      records: [],
      indexById: new Map(),
      indexByRetractedRecordId: new Map()
    };

    function rebuildIndexes(records) {
      const indexById = new Map();
      const indexByRetractedRecordId = new Map();
      records.forEach((record, index) => {
        indexById.set(record.retractionId, index);
        indexByRetractedRecordId.set(record.retractedRecordId, index);
      });
      return { indexById, indexByRetractedRecordId };
    }

    function commit(nextRecords) {
      validateHistory(validateRetractionHistory, nextRecords);
      const nextIndexes = rebuildIndexes(nextRecords);
      state.records = nextRecords;
      state.indexById = nextIndexes.indexById;
      state.indexByRetractedRecordId = nextIndexes.indexByRetractedRecordId;
    }

    function cloneRecords() {
      return state.records.map((record) => deepClone(record));
    }

    function normalizeFilter(filter) {
      if (filter === undefined) return null;
      const value = requireRecordObject(filter, "filter");
      requireKnownFields(value, FILTER_FIELDS, "filter");
      const normalized = {};
      Object.keys(value).forEach((field) => {
        if (typeof value[field] !== "string" || value[field].trim() === "") {
          throwServiceError("invalid_input", `Ownership Retraction Service requires filter.${field} to be a non-empty string.`);
        }
        normalized[field] = value[field];
      });
      return normalized;
    }

    function listRetractions(filter) {
      const normalized = normalizeFilter(filter);
      const records = normalized === null ? state.records : state.records.filter((record) => (
        Object.keys(normalized).every((field) => record[field] === normalized[field])
      ));
      return records.map((record) => deepClone(record));
    }

    function getRetraction(retractionId) {
      if (typeof retractionId !== "string" || retractionId.trim() === "") {
        throwServiceError("invalid_input", "Ownership Retraction Service requires retractionId to be non-empty.");
      }
      const index = state.indexById.get(retractionId);
      return index === undefined ? null : deepClone(state.records[index]);
    }

    function hasRetraction(retractionId) {
      if (typeof retractionId !== "string" || retractionId.trim() === "") {
        throwServiceError("invalid_input", "Ownership Retraction Service requires retractionId to be non-empty.");
      }
      return state.indexById.has(retractionId);
    }

    function hasRetractedRecordReference(retractedRecordId) {
      if (typeof retractedRecordId !== "string" || retractedRecordId.trim() === "") {
        throwServiceError("invalid_input", "Ownership Retraction Service requires retractedRecordId to be non-empty.");
      }
      return state.indexByRetractedRecordId.has(retractedRecordId);
    }

    function addManualRetraction(value) {
      const inputRecord = requireRecordObject(value, "input");
      requireKnownFields(inputRecord, RETRACTION_FIELDS, "input");
      requireRequiredFields(inputRecord, RETRACTION_FIELDS, "input");

      const record = deepClone(inputRecord);
      validateRecord(validateRetractionRecord, record);
      if (state.indexById.has(record.retractionId)) {
        throwServiceError("duplicate_retraction_id", `Ownership Retraction Service already contains retractionId '${record.retractionId}'.`);
      }
      if (state.indexByRetractedRecordId.has(record.retractedRecordId)) {
        throwServiceError("duplicate_retracted_record", `Ownership Retraction Service already contains a retraction for '${record.retractedRecordId}'.`);
      }

      const nextRecords = cloneRecords();
      nextRecords.push(record);
      commit(nextRecords);
      return deepClone(record);
    }

    function captureTransactionState() {
      return cloneRecords();
    }

    function restoreTransactionState(snapshot) {
      const records = requireArray(snapshot, "snapshot").map((record) => deepClone(record));
      commit(records);
    }

    const initial = requireArray(input.initialRetractions, "options.initialRetractions")
      .map((record) => deepClone(record));
    commit(initial);

    return Object.freeze({
      listRetractions,
      getRetraction,
      hasRetraction,
      hasRetractedRecordReference,
      addManualRetraction,
      captureTransactionState,
      restoreTransactionState
    });
  }

  const exportsObject = {
    createOwnershipRetractionService,
    OwnershipRetractionServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
