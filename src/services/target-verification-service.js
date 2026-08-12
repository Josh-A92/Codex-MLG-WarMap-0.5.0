(function initializeTargetVerificationServiceFactory(globalScope) {
  const temporalContractFactory = globalScope.createTemporalMetadataContract
    || (typeof require === "function"
      ? require("./temporal-metadata-contract.js").createTemporalMetadataContract
      : null);
  const FACTORY_FIELDS = new Set([
    "initialVerifications",
    "validateTargetVerificationRecord",
    "validateTargetVerificationHistory",
    "clock"
  ]);

  const FILTER_FIELDS = new Set([
    "verificationId",
    "serverId",
    "seasonId",
    "targetType",
    "sourceType",
    "reviewState",
    "actorId",
    "reviewerId"
  ]);

  const SOURCE_TYPES = new Set([
    "manual_entry",
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
  ]);

  const REVIEW_STATES = new Set(["confirmed", "superseded"]);
  const TARGET_TYPES = new Set(["normal_map_cell", "logical_structure"]);

  class TargetVerificationServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "TargetVerificationServiceError";
      this.code = code;
      if (validationErrors) {
        this.validationErrors = validationErrors;
      }
    }
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function isRecordObject(value) {
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

    if (!isRecordObject(value)) {
      return value;
    }

    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });
    return clone;
  }

  function cloneValidationErrors(errors) {
    if (!Array.isArray(errors)) {
      return [];
    }

    return errors.map((error) => ({
      code: isRecordObject(error) && typeof error.code === "string" ? error.code : "UNKNOWN",
      path: isRecordObject(error) && typeof error.path === "string" ? error.path : "",
      message: isRecordObject(error) && typeof error.message === "string" ? error.message : ""
    }));
  }

  function throwServiceError(code, message, validationErrors) {
    throw new TargetVerificationServiceError(
      code,
      message,
      validationErrors ? cloneValidationErrors(validationErrors) : undefined
    );
  }

  function requireRecordObject(value, path) {
    if (!isRecordObject(value)) {
      throwServiceError("invalid_input", `Target Verification Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireNonEmptyString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      throwServiceError("invalid_input", `Target Verification Service requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireKnownFields(record, allowedFields, path) {
    const unknownFields = Object.keys(record).filter((key) => !allowedFields.has(key)).sort();
    if (unknownFields.length > 0) {
      throwServiceError("invalid_input", `Target Verification Service does not recognize ${path} field '${unknownFields[0]}'.`);
    }
  }

  function requireRequiredFields(record, requiredFields, path) {
    const fields = Array.from(requiredFields);
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throwServiceError("invalid_input", `Target Verification Service requires ${path}.${field}.`);
      }
    }
  }

  function createCallableValidator(owner, value, fieldName) {
    if (typeof value !== "function") {
      throwServiceError("invalid_input", `Target Verification Service requires ${fieldName} to be a function.`);
    }

    return function boundValidator() {
      return value.apply(owner, arguments);
    };
  }

  function validateResultShape(result, context) {
    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwServiceError("invalid_history", `Target Verification Service received an invalid validator result for ${context}.`);
    }
  }

  function validateRecord(validator, record) {
    let result;
    try {
      result = validator(record);
    } catch (error) {
      throwServiceError("invalid_history", "Target Verification Service record validator threw.");
    }

    validateResultShape(result, "record");
    if (!result.valid) {
      throwServiceError("invalid_history", "Target Verification Service record validation failed.", result.errors);
    }
  }

  function validateHistory(validator, records) {
    let result;
    try {
      result = validator(records);
    } catch (error) {
      throwServiceError("invalid_history", "Target Verification Service history validator threw.");
    }

    validateResultShape(result, "history");
    if (!result.valid) {
      throwServiceError("invalid_history", "Target Verification Service history validation failed.", result.errors);
    }
  }

  function canonicalTargetKey(serverId, seasonId, targetRef) {
    const ref = requireRecordObject(targetRef, "targetRef");
    const type = requireNonEmptyString(ref.type, "targetRef.type");

    if (type === "normal_map_cell") {
      requireKnownFields(ref, new Set(["type", "row", "col"]), "targetRef");
      requireRequiredFields(ref, new Set(["type", "row", "col"]), "targetRef");
      if (!Number.isInteger(ref.row) || ref.row < 1 || !Number.isInteger(ref.col) || ref.col < 1) {
        throwServiceError("invalid_input", "Target Verification Service requires positive targetRef row and col values.");
      }
      return JSON.stringify([seasonId, serverId, type, ref.row, ref.col]);
    }

    if (type === "logical_structure") {
      requireKnownFields(ref, new Set(["type", "structureId"]), "targetRef");
      requireRequiredFields(ref, new Set(["type", "structureId"]), "targetRef");
      return JSON.stringify([
        seasonId,
        serverId,
        type,
        requireNonEmptyString(ref.structureId, "targetRef.structureId")
      ]);
    }

    throwServiceError("invalid_input", `Target Verification Service does not support targetRef.type '${type}'.`);
  }

  function recordTargetKey(record) {
    return canonicalTargetKey(record.serverId, record.seasonId, record.targetRef);
  }

  function buildIndexes(records) {
    const recordIndexById = new Map();
    const currentRecordByTarget = new Map();

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      recordIndexById.set(record.verificationId, index);

      if (record.reviewState !== "confirmed" || record.supersededBy !== null) {
        continue;
      }

      const key = recordTargetKey(record);
      const selectedId = currentRecordByTarget.get(key);
      if (!selectedId) {
        currentRecordByTarget.set(key, record.verificationId);
        continue;
      }

      const selectedIndex = recordIndexById.get(selectedId);
      const selected = records[selectedIndex];
      if (Date.parse(record.observedAt) > Date.parse(selected.observedAt)) {
        currentRecordByTarget.set(key, record.verificationId);
      }
    }

    return { recordIndexById, currentRecordByTarget };
  }

  function createTargetVerificationService(options) {
    const input = requireRecordObject(options, "options");
    requireKnownFields(input, FACTORY_FIELDS, "options");
    requireRequiredFields(input, FACTORY_FIELDS, "options");
    if (typeof input.clock !== "function") throwServiceError("invalid_input", "Target Verification Service requires options.clock.");

    if (!Array.isArray(input.initialVerifications)) {
      throwServiceError("invalid_input", "Target Verification Service requires options.initialVerifications to be an array.");
    }

    const validateTargetVerificationRecord = createCallableValidator(
      input,
      input.validateTargetVerificationRecord,
      "options.validateTargetVerificationRecord"
    );
    const validateTargetVerificationHistory = createCallableValidator(
      input,
      input.validateTargetVerificationHistory,
      "options.validateTargetVerificationHistory"
    );

    const state = {
      records: [],
      recordIndexById: new Map(),
      currentRecordByTarget: new Map()
    };
    const temporalContract = temporalContractFactory({ clock: input.clock });

    function normalizeTemporal(record, mode) {
      const preservedRecordedAt = mode === "existing" ? record.recordedAt : undefined;
      const inputRecord = mode === "existing" && Object.prototype.hasOwnProperty.call(record, "recordedAt")
        ? (() => { const copy = deepClone(record); delete copy.recordedAt; return copy; })()
        : record;
      const normalized = mode === "legacy"
        ? temporalContract.normalizeLegacy(inputRecord)
        : temporalContract.normalizeNew({ ...inputRecord, eventAt: inputRecord.eventAt || { precision: "unknown" } });
      if (mode === "existing") normalized.recordedAt = preservedRecordedAt;
      return normalized;
    }

    function commit(nextRecords) {
      validateHistory(validateTargetVerificationHistory, nextRecords);
      const indexes = buildIndexes(nextRecords);
      state.records = nextRecords;
      state.recordIndexById = indexes.recordIndexById;
      state.currentRecordByTarget = indexes.currentRecordByTarget;
    }

    function normalizeFilter(filter) {
      if (filter === undefined) {
        return null;
      }

      const value = requireRecordObject(filter, "filter");
      requireKnownFields(value, FILTER_FIELDS, "filter");
      const normalized = {};

      Object.keys(value).forEach((field) => {
        const fieldValue = value[field];
        if (field === "targetType") {
          if (!TARGET_TYPES.has(fieldValue)) {
            throwServiceError("invalid_input", `Target Verification Service does not support filter.targetType '${fieldValue}'.`);
          }
        } else if (field === "sourceType") {
          if (!SOURCE_TYPES.has(fieldValue)) {
            throwServiceError("invalid_input", `Target Verification Service does not support filter.sourceType '${fieldValue}'.`);
          }
        } else if (field === "reviewState") {
          if (!REVIEW_STATES.has(fieldValue)) {
            throwServiceError("invalid_input", `Target Verification Service does not support filter.reviewState '${fieldValue}'.`);
          }
        } else {
          requireNonEmptyString(fieldValue, `filter.${field}`);
        }
        defineOwnDataProperty(normalized, field, fieldValue);
      });

      return normalized;
    }

    function listVerifications(filter) {
      const normalized = normalizeFilter(filter);
      const records = normalized === null
        ? state.records
        : state.records.filter((record) => Object.keys(normalized).every((field) => {
            if (field === "targetType") {
              return record.targetRef.type === normalized.targetType;
            }
            return record[field] === normalized[field];
          }));

      return records.map((record) => deepClone(record));
    }

    function getVerification(verificationId) {
      const id = requireNonEmptyString(verificationId, "verificationId");
      const index = state.recordIndexById.get(id);
      return index === undefined ? null : deepClone(state.records[index]);
    }

    function hasVerification(verificationId) {
      return state.recordIndexById.has(requireNonEmptyString(verificationId, "verificationId"));
    }

    function getCurrentVerification(serverId, seasonId, targetRef) {
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      const normalizedSeasonId = requireNonEmptyString(seasonId, "seasonId");
      const key = canonicalTargetKey(normalizedServerId, normalizedSeasonId, targetRef);
      const id = state.currentRecordByTarget.get(key);
      if (!id) {
        return null;
      }
      const index = state.recordIndexById.get(id);
      return index === undefined ? null : deepClone(state.records[index]);
    }

    function addConfirmedVerification(value) {
      const record = normalizeTemporal(requireRecordObject(value, "record"), "new");
      validateRecord(validateTargetVerificationRecord, record);
      if (record.reviewState !== "confirmed" || record.supersededBy !== null) {
        throwServiceError("invalid_transition", "Target Verification Service only adds current confirmed verification records.");
      }
      if (state.recordIndexById.has(record.verificationId)) {
        throwServiceError("duplicate_verification_id", `Target Verification Service already contains verificationId '${record.verificationId}'.`);
      }

      const next = state.records.map((entry) => deepClone(entry));
      next.push(deepClone(record));
      commit(next);
      return deepClone(record);
    }

    function correctVerification(verificationId, replacementValue) {
      const id = requireNonEmptyString(verificationId, "verificationId");
      const index = state.recordIndexById.get(id);
      if (index === undefined) {
        throwServiceError("unknown_verification", `Target Verification Service does not contain verificationId '${id}'.`);
      }

      const existing = state.records[index];
      if (existing.reviewState !== "confirmed" || existing.supersededBy !== null) {
        throwServiceError("invalid_transition", "Target Verification Service only corrects confirmed non-superseded records.");
      }

      const replacement = normalizeTemporal(requireRecordObject(replacementValue, "replacement"), "new");
      validateRecord(validateTargetVerificationRecord, replacement);
      if (replacement.reviewState !== "confirmed" || replacement.supersededBy !== null) {
        throwServiceError("invalid_transition", "Target Verification Service requires a current confirmed replacement.");
      }
      if (state.recordIndexById.has(replacement.verificationId)) {
        throwServiceError("duplicate_verification_id", `Target Verification Service already contains verificationId '${replacement.verificationId}'.`);
      }

      const superseded = deepClone(existing);
      defineOwnDataProperty(superseded, "reviewState", "superseded");
      defineOwnDataProperty(superseded, "supersededBy", replacement.verificationId);

      const next = state.records.map((entry) => deepClone(entry));
      next[index] = superseded;
      next.push(deepClone(replacement));
      commit(next);
      return deepClone(replacement);
    }

    function captureTransactionState() {
      return state.records.map((record) => deepClone(record));
    }

    function restoreTransactionState(snapshot) {
      if (!Array.isArray(snapshot)) {
        throwServiceError(
          "invalid_input",
          "Target Verification Service requires snapshot to be an array."
        );
      }
      validateHistory(validateTargetVerificationHistory, snapshot);
      const nextRecords = deepClone(snapshot);
      const indexes = buildIndexes(nextRecords);
      state.records = nextRecords;
      state.recordIndexById = indexes.recordIndexById;
      state.currentRecordByTarget = indexes.currentRecordByTarget;
    }

    const initialRecords = input.initialVerifications.map((record) => normalizeTemporal(record, "legacy"));
    validateHistory(validateTargetVerificationHistory, initialRecords);
    const initialIndexes = buildIndexes(initialRecords);
    state.records = initialRecords;
    state.recordIndexById = initialIndexes.recordIndexById;
    state.currentRecordByTarget = initialIndexes.currentRecordByTarget;

    return {
      listVerifications,
      getVerification,
      hasVerification,
      getCurrentVerification,
      addConfirmedVerification,
      correctVerification,
      captureTransactionState,
      restoreTransactionState
    };
  }

  const exportsObject = {
    createTargetVerificationService,
    TargetVerificationServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
