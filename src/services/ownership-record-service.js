(function initializeOwnershipRecordServiceFactory(globalScope) {
  const temporalContractFactory = globalScope.createTemporalMetadataContract
    || (typeof require === "function"
      ? require("./temporal-metadata-contract.js").createTemporalMetadataContract
      : null);
  const FACTORY_FIELDS = new Set([
    "initialTerritoryRecords",
    "initialStructureRecords",
    "validateTerritoryOwnershipRecord",
    "validateTerritoryOwnershipHistory",
    "validateStructureOwnershipRecord",
    "validateStructureOwnershipHistory",
    "clock"
  ]);

  const TERRITORY_PROPOSAL_FIELDS = new Set([
    "ownershipRecordId",
    "serverId",
    "seasonId",
    "territoryRef",
    "ownerUnionId",
    "ownershipState",
    "effectiveAt",
    "eventAt",
    "observedAt",
    "recordedAt",
    "ruleVersionRef",
    "sourceType",
    "evidenceIds",
    "actorId"
  ]);

  const STRUCTURE_PROPOSAL_FIELDS = new Set([
    "structureOwnershipId",
    "serverId",
    "seasonId",
    "structureId",
    "ownerUnionId",
    "ownershipState",
    "effectiveAt",
    "eventAt",
    "observedAt",
    "recordedAt",
    "ruleVersionRef",
    "sourceType",
    "evidenceIds",
    "actorId"
  ]);

  const TERRITORY_MANUAL_FIELDS = new Set([
    "ownershipRecordId",
    "serverId",
    "seasonId",
    "territoryRef",
    "ownerUnionId",
    "ownershipState",
    "effectiveAt",
    "eventAt",
    "observedAt",
    "recordedAt",
    "ruleVersionRef",
    "evidenceIds",
    "actorId",
    "reviewerId",
    "reviewedAt"
  ]);

  const STRUCTURE_MANUAL_FIELDS = new Set([
    "structureOwnershipId",
    "serverId",
    "seasonId",
    "structureId",
    "ownerUnionId",
    "ownershipState",
    "effectiveAt",
    "eventAt",
    "observedAt",
    "recordedAt",
    "ruleVersionRef",
    "evidenceIds",
    "actorId",
    "reviewerId",
    "reviewedAt"
  ]);

  const REVIEW_FIELDS = new Set(["reviewerId", "reviewedAt"]);
  const COMMON_FILTER_FIELDS = [
    "serverId",
    "seasonId",
    "ownershipState",
    "reviewState",
    "sourceType",
    "ownerUnionId"
  ];
  const OWNERSHIP_STATES = new Set(["owned", "unclaimed", "unknown"]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const SOURCE_TYPES = new Set([
    "manual_entry",
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
  ]);
  const OPTIONAL_TEMPORAL_FIELDS = new Set(["eventAt", "observedAt", "recordedAt", "ruleVersionRef"]);

  class OwnershipRecordServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "OwnershipRecordServiceError";
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
    throw new OwnershipRecordServiceError(
      code,
      message,
      validationErrors ? cloneValidationErrors(validationErrors) : undefined
    );
  }

  function requireRecordObject(value, path) {
    if (!isRecordObject(value)) {
      throwServiceError("invalid_input", `Ownership Record Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) {
      throwServiceError("invalid_input", `Ownership Record Service requires ${path} to be an array.`);
    }
    return value;
  }

  function requireNonEmptyString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      throwServiceError("invalid_input", `Ownership Record Service requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireKnownFields(record, allowedFields, path) {
    const unknownFields = Object.keys(record).filter((key) => !allowedFields.has(key)).sort();
    if (unknownFields.length > 0) {
      throwServiceError("invalid_input", `Ownership Record Service does not recognize ${path} field '${unknownFields[0]}'.`);
    }
  }

  function requireRequiredFields(record, requiredFields, path) {
    const fields = Array.from(requiredFields);
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throwServiceError("invalid_input", `Ownership Record Service requires ${path}.${field}.`);
      }
    }
  }

  function createCallableValidator(owner, value, fieldName) {
    if (typeof value !== "function") {
      throwServiceError("invalid_input", `Ownership Record Service requires ${fieldName} to be a function.`);
    }
    return function boundValidator() {
      return value.apply(owner, arguments);
    };
  }

  function validateResultShape(result, context) {
    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwServiceError("invalid_history", `Ownership Record Service received an invalid validator result for ${context}.`);
    }
  }

  function validateRecord(validator, record, context) {
    let result;
    try {
      result = validator(record);
    } catch (error) {
      throwServiceError("invalid_history", `Ownership Record Service validator threw while validating ${context}.`);
    }
    validateResultShape(result, context);
    if (!result.valid) {
      throwServiceError("invalid_history", `Ownership Record Service ${context} validation failed.`, result.errors);
    }
  }

  function validateHistory(validator, records, context) {
    let result;
    try {
      result = validator(records);
    } catch (error) {
      throwServiceError("invalid_history", `Ownership Record Service validator threw while validating ${context}.`);
    }
    validateResultShape(result, context);
    if (!result.valid) {
      throwServiceError("invalid_history", `Ownership Record Service ${context} validation failed.`, result.errors);
    }
  }

  function territoryTargetKey(serverId, seasonId, territoryRef) {
    const ref = requireRecordObject(territoryRef, "territoryRef");
    requireKnownFields(ref, new Set(["type", "row", "col"]), "territoryRef");
    requireRequiredFields(ref, new Set(["type", "row", "col"]), "territoryRef");
    if (ref.type !== "normal_map_cell" || !Number.isInteger(ref.row) || ref.row < 1 || !Number.isInteger(ref.col) || ref.col < 1) {
      throwServiceError("invalid_input", "Ownership Record Service requires territoryRef to identify a positive normal_map_cell row and col.");
    }
    return JSON.stringify([seasonId, serverId, ref.type, ref.row, ref.col]);
  }

  function structureTargetKey(serverId, seasonId, structureId) {
    return JSON.stringify([
      requireNonEmptyString(seasonId, "seasonId"),
      requireNonEmptyString(serverId, "serverId"),
      requireNonEmptyString(structureId, "structureId")
    ]);
  }

  function copyFields(source, fields) {
    const output = Object.getPrototypeOf(source) === null ? Object.create(null) : {};
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(source, field)) {
        defineOwnDataProperty(output, field, deepClone(source[field]));
      }
    });
    return output;
  }

  function createRecordStore(config) {
    const state = {
      records: [],
      recordIndexById: new Map(),
      currentRecordByTarget: new Map()
    };

    function recordTargetKey(record) {
      if (config.kind === "territory") {
        return territoryTargetKey(record.serverId, record.seasonId, record.territoryRef);
      }
      return structureTargetKey(record.serverId, record.seasonId, record.structureId);
    }

    function buildIndexes(records) {
      const recordIndexById = new Map();
      const currentRecordByTarget = new Map();
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        recordIndexById.set(record[config.idField], index);
        const exactEventTime = !record.eventAt || record.eventAt.precision === "exact";
        if (exactEventTime && record.reviewState === "confirmed" && record.supersededBy === null) {
          currentRecordByTarget.set(recordTargetKey(record), record[config.idField]);
        }
      }
      return { recordIndexById, currentRecordByTarget };
    }

    function commit(nextRecords) {
      validateHistory(config.validateHistory, nextRecords, `${config.label} history`);
      const indexes = buildIndexes(nextRecords);
      state.records = nextRecords;
      state.recordIndexById = indexes.recordIndexById;
      state.currentRecordByTarget = indexes.currentRecordByTarget;
    }

    function cloneRecords() {
      return state.records.map((record) => deepClone(record));
    }

    function findCurrent(record) {
      const currentId = state.currentRecordByTarget.get(recordTargetKey(record));
      if (!currentId) {
        return null;
      }
      const index = state.recordIndexById.get(currentId);
      return index === undefined ? null : { index, record: state.records[index] };
    }

    function buildSupersededRecord(record, replacementId) {
      const next = deepClone(record);
      defineOwnDataProperty(next, "reviewState", "superseded");
      defineOwnDataProperty(next, "supersededBy", replacementId);
      return next;
    }

    function buildProposal(input) {
      const record = copyFields(input, config.proposalFields);
      defineOwnDataProperty(record, "reviewState", "proposed");
      defineOwnDataProperty(record, "reviewerId", null);
      defineOwnDataProperty(record, "reviewedAt", null);
      defineOwnDataProperty(record, "supersededBy", null);
      return record;
    }

    function buildManualConfirmed(input) {
      const record = copyFields(input, config.manualFields);
      defineOwnDataProperty(record, "sourceType", "manual_entry");
      defineOwnDataProperty(record, "reviewState", "confirmed");
      defineOwnDataProperty(record, "supersededBy", null);
      return record;
    }

    function normalizeTemporal(record, mode) {
      if (!temporalContractFactory) {
        throwServiceError("invalid_factory", "Temporal metadata contract is unavailable.");
      }
      const preservedRecordedAt = mode === "existing" ? record.recordedAt : undefined;
      const inputRecord = mode === "existing" && Object.prototype.hasOwnProperty.call(record, "recordedAt")
        ? (() => { const copy = deepClone(record); delete copy.recordedAt; return copy; })()
        : record;
      const normalized = mode === "legacy"
        ? config.temporalContract.normalizeLegacy(inputRecord)
        : config.temporalContract.normalizeNew({
          ...inputRecord,
          eventAt: inputRecord.eventAt || {
            precision: "exact",
            at: inputRecord.effectiveAt
          }
        });
      if (mode === "existing") normalized.recordedAt = preservedRecordedAt;
      if (normalized.eventAt && normalized.eventAt.precision === "exact") {
        normalized.effectiveAt = normalized.eventAt.at;
      } else {
        delete normalized.effectiveAt;
      }
      return normalized;
    }

    function buildReviewedProposal(record, reviewState, review) {
      const next = deepClone(record);
      defineOwnDataProperty(next, "reviewState", reviewState);
      defineOwnDataProperty(next, "reviewerId", review.reviewerId);
      defineOwnDataProperty(next, "reviewedAt", review.reviewedAt);
      defineOwnDataProperty(next, "supersededBy", null);
      return next;
    }

    function normalizeInput(value, allowedFields, path) {
      const input = requireRecordObject(value, path);
      requireKnownFields(input, allowedFields, path);
      requireRequiredFields(input, new Set(Array.from(allowedFields).filter((field) => !OPTIONAL_TEMPORAL_FIELDS.has(field))), path);
      return input;
    }

    function normalizeReview(value) {
      return normalizeInput(value, REVIEW_FIELDS, "review");
    }

    function normalizeFilter(filter) {
      if (filter === undefined) {
        return null;
      }
      const value = requireRecordObject(filter, "filter");
      requireKnownFields(value, config.filterFields, "filter");
      const normalized = {};
      Object.keys(value).forEach((field) => {
        const fieldValue = value[field];
        if (field === "ownerUnionId") {
          if (fieldValue !== null) {
            requireNonEmptyString(fieldValue, `filter.${field}`);
          }
        } else if (field === "ownershipState") {
          if (!OWNERSHIP_STATES.has(fieldValue)) {
            throwServiceError("invalid_input", `Ownership Record Service does not support filter.${field} '${fieldValue}'.`);
          }
        } else if (field === "reviewState") {
          if (!REVIEW_STATES.has(fieldValue)) {
            throwServiceError("invalid_input", `Ownership Record Service does not support filter.${field} '${fieldValue}'.`);
          }
        } else if (field === "sourceType") {
          if (!SOURCE_TYPES.has(fieldValue)) {
            throwServiceError("invalid_input", `Ownership Record Service does not support filter.${field} '${fieldValue}'.`);
          }
        } else {
          requireNonEmptyString(fieldValue, `filter.${field}`);
        }
        defineOwnDataProperty(normalized, field, fieldValue);
      });
      return normalized;
    }

    function list(filter) {
      const normalized = normalizeFilter(filter);
      const records = normalized === null ? state.records : state.records.filter((record) => {
        const fields = Object.keys(normalized);
        for (let index = 0; index < fields.length; index += 1) {
          if (record[fields[index]] !== normalized[fields[index]]) {
            return false;
          }
        }
        return true;
      });
      return records.map((record) => deepClone(record));
    }

    function get(recordId) {
      const id = requireNonEmptyString(recordId, config.idField);
      const index = state.recordIndexById.get(id);
      return index === undefined ? null : deepClone(state.records[index]);
    }

    function has(recordId) {
      return state.recordIndexById.has(requireNonEmptyString(recordId, config.idField));
    }

    function getCurrent(serverId, seasonId, target) {
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      const normalizedSeasonId = requireNonEmptyString(seasonId, "seasonId");
      const key = config.kind === "territory"
        ? territoryTargetKey(normalizedServerId, normalizedSeasonId, target)
        : structureTargetKey(normalizedServerId, normalizedSeasonId, target);
      const id = state.currentRecordByTarget.get(key);
      if (!id) {
        return null;
      }
      const index = state.recordIndexById.get(id);
      return index === undefined ? null : deepClone(state.records[index]);
    }

    function propose(value) {
      const input = normalizeInput(value, config.proposalFields, "input");
      if (input.sourceType === "manual_entry") {
        throwServiceError("invalid_input", "Ownership Record Service does not allow manual_entry proposals.");
      }
      const record = normalizeTemporal(buildProposal(input), "new");
      validateRecord(config.validateRecord, record, `${config.label} record`);
      const id = record[config.idField];
      if (state.recordIndexById.has(id)) {
        throwServiceError("duplicate_record_id", `Ownership Record Service already contains ${config.idField} '${id}'.`);
      }
      const next = cloneRecords();
      next.push(deepClone(record));
      commit(next);
      return deepClone(record);
    }

    function addConfirmedManual(value) {
      const input = normalizeInput(value, config.manualFields, "input");
      const record = normalizeTemporal(buildManualConfirmed(input), "new");
      validateRecord(config.validateRecord, record, `${config.label} record`);
      const id = record[config.idField];
      if (state.recordIndexById.has(id)) {
        throwServiceError("duplicate_record_id", `Ownership Record Service already contains ${config.idField} '${id}'.`);
      }
      const current = findCurrent(record);
      const next = cloneRecords();
      if (current) {
        next[current.index] = buildSupersededRecord(next[current.index], id);
      }
      next.push(deepClone(record));
      commit(next);
      return deepClone(record);
    }

    function confirmProposal(recordId, reviewValue) {
      const id = requireNonEmptyString(recordId, config.idField);
      const review = normalizeReview(reviewValue);
      const index = state.recordIndexById.get(id);
      if (index === undefined) {
        throwServiceError("unknown_record", `Ownership Record Service does not contain ${config.idField} '${id}'.`);
      }
      const existing = state.records[index];
      if (existing.reviewState !== "proposed") {
        throwServiceError("invalid_transition", "Ownership Record Service only allows confirming proposed records.");
      }
      const record = normalizeTemporal(buildReviewedProposal(existing, "confirmed", review), "existing");
      validateRecord(config.validateRecord, record, `${config.label} record`);
      const current = findCurrent(record);
      const next = cloneRecords();
      if (current && current.record[config.idField] !== id) {
        next[current.index] = buildSupersededRecord(next[current.index], id);
      }
      next[index] = deepClone(record);
      commit(next);
      return deepClone(record);
    }

    function rejectProposal(recordId, reviewValue) {
      const id = requireNonEmptyString(recordId, config.idField);
      const review = normalizeReview(reviewValue);
      const index = state.recordIndexById.get(id);
      if (index === undefined) {
        throwServiceError("unknown_record", `Ownership Record Service does not contain ${config.idField} '${id}'.`);
      }
      const existing = state.records[index];
      if (existing.reviewState !== "proposed") {
        throwServiceError("invalid_transition", "Ownership Record Service only allows rejecting proposed records.");
      }
      const record = normalizeTemporal(buildReviewedProposal(existing, "rejected", review), "existing");
      validateRecord(config.validateRecord, record, `${config.label} record`);
      const next = cloneRecords();
      next[index] = deepClone(record);
      commit(next);
      return deepClone(record);
    }

    function captureTransactionState() {
      return cloneRecords();
    }

    function restoreTransactionState(snapshot) {
      requireArray(snapshot, "snapshot");
      validateHistory(config.validateHistory, snapshot, `${config.label} transaction snapshot`);
      const nextRecords = snapshot.map((record) => deepClone(record));
      const indexes = buildIndexes(nextRecords);
      state.records = nextRecords;
      state.recordIndexById = indexes.recordIndexById;
      state.currentRecordByTarget = indexes.currentRecordByTarget;
    }

    const initialRecords = config.initialRecords.map((record) => normalizeTemporal(record, "legacy"));
    validateHistory(config.validateHistory, initialRecords, `${config.label} history`);
    const initialIndexes = buildIndexes(initialRecords);
    state.records = initialRecords;
    state.recordIndexById = initialIndexes.recordIndexById;
    state.currentRecordByTarget = initialIndexes.currentRecordByTarget;

    return {
      list,
      get,
      has,
      getCurrent,
      propose,
      addConfirmedManual,
      confirmProposal,
      rejectProposal,
      captureTransactionState,
      restoreTransactionState
    };
  }

  function createOwnershipRecordService(options) {
    const input = requireRecordObject(options, "options");
    requireKnownFields(input, FACTORY_FIELDS, "options");
    requireRequiredFields(input, FACTORY_FIELDS, "options");
    if (typeof input.clock !== "function") {
      throwServiceError("invalid_input", "Ownership Record Service requires options.clock to be a function.");
    }

    const initialTerritoryRecords = requireArray(input.initialTerritoryRecords, "options.initialTerritoryRecords");
    const initialStructureRecords = requireArray(input.initialStructureRecords, "options.initialStructureRecords");

    const territory = createRecordStore({
      kind: "territory",
      label: "territory ownership",
      idField: "ownershipRecordId",
      initialRecords: initialTerritoryRecords,
      temporalContract: temporalContractFactory({ clock: input.clock }),
      validateRecord: createCallableValidator(input, input.validateTerritoryOwnershipRecord, "options.validateTerritoryOwnershipRecord"),
      validateHistory: createCallableValidator(input, input.validateTerritoryOwnershipHistory, "options.validateTerritoryOwnershipHistory"),
      proposalFields: TERRITORY_PROPOSAL_FIELDS,
      manualFields: TERRITORY_MANUAL_FIELDS,
      filterFields: new Set(["ownershipRecordId"].concat(COMMON_FILTER_FIELDS))
    });

    const structure = createRecordStore({
      kind: "structure",
      label: "structure ownership",
      idField: "structureOwnershipId",
      initialRecords: initialStructureRecords,
      temporalContract: temporalContractFactory({ clock: input.clock }),
      validateRecord: createCallableValidator(input, input.validateStructureOwnershipRecord, "options.validateStructureOwnershipRecord"),
      validateHistory: createCallableValidator(input, input.validateStructureOwnershipHistory, "options.validateStructureOwnershipHistory"),
      proposalFields: STRUCTURE_PROPOSAL_FIELDS,
      manualFields: STRUCTURE_MANUAL_FIELDS,
      filterFields: new Set(["structureOwnershipId"].concat(COMMON_FILTER_FIELDS))
    });

    return {
      listTerritoryRecords: territory.list,
      getTerritoryRecord: territory.get,
      hasTerritoryRecord: territory.has,
      getCurrentTerritoryRecord: territory.getCurrent,
      proposeTerritoryRecord: territory.propose,
      addConfirmedManualTerritoryRecord: territory.addConfirmedManual,
      confirmTerritoryProposal: territory.confirmProposal,
      rejectTerritoryProposal: territory.rejectProposal,
      listStructureRecords: structure.list,
      getStructureRecord: structure.get,
      hasStructureRecord: structure.has,
      getCurrentStructureRecord: structure.getCurrent,
      proposeStructureRecord: structure.propose,
      addConfirmedManualStructureRecord: structure.addConfirmedManual,
      confirmStructureProposal: structure.confirmProposal,
      rejectStructureProposal: structure.rejectProposal,
      captureTransactionState() {
        return {
          territoryRecords: territory.captureTransactionState(),
          structureRecords: structure.captureTransactionState()
        };
      },
      restoreTransactionState(snapshot) {
        const input = requireRecordObject(snapshot, "snapshot");
        requireKnownFields(
          input,
          new Set(["territoryRecords", "structureRecords"]),
          "snapshot"
        );
        requireRequiredFields(
          input,
          new Set(["territoryRecords", "structureRecords"]),
          "snapshot"
        );
        const currentTerritory = territory.captureTransactionState();
        const currentStructure = structure.captureTransactionState();
        try {
          territory.restoreTransactionState(input.territoryRecords);
          structure.restoreTransactionState(input.structureRecords);
        } catch (error) {
          territory.restoreTransactionState(currentTerritory);
          structure.restoreTransactionState(currentStructure);
          throw error;
        }
      }
    };
  }

  const exportsObject = {
    createOwnershipRecordService,
    OwnershipRecordServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
