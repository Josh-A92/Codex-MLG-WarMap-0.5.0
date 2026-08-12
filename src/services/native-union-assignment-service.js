(function initializeNativeUnionAssignmentServiceFactory(globalScope) {
  const temporalContractFactory = globalScope.createTemporalMetadataContract
    || (typeof require === "function" ? require("./temporal-metadata-contract.js").createTemporalMetadataContract : null);
  const PROPOSAL_INPUT_FIELDS = new Set([
    "assignmentId",
    "unionId",
    "serverId",
    "seasonId",
    "nativeState",
    "sourceType",
    "rawExtractedValue",
    "normalizedValue",
    "confidence",
    "evidenceId",
    "observedAt", "eventAt", "ruleVersionRef", "recordedAt"
  ]);

  const MANUAL_CONFIRMED_INPUT_FIELDS = new Set([
    "assignmentId",
    "unionId",
    "serverId",
    "seasonId",
    "nativeState",
    "evidenceId",
    "observedAt",
    "effectiveFrom",
    "reviewer",
    "reviewedAt", "eventAt", "ruleVersionRef", "recordedAt"
  ]);

  const CONFIRM_REVIEW_FIELDS = new Set([
    "reviewer",
    "reviewedAt",
    "effectiveFrom", "eventAt", "ruleVersionRef"
  ]);

  const REJECT_REVIEW_FIELDS = new Set([
    "reviewer",
    "reviewedAt"
  ]);

  const FILTER_FIELDS = new Set([
    "assignmentId",
    "seasonId",
    "serverId",
    "unionId",
    "nativeState",
    "reviewState",
    "sourceType"
  ]);

  const NATIVE_STATES = new Set(["native", "not_native", "unknown"]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const SOURCE_TYPES = new Set(["manual_entry", "screenshot_extraction", "imported_data", "api_integration", "bot_integration"]);

  class NativeUnionAssignmentServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "NativeUnionAssignmentServiceError";
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
    return new NativeUnionAssignmentServiceError(code, message, validationErrors ? cloneValidationErrors(validationErrors) : undefined);
  }

  function throwInvalidInput(message) {
    throw createServiceError("invalid_input", message);
  }

  function throwDuplicateAssignmentId(assignmentId) {
    throw createServiceError("duplicate_assignment_id", `Native Union Assignment Service requires assignmentId '${assignmentId}' to be unique.`);
  }

  function throwUnknownAssignment(assignmentId) {
    throw createServiceError("unknown_assignment", `Native Union Assignment Service could not find assignment '${assignmentId}'.`);
  }

  function throwInvalidTransition(message) {
    throw createServiceError("invalid_transition", message);
  }

  function throwInvalidHistory(validationErrors, message) {
    throw createServiceError("invalid_history", message || "Native Union Assignment Service history validation failed.", validationErrors);
  }

  function requireRecordObject(value, fieldName) {
    if (!isRecordObject(value)) {
      throwInvalidInput(`Native Union Assignment Service requires ${fieldName} to be a plain object.`);
    }

    return value;
  }

  function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
      throwInvalidInput(`Native Union Assignment Service requires ${fieldName} to be an array.`);
    }

    return value;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
      throwInvalidInput(`Native Union Assignment Service requires ${fieldName} to be a non-empty string.`);
    }

    return value;
  }

  function requireKnownFields(value, allowedFields, fieldName) {
    const unknownFields = Object.keys(value).filter((key) => !allowedFields.has(key)).sort();
    if (unknownFields.length > 0) {
      throwInvalidInput(`Native Union Assignment Service does not recognize ${fieldName} field '${unknownFields[0]}'.`);
    }
  }

  function requireRequiredFields(value, requiredFields, fieldName) {
    for (let index = 0; index < requiredFields.length; index += 1) {
      const requiredField = requiredFields[index];
      if (!Object.prototype.hasOwnProperty.call(value, requiredField)) {
        throwInvalidInput(`Native Union Assignment Service requires ${fieldName}.${requiredField}.`);
      }
    }
  }

  function requireEnumFilterValue(value, fieldName, allowedValues) {
    const normalizedValue = requireNonEmptyString(value, fieldName);
    if (!allowedValues.has(normalizedValue)) {
      throwInvalidInput(`Native Union Assignment Service requires ${fieldName} to be one of the supported values.`);
    }

    return normalizedValue;
  }

  function tupleKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  function createCallableValidator(owner, maybeFn, fieldName) {
    if (typeof maybeFn !== "function") {
      throwInvalidInput(`Native Union Assignment Service requires ${fieldName} to be a function.`);
    }

    return function boundValidator() {
      return maybeFn.apply(owner, arguments);
    };
  }

  function validateSingleRecord(validator, record) {
    const result = validator(record);

    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwInvalidHistory([], "Native Union Assignment Service received an invalid validator result for a record.");
    }

    if (!result.valid) {
      throwInvalidHistory(result.errors, "Native Union Assignment Service record validation failed.");
    }
  }

  function validateHistory(validator, records) {
    const result = validator(records);

    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwInvalidHistory([], "Native Union Assignment Service received an invalid validator result for history.");
    }

    if (!result.valid) {
      throwInvalidHistory(result.errors, "Native Union Assignment Service history validation failed.");
    }
  }

  function ensureTimestampOrder(currentRecord, newRecord) {
    if (!currentRecord) {
      return;
    }

    const currentTime = Date.parse(currentRecord.effectiveFrom);
    const newTime = Date.parse(newRecord.effectiveFrom);

    if (!Number.isFinite(currentTime) || !Number.isFinite(newTime) || newTime < currentTime) {
      throwInvalidTransition("Native Union Assignment Service requires replacement effectiveFrom to be equal to or later than the current assignment effectiveFrom.");
    }
  }

  function createNativeUnionAssignmentService(input) {
    const factoryInput = requireRecordObject(input, "input");
    requireKnownFields(factoryInput, new Set(["initialAssignments", "validateNativeUnionAssignment", "validateNativeUnionAssignmentHistory", "clock"]), "input");
    requireRequiredFields(factoryInput, ["initialAssignments", "validateNativeUnionAssignment", "validateNativeUnionAssignmentHistory"], "input");

    const initialAssignments = requireArray(factoryInput.initialAssignments, "input.initialAssignments");
    const validateNativeUnionAssignment = createCallableValidator(factoryInput, factoryInput.validateNativeUnionAssignment, "input.validateNativeUnionAssignment");
    const validateNativeUnionAssignmentHistory = createCallableValidator(factoryInput, factoryInput.validateNativeUnionAssignmentHistory, "input.validateNativeUnionAssignmentHistory");

    const state = {
      assignments: [],
      assignmentIndexById: new Map(),
      currentAssignmentByGroup: new Map()
    };
    const temporalContract = temporalContractFactory({ clock: typeof factoryInput.clock === "function" ? factoryInput.clock : () => new Date() });

    function normalizeTemporal(record, mode) {
      const preservedRecordedAt = mode === "existing" ? record.recordedAt : undefined;
      const inputRecord = mode === "existing" && Object.prototype.hasOwnProperty.call(record, "recordedAt")
        ? (() => { const copy = deepClone(record); delete copy.recordedAt; return copy; })()
        : record;
      const eventAt = inputRecord.eventAt || (inputRecord.effectiveFrom
        ? { precision: "exact", at: inputRecord.effectiveFrom }
        : { precision: "unknown" });
      const normalizedEventAt = inputRecord.effectiveFrom && eventAt.precision !== "exact"
        ? { precision: "exact", at: inputRecord.effectiveFrom }
        : eventAt;
      const normalized = mode === "legacy"
        ? temporalContract.normalizeLegacy({ ...inputRecord, eventAt: normalizedEventAt })
        : temporalContract.normalizeNew({ ...inputRecord, eventAt: normalizedEventAt });
      if (mode === "existing") normalized.recordedAt = preservedRecordedAt;
      return normalized;
    }

    function rebuildIndexes() {
      state.assignmentIndexById = new Map();
      state.currentAssignmentByGroup = new Map();

      for (let index = 0; index < state.assignments.length; index += 1) {
        const assignment = state.assignments[index];
        state.assignmentIndexById.set(assignment.assignmentId, index);

        if (assignment.reviewState === "confirmed" && assignment.effectiveFrom !== null && assignment.effectiveTo === null) {
          state.currentAssignmentByGroup.set(tupleKey(assignment.seasonId, assignment.serverId, assignment.unionId), assignment.assignmentId);
        }
      }
    }

    function commit(nextAssignments) {
      validateHistory(validateNativeUnionAssignmentHistory, nextAssignments);
      state.assignments = nextAssignments;
      rebuildIndexes();
    }

    function findCurrentForRecord(record) {
      const groupId = tupleKey(record.seasonId, record.serverId, record.unionId);
      const currentAssignmentId = state.currentAssignmentByGroup.get(groupId);

      if (!currentAssignmentId) {
        return null;
      }

      const currentIndex = state.assignmentIndexById.get(currentAssignmentId);
      if (currentIndex === undefined) {
        return null;
      }

      return {
        index: currentIndex,
        record: state.assignments[currentIndex]
      };
    }

    function buildSupersededRecord(existingRecord, replacementAssignmentId, replacementEffectiveFrom) {
      const prototype = Object.getPrototypeOf(existingRecord);
      const supersededRecord = prototype === null ? Object.create(null) : {};

      Object.keys(existingRecord).forEach((key) => {
        defineOwnDataProperty(supersededRecord, key, deepClone(existingRecord[key]));
      });

      defineOwnDataProperty(supersededRecord, "reviewState", "superseded");
      defineOwnDataProperty(supersededRecord, "effectiveTo", replacementEffectiveFrom);
      defineOwnDataProperty(supersededRecord, "supersededBy", replacementAssignmentId);

      return supersededRecord;
    }

    function cloneAssignmentRecord(record) {
      return deepClone(record);
    }

    function createCanonicalProposalRecord(proposalInput) {
      const prototype = Object.getPrototypeOf(proposalInput);
      const record = prototype === null ? Object.create(null) : {};

      defineOwnDataProperty(record, "assignmentId", proposalInput.assignmentId);
      defineOwnDataProperty(record, "unionId", proposalInput.unionId);
      defineOwnDataProperty(record, "serverId", proposalInput.serverId);
      defineOwnDataProperty(record, "seasonId", proposalInput.seasonId);
      defineOwnDataProperty(record, "nativeState", proposalInput.nativeState);
      defineOwnDataProperty(record, "reviewState", "proposed");
      defineOwnDataProperty(record, "sourceType", proposalInput.sourceType);
      defineOwnDataProperty(record, "rawExtractedValue", proposalInput.rawExtractedValue);
      defineOwnDataProperty(record, "normalizedValue", proposalInput.normalizedValue);
      defineOwnDataProperty(record, "confidence", proposalInput.confidence);
      defineOwnDataProperty(record, "evidenceId", proposalInput.evidenceId);
      defineOwnDataProperty(record, "observedAt", proposalInput.observedAt);
      if (Object.prototype.hasOwnProperty.call(proposalInput, "eventAt")) defineOwnDataProperty(record, "eventAt", deepClone(proposalInput.eventAt));
      if (Object.prototype.hasOwnProperty.call(proposalInput, "ruleVersionRef")) defineOwnDataProperty(record, "ruleVersionRef", deepClone(proposalInput.ruleVersionRef));
      if (Object.prototype.hasOwnProperty.call(proposalInput, "recordedAt")) defineOwnDataProperty(record, "recordedAt", proposalInput.recordedAt);
      defineOwnDataProperty(record, "effectiveFrom", null);
      defineOwnDataProperty(record, "effectiveTo", null);
      defineOwnDataProperty(record, "reviewer", null);
      defineOwnDataProperty(record, "reviewedAt", null);
      defineOwnDataProperty(record, "supersededBy", null);

      return record;
    }

    function createCanonicalManualConfirmedRecord(manualInput) {
      const prototype = Object.getPrototypeOf(manualInput);
      const record = prototype === null ? Object.create(null) : {};

      defineOwnDataProperty(record, "assignmentId", manualInput.assignmentId);
      defineOwnDataProperty(record, "unionId", manualInput.unionId);
      defineOwnDataProperty(record, "serverId", manualInput.serverId);
      defineOwnDataProperty(record, "seasonId", manualInput.seasonId);
      defineOwnDataProperty(record, "nativeState", manualInput.nativeState);
      defineOwnDataProperty(record, "reviewState", "confirmed");
      defineOwnDataProperty(record, "sourceType", "manual_entry");
      defineOwnDataProperty(record, "rawExtractedValue", null);
      defineOwnDataProperty(record, "normalizedValue", manualInput.unionId);
      defineOwnDataProperty(record, "confidence", null);
      defineOwnDataProperty(record, "evidenceId", manualInput.evidenceId);
      defineOwnDataProperty(record, "observedAt", manualInput.observedAt);
      if (Object.prototype.hasOwnProperty.call(manualInput, "eventAt")) defineOwnDataProperty(record, "eventAt", deepClone(manualInput.eventAt));
      if (Object.prototype.hasOwnProperty.call(manualInput, "ruleVersionRef")) defineOwnDataProperty(record, "ruleVersionRef", deepClone(manualInput.ruleVersionRef));
      if (Object.prototype.hasOwnProperty.call(manualInput, "recordedAt")) defineOwnDataProperty(record, "recordedAt", manualInput.recordedAt);
      defineOwnDataProperty(record, "effectiveFrom", manualInput.effectiveFrom);
      defineOwnDataProperty(record, "effectiveTo", null);
      defineOwnDataProperty(record, "reviewer", manualInput.reviewer);
      defineOwnDataProperty(record, "reviewedAt", manualInput.reviewedAt);
      defineOwnDataProperty(record, "supersededBy", null);

      return record;
    }

    function createConfirmedFromProposal(existingProposal, review) {
      const prototype = Object.getPrototypeOf(existingProposal);
      const record = prototype === null ? Object.create(null) : {};

      Object.keys(existingProposal).forEach((key) => {
        defineOwnDataProperty(record, key, deepClone(existingProposal[key]));
      });

      defineOwnDataProperty(record, "reviewState", "confirmed");
      defineOwnDataProperty(record, "effectiveFrom", review.effectiveFrom);
      defineOwnDataProperty(record, "effectiveTo", null);
      defineOwnDataProperty(record, "reviewer", review.reviewer);
      defineOwnDataProperty(record, "reviewedAt", review.reviewedAt);
      defineOwnDataProperty(record, "supersededBy", null);

      return record;
    }

    function createRejectedFromProposal(existingProposal, review) {
      const prototype = Object.getPrototypeOf(existingProposal);
      const record = prototype === null ? Object.create(null) : {};

      Object.keys(existingProposal).forEach((key) => {
        defineOwnDataProperty(record, key, deepClone(existingProposal[key]));
      });

      defineOwnDataProperty(record, "reviewState", "rejected");
      defineOwnDataProperty(record, "effectiveFrom", null);
      defineOwnDataProperty(record, "effectiveTo", null);
      defineOwnDataProperty(record, "reviewer", review.reviewer);
      defineOwnDataProperty(record, "reviewedAt", review.reviewedAt);
      defineOwnDataProperty(record, "supersededBy", null);

      return record;
    }

    function requireFilter(filter) {
      if (filter === undefined) {
        return null;
      }

      const normalizedFilter = requireRecordObject(filter, "filter");
      requireKnownFields(normalizedFilter, FILTER_FIELDS, "filter");

      const output = {};

      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "assignmentId")) {
        output.assignmentId = requireNonEmptyString(normalizedFilter.assignmentId, "filter.assignmentId");
      }
      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "seasonId")) {
        output.seasonId = requireNonEmptyString(normalizedFilter.seasonId, "filter.seasonId");
      }
      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "serverId")) {
        output.serverId = requireNonEmptyString(normalizedFilter.serverId, "filter.serverId");
      }
      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "unionId")) {
        output.unionId = requireNonEmptyString(normalizedFilter.unionId, "filter.unionId");
      }
      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "nativeState")) {
        output.nativeState = requireEnumFilterValue(normalizedFilter.nativeState, "filter.nativeState", NATIVE_STATES);
      }
      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "reviewState")) {
        output.reviewState = requireEnumFilterValue(normalizedFilter.reviewState, "filter.reviewState", REVIEW_STATES);
      }
      if (Object.prototype.hasOwnProperty.call(normalizedFilter, "sourceType")) {
        output.sourceType = requireEnumFilterValue(normalizedFilter.sourceType, "filter.sourceType", SOURCE_TYPES);
      }

      return output;
    }

    function requireProposalInput(value) {
      const inputRecord = requireRecordObject(value, "input");
      requireKnownFields(inputRecord, PROPOSAL_INPUT_FIELDS, "input");
      requireRequiredFields(inputRecord, Array.from(PROPOSAL_INPUT_FIELDS).filter((field) => !["eventAt", "ruleVersionRef", "recordedAt"].includes(field)), "input");
      return inputRecord;
    }

    function requireManualConfirmedInput(value) {
      const inputRecord = requireRecordObject(value, "input");
      requireKnownFields(inputRecord, MANUAL_CONFIRMED_INPUT_FIELDS, "input");
      requireRequiredFields(inputRecord, Array.from(MANUAL_CONFIRMED_INPUT_FIELDS).filter((field) => !["eventAt", "ruleVersionRef", "recordedAt"].includes(field)), "input");
      return inputRecord;
    }

    function requireConfirmReview(value) {
      const review = requireRecordObject(value, "review");
      requireKnownFields(review, CONFIRM_REVIEW_FIELDS, "review");
      requireRequiredFields(review, Array.from(CONFIRM_REVIEW_FIELDS).filter((field) => !["eventAt", "ruleVersionRef"].includes(field)), "review");
      return review;
    }

    function requireRejectReview(value) {
      const review = requireRecordObject(value, "review");
      requireKnownFields(review, REJECT_REVIEW_FIELDS, "review");
      requireRequiredFields(review, Array.from(REJECT_REVIEW_FIELDS), "review");
      return review;
    }

    function listAssignments(filter) {
      const normalizedFilter = requireFilter(filter);
      const filtered = normalizedFilter === null
        ? state.assignments
        : state.assignments.filter((assignment) => {
            const keys = Object.keys(normalizedFilter);
            for (let index = 0; index < keys.length; index += 1) {
              const key = keys[index];
              if (assignment[key] !== normalizedFilter[key]) {
                return false;
              }
            }

            return true;
          });

      return filtered.map((assignment) => cloneAssignmentRecord(assignment));
    }

    function getAssignment(assignmentId) {
      const normalizedAssignmentId = requireNonEmptyString(assignmentId, "assignmentId");
      const assignmentIndex = state.assignmentIndexById.get(normalizedAssignmentId);
      if (assignmentIndex === undefined) {
        return null;
      }

      return cloneAssignmentRecord(state.assignments[assignmentIndex]);
    }

    function hasAssignment(assignmentId) {
      const normalizedAssignmentId = requireNonEmptyString(assignmentId, "assignmentId");
      return state.assignmentIndexById.has(normalizedAssignmentId);
    }

    function getCurrentAssignment(seasonId, serverId, unionId) {
      const normalizedSeasonId = requireNonEmptyString(seasonId, "seasonId");
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      const normalizedUnionId = requireNonEmptyString(unionId, "unionId");
      const groupId = tupleKey(normalizedSeasonId, normalizedServerId, normalizedUnionId);
      const assignmentId = state.currentAssignmentByGroup.get(groupId);

      if (!assignmentId) {
        return null;
      }

      const assignmentIndex = state.assignmentIndexById.get(assignmentId);
      if (assignmentIndex === undefined) {
        return null;
      }

      return cloneAssignmentRecord(state.assignments[assignmentIndex]);
    }

    function proposeAssignment(input) {
      const proposalInput = requireProposalInput(input);
      if (proposalInput.sourceType === "manual_entry") {
        throwInvalidInput("Native Union Assignment Service does not allow manual_entry proposals.");
      }

      const candidateRecord = normalizeTemporal(createCanonicalProposalRecord(proposalInput), "new");
      validateSingleRecord(validateNativeUnionAssignment, candidateRecord);

      if (state.assignmentIndexById.has(candidateRecord.assignmentId)) {
        throwDuplicateAssignmentId(candidateRecord.assignmentId);
      }

      const nextAssignments = state.assignments.map((assignment) => cloneAssignmentRecord(assignment));
      nextAssignments.push(cloneAssignmentRecord(candidateRecord));
      commit(nextAssignments);

      return cloneAssignmentRecord(candidateRecord);
    }

    function addConfirmedManualAssignment(input) {
      const manualInput = requireManualConfirmedInput(input);
      const candidateRecord = normalizeTemporal(createCanonicalManualConfirmedRecord(manualInput), "new");
      validateSingleRecord(validateNativeUnionAssignment, candidateRecord);

      if (state.assignmentIndexById.has(candidateRecord.assignmentId)) {
        throwDuplicateAssignmentId(candidateRecord.assignmentId);
      }

      const current = findCurrentForRecord(candidateRecord);
      if (current) {
        ensureTimestampOrder(current.record, candidateRecord);
      }

      const nextAssignments = state.assignments.map((assignment) => cloneAssignmentRecord(assignment));

      if (current) {
        nextAssignments[current.index] = buildSupersededRecord(nextAssignments[current.index], candidateRecord.assignmentId, candidateRecord.effectiveFrom);
      }

      nextAssignments.push(cloneAssignmentRecord(candidateRecord));
      commit(nextAssignments);

      return cloneAssignmentRecord(candidateRecord);
    }

    function confirmProposal(assignmentId, review) {
      const normalizedAssignmentId = requireNonEmptyString(assignmentId, "assignmentId");
      const normalizedReview = requireConfirmReview(review);

      const assignmentIndex = state.assignmentIndexById.get(normalizedAssignmentId);
      if (assignmentIndex === undefined) {
        throwUnknownAssignment(normalizedAssignmentId);
      }

      const existingRecord = state.assignments[assignmentIndex];
      if (existingRecord.reviewState !== "proposed") {
        throwInvalidTransition("Native Union Assignment Service only allows confirming proposed assignments.");
      }

      const candidateRecord = normalizeTemporal(createConfirmedFromProposal(existingRecord, normalizedReview), "existing");
      if (candidateRecord.eventAt && candidateRecord.eventAt.precision !== "exact") {
        throwInvalidTransition("Native Union Assignment Service cannot confirm bounded or unknown assignment time.");
      }
      validateSingleRecord(validateNativeUnionAssignment, candidateRecord);

      const current = findCurrentForRecord(candidateRecord);
      if (current && current.record.assignmentId !== candidateRecord.assignmentId) {
        ensureTimestampOrder(current.record, candidateRecord);
      }

      const nextAssignments = state.assignments.map((assignment) => cloneAssignmentRecord(assignment));

      if (current && current.record.assignmentId !== candidateRecord.assignmentId) {
        nextAssignments[current.index] = buildSupersededRecord(nextAssignments[current.index], candidateRecord.assignmentId, candidateRecord.effectiveFrom);
      }

      nextAssignments[assignmentIndex] = cloneAssignmentRecord(candidateRecord);
      commit(nextAssignments);

      return cloneAssignmentRecord(candidateRecord);
    }

    function rejectProposal(assignmentId, review) {
      const normalizedAssignmentId = requireNonEmptyString(assignmentId, "assignmentId");
      const normalizedReview = requireRejectReview(review);

      const assignmentIndex = state.assignmentIndexById.get(normalizedAssignmentId);
      if (assignmentIndex === undefined) {
        throwUnknownAssignment(normalizedAssignmentId);
      }

      const existingRecord = state.assignments[assignmentIndex];
      if (existingRecord.reviewState !== "proposed") {
        throwInvalidTransition("Native Union Assignment Service only allows rejecting proposed assignments.");
      }

      const candidateRecord = normalizeTemporal(createRejectedFromProposal(existingRecord, normalizedReview), "existing");
      validateSingleRecord(validateNativeUnionAssignment, candidateRecord);

      const nextAssignments = state.assignments.map((assignment) => cloneAssignmentRecord(assignment));
      nextAssignments[assignmentIndex] = cloneAssignmentRecord(candidateRecord);
      commit(nextAssignments);

      return cloneAssignmentRecord(candidateRecord);
    }

    function captureTransactionState() {
      return state.assignments.map((assignment) => cloneAssignmentRecord(assignment));
    }

    function restoreTransactionState(snapshot) {
      const restoredAssignments = requireArray(snapshot, "snapshot")
        .map((assignment) => cloneAssignmentRecord(assignment));
      commit(restoredAssignments);
    }

    state.assignments = initialAssignments.map((assignment) => normalizeTemporal(assignment, "legacy"));
    validateHistory(validateNativeUnionAssignmentHistory, state.assignments);
    rebuildIndexes();

    return {
      listAssignments,
      getAssignment,
      hasAssignment,
      getCurrentAssignment,
      proposeAssignment,
      addConfirmedManualAssignment,
      confirmProposal,
      rejectProposal,
      captureTransactionState,
      restoreTransactionState
    };
  }

  const exportsObject = {
    createNativeUnionAssignmentService,
    NativeUnionAssignmentServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
