(function initializeActiveUnionStatusServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialStatuses",
    "validateActiveUnionStatus",
    "validateActiveUnionStatusHistory"
  ]);

  const FILTER_FIELDS = new Set([
    "statusId",
    "seasonId",
    "serverId",
    "unionId",
    "activityState",
    "reviewState",
    "derivedFrom"
  ]);

  class ActiveUnionStatusServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "ActiveUnionStatusServiceError";
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
      const clone = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        clone[index] = deepClone(value[index]);
      }
      return clone;
    }

    if (!isRecordObject(value)) {
      return value;
    }

    const prototype = Object.getPrototypeOf(value);
    const clone = prototype === null ? Object.create(null) : {};

    Object.keys(value).forEach((key) => {
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });

    return clone;
  }

  function cloneValidationErrors(errors) {
    if (!Array.isArray(errors)) {
      return [];
    }

    return errors.map((error) => {
      if (!isRecordObject(error)) {
        return {
          code: "UNKNOWN",
          path: "",
          message: "Invalid validation error shape."
        };
      }

      return {
        code: typeof error.code === "string" ? error.code : "UNKNOWN",
        path: typeof error.path === "string" ? error.path : "",
        message: typeof error.message === "string" ? error.message : ""
      };
    });
  }

  function createServiceError(code, message, validationErrors) {
    return new ActiveUnionStatusServiceError(
      code,
      message,
      validationErrors ? cloneValidationErrors(validationErrors) : undefined
    );
  }

  function throwInvalidInput(message) {
    throw createServiceError("invalid_input", message);
  }

  function throwDuplicateStatusId(statusId) {
    throw createServiceError("duplicate_status_id", `Active Union Status Service requires statusId '${statusId}' to be unique.`);
  }

  function throwInvalidTransition(message) {
    throw createServiceError("invalid_transition", message);
  }

  function throwInvalidHistory(validationErrors, message) {
    throw createServiceError(
      "invalid_history",
      message || "Active Union Status Service history validation failed.",
      validationErrors
    );
  }

  function requireRecordObject(value, fieldName) {
    if (!isRecordObject(value)) {
      throwInvalidInput(`Active Union Status Service requires ${fieldName} to be a plain object.`);
    }

    return value;
  }

  function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
      throwInvalidInput(`Active Union Status Service requires ${fieldName} to be an array.`);
    }

    return value;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
      throwInvalidInput(`Active Union Status Service requires ${fieldName} to be a non-empty string.`);
    }

    return value;
  }

  function requireKnownFields(value, allowedFields, fieldName) {
    const unknownFields = Object.keys(value).filter((key) => !allowedFields.has(key)).sort();
    if (unknownFields.length > 0) {
      throwInvalidInput(`Active Union Status Service does not recognize ${fieldName} field '${unknownFields[0]}'.`);
    }
  }

  function requireRequiredFields(value, requiredFields, fieldName) {
    for (let index = 0; index < requiredFields.length; index += 1) {
      const requiredField = requiredFields[index];
      if (!Object.prototype.hasOwnProperty.call(value, requiredField)) {
        throwInvalidInput(`Active Union Status Service requires ${fieldName}.${requiredField}.`);
      }
    }
  }

  function tupleKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  function createCallableValidator(owner, maybeFn, fieldName) {
    if (typeof maybeFn !== "function") {
      throwInvalidInput(`Active Union Status Service requires ${fieldName} to be a function.`);
    }

    return function boundValidator() {
      return maybeFn.apply(owner, arguments);
    };
  }

  function validateSingleRecord(validator, record) {
    const result = validator(record);

    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwInvalidHistory([], "Active Union Status Service received an invalid validator result for a record.");
    }

    if (!result.valid) {
      throwInvalidHistory(result.errors, "Active Union Status Service record validation failed.");
    }
  }

  function validateHistory(validator, records) {
    const result = validator(records);

    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwInvalidHistory([], "Active Union Status Service received an invalid validator result for history.");
    }

    if (!result.valid) {
      throwInvalidHistory(result.errors, "Active Union Status Service history validation failed.");
    }
  }

  function createActiveUnionStatusService(options) {
    const factoryInput = requireRecordObject(options, "options");
    requireKnownFields(factoryInput, FACTORY_FIELDS, "options");
    requireRequiredFields(factoryInput, [
      "initialStatuses",
      "validateActiveUnionStatus",
      "validateActiveUnionStatusHistory"
    ], "options");

    const initialStatuses = requireArray(factoryInput.initialStatuses, "options.initialStatuses");
    const validateActiveUnionStatus = createCallableValidator(
      factoryInput,
      factoryInput.validateActiveUnionStatus,
      "options.validateActiveUnionStatus"
    );
    const validateActiveUnionStatusHistory = createCallableValidator(
      factoryInput,
      factoryInput.validateActiveUnionStatusHistory,
      "options.validateActiveUnionStatusHistory"
    );

    const state = {
      statuses: [],
      statusIndexById: new Map(),
      currentStatusByGroup: new Map()
    };

    function rebuildIndexes() {
      state.statusIndexById = new Map();
      state.currentStatusByGroup = new Map();

      for (let index = 0; index < state.statuses.length; index += 1) {
        const status = state.statuses[index];
        state.statusIndexById.set(status.statusId, index);

        if (status.reviewState === "confirmed" && status.effectiveTo === null && status.supersededBy === null) {
          state.currentStatusByGroup.set(tupleKey(status.seasonId, status.serverId, status.unionId), status.statusId);
        }
      }
    }

    function commit(nextStatuses) {
      validateHistory(validateActiveUnionStatusHistory, nextStatuses);
      state.statuses = nextStatuses;
      rebuildIndexes();
    }

    function getCurrentStatusEntryForRecord(record) {
      const groupId = tupleKey(record.seasonId, record.serverId, record.unionId);
      const currentStatusId = state.currentStatusByGroup.get(groupId);
      if (!currentStatusId) {
        return null;
      }

      const currentIndex = state.statusIndexById.get(currentStatusId);
      if (currentIndex === undefined) {
        return null;
      }

      return {
        index: currentIndex,
        record: state.statuses[currentIndex]
      };
    }

    function buildSupersededRecord(existingRecord, replacementStatusId, replacementEffectiveFrom) {
      const supersededRecord = deepClone(existingRecord);
      defineOwnDataProperty(supersededRecord, "reviewState", "superseded");
      defineOwnDataProperty(supersededRecord, "effectiveTo", replacementEffectiveFrom);
      defineOwnDataProperty(supersededRecord, "supersededBy", replacementStatusId);
      return supersededRecord;
    }

    function requireFilter(filter) {
      if (filter === undefined) {
        return null;
      }

      const normalizedFilter = requireRecordObject(filter, "filter");
      requireKnownFields(normalizedFilter, FILTER_FIELDS, "filter");

      const output = {};
      FILTER_FIELDS.forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(normalizedFilter, fieldName)) {
          return;
        }

        output[fieldName] = requireNonEmptyString(normalizedFilter[fieldName], `filter.${fieldName}`);
      });

      return output;
    }

    function listStatuses(filter) {
      const normalizedFilter = requireFilter(filter);

      if (!normalizedFilter) {
        return deepClone(state.statuses);
      }

      const filtered = [];
      for (let index = 0; index < state.statuses.length; index += 1) {
        const status = state.statuses[index];
        let include = true;

        const filterFields = Object.keys(normalizedFilter);
        for (let fieldIndex = 0; fieldIndex < filterFields.length; fieldIndex += 1) {
          const fieldName = filterFields[fieldIndex];
          if (status[fieldName] !== normalizedFilter[fieldName]) {
            include = false;
            break;
          }
        }

        if (include) {
          filtered.push(deepClone(status));
        }
      }

      return filtered;
    }

    function getStatus(statusId) {
      const normalizedStatusId = requireNonEmptyString(statusId, "statusId");
      const index = state.statusIndexById.get(normalizedStatusId);
      return index === undefined ? null : deepClone(state.statuses[index]);
    }

    function hasStatus(statusId) {
      const normalizedStatusId = requireNonEmptyString(statusId, "statusId");
      return state.statusIndexById.has(normalizedStatusId);
    }

    function getCurrentStatus(seasonId, serverId, unionId) {
      const normalizedSeasonId = requireNonEmptyString(seasonId, "seasonId");
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      const normalizedUnionId = requireNonEmptyString(unionId, "unionId");

      const currentStatusId = state.currentStatusByGroup.get(tupleKey(normalizedSeasonId, normalizedServerId, normalizedUnionId));
      if (!currentStatusId) {
        return null;
      }

      const index = state.statusIndexById.get(currentStatusId);
      return index === undefined ? null : deepClone(state.statuses[index]);
    }

    function appendDerivedStatus(record) {
      const candidateInput = requireRecordObject(record, "record");
      const candidateRecord = deepClone(candidateInput);

      validateSingleRecord(validateActiveUnionStatus, candidateRecord);

      if (candidateRecord.reviewState !== "confirmed" || candidateRecord.effectiveTo !== null || candidateRecord.supersededBy !== null) {
        throwInvalidTransition(
          "Active Union Status Service appendDerivedStatus requires reviewState=confirmed, effectiveTo=null, and supersededBy=null."
        );
      }

      if (state.statusIndexById.has(candidateRecord.statusId)) {
        throwDuplicateStatusId(candidateRecord.statusId);
      }

      const currentEntry = getCurrentStatusEntryForRecord(candidateRecord);

      if (currentEntry) {
        const currentTime = Date.parse(currentEntry.record.effectiveFrom);
        const replacementTime = Date.parse(candidateRecord.effectiveFrom);

        if (!Number.isFinite(currentTime) || !Number.isFinite(replacementTime) || replacementTime < currentTime) {
          throwInvalidTransition(
            "Active Union Status Service requires replacement effectiveFrom to be equal to or later than the current status effectiveFrom."
          );
        }
      }

      const nextStatuses = deepClone(state.statuses);

      if (currentEntry) {
        nextStatuses[currentEntry.index] = buildSupersededRecord(
          nextStatuses[currentEntry.index],
          candidateRecord.statusId,
          candidateRecord.effectiveFrom
        );
      }

      nextStatuses.push(candidateRecord);
      commit(nextStatuses);
      return deepClone(candidateRecord);
    }

    const initialSnapshot = deepClone(initialStatuses);
    validateHistory(validateActiveUnionStatusHistory, initialSnapshot);
    state.statuses = initialSnapshot;
    rebuildIndexes();

    return {
      listStatuses,
      getStatus,
      hasStatus,
      getCurrentStatus,
      appendDerivedStatus
    };
  }

  const exportsObject = {
    createActiveUnionStatusService,
    ActiveUnionStatusServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));