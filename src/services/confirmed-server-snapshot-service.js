(function initializeConfirmedServerSnapshotServiceFactory(globalScope) {
  const temporalContractFactory = globalScope.createTemporalMetadataContract
    || (typeof require === "function"
      ? require("./temporal-metadata-contract.js").createTemporalMetadataContract
      : null);
  const FACTORY_FIELDS = new Set([
    "initialSnapshots",
    "validateConfirmedServerSnapshot",
    "validateConfirmedServerSnapshotHistory",
    "evaluateConfirmedServerSnapshotReferences",
    "clock"
  ]);

  const FILTER_FIELDS = new Set([
    "snapshotId",
    "serverId",
    "seasonId",
    "creatorId",
    "reviewerId"
  ]);

  class ConfirmedServerSnapshotServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "ConfirmedServerSnapshotServiceError";
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

  function cloneErrors(errors) {
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
    throw new ConfirmedServerSnapshotServiceError(
      code,
      message,
      validationErrors ? cloneErrors(validationErrors) : undefined
    );
  }

  function requireRecordObject(value, path) {
    if (!isRecordObject(value)) {
      throwServiceError("invalid_input", `Confirmed Server Snapshot Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireNonEmptyString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      throwServiceError("invalid_input", `Confirmed Server Snapshot Service requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireKnownFields(record, allowedFields, path) {
    const unknownFields = Object.keys(record).filter((key) => !allowedFields.has(key)).sort();
    if (unknownFields.length > 0) {
      throwServiceError(
        "invalid_input",
        `Confirmed Server Snapshot Service does not recognize ${path} field '${unknownFields[0]}'.`
      );
    }
  }

  function requireRequiredFields(record, requiredFields, path) {
    const fields = Array.from(requiredFields);
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throwServiceError("invalid_input", `Confirmed Server Snapshot Service requires ${path}.${field}.`);
      }
    }
  }

  function createCallableDependency(owner, value, fieldName) {
    if (typeof value !== "function") {
      throwServiceError("invalid_input", `Confirmed Server Snapshot Service requires ${fieldName} to be a function.`);
    }

    return function boundDependency() {
      return value.apply(owner, arguments);
    };
  }

  function validateResultShape(result, context, requireProjection) {
    if (!isRecordObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throwServiceError("invalid_snapshot", `Confirmed Server Snapshot Service received an invalid result from ${context}.`);
    }

    if (requireProjection && !isRecordObject(result.projection)) {
      throwServiceError("invalid_snapshot", `Confirmed Server Snapshot Service requires ${context} to return a projection object.`);
    }
  }

  function snapshotGroupKey(serverId, seasonId) {
    return JSON.stringify([seasonId, serverId]);
  }

  function buildIndexes(snapshots) {
    const snapshotIndexById = new Map();
    const currentSnapshotByGroup = new Map();

    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index];
      snapshotIndexById.set(snapshot.snapshotId, index);
      const groupKey = snapshotGroupKey(snapshot.serverId, snapshot.seasonId);
      const currentId = currentSnapshotByGroup.get(groupKey);

      if (!currentId) {
        currentSnapshotByGroup.set(groupKey, snapshot.snapshotId);
        continue;
      }

      const currentIndex = snapshotIndexById.get(currentId);
      if (Date.parse(snapshot.createdAt) > Date.parse(snapshots[currentIndex].createdAt)) {
        currentSnapshotByGroup.set(groupKey, snapshot.snapshotId);
      }
    }

    return { snapshotIndexById, currentSnapshotByGroup };
  }

  function createConfirmedServerSnapshotService(options) {
    const input = requireRecordObject(options, "options");
    requireKnownFields(input, FACTORY_FIELDS, "options");
    requireRequiredFields(input, FACTORY_FIELDS, "options");
    if (typeof input.clock !== "function") throwServiceError("invalid_input", "Confirmed Server Snapshot Service requires options.clock.");

    if (!Array.isArray(input.initialSnapshots)) {
      throwServiceError("invalid_input", "Confirmed Server Snapshot Service requires options.initialSnapshots to be an array.");
    }

    const validateConfirmedServerSnapshot = createCallableDependency(
      input,
      input.validateConfirmedServerSnapshot,
      "options.validateConfirmedServerSnapshot"
    );
    const validateConfirmedServerSnapshotHistory = createCallableDependency(
      input,
      input.validateConfirmedServerSnapshotHistory,
      "options.validateConfirmedServerSnapshotHistory"
    );
    const evaluateConfirmedServerSnapshotReferences = createCallableDependency(
      input,
      input.evaluateConfirmedServerSnapshotReferences,
      "options.evaluateConfirmedServerSnapshotReferences"
    );

    const state = {
      snapshots: [],
      snapshotIndexById: new Map(),
      currentSnapshotByGroup: new Map()
    };
    const temporalContract = temporalContractFactory({ clock: input.clock });

    function normalizeTemporal(snapshot, mode) {
      const preservedRecordedAt = mode === "existing" ? snapshot.recordedAt : undefined;
      const inputSnapshot = mode === "existing" && Object.prototype.hasOwnProperty.call(snapshot, "recordedAt")
        ? (() => { const copy = deepClone(snapshot); delete copy.recordedAt; return copy; })()
        : snapshot;
      const normalized = mode === "legacy"
        ? temporalContract.normalizeLegacy({ ...inputSnapshot, eventAt: inputSnapshot.eventAt || { precision: "unknown" } })
        : temporalContract.normalizeNew({ ...inputSnapshot, eventAt: inputSnapshot.eventAt || { precision: "unknown" } });
      delete normalized.eventAt;
      if (mode === "existing") normalized.recordedAt = preservedRecordedAt;
      return normalized;
    }

    function runSnapshotValidation(snapshot) {
      let result;
      try {
        result = validateConfirmedServerSnapshot(snapshot);
      } catch (error) {
        throwServiceError("invalid_snapshot", "Confirmed Server Snapshot Service snapshot validator threw.");
      }

      validateResultShape(result, "snapshot validation", false);
      if (!result.valid) {
        throwServiceError("invalid_snapshot", "Confirmed Server Snapshot Service snapshot validation failed.", result.errors);
      }
    }

    function runHistoryValidation(snapshots) {
      let result;
      try {
        result = validateConfirmedServerSnapshotHistory(snapshots);
      } catch (error) {
        throwServiceError("invalid_snapshot", "Confirmed Server Snapshot Service history validator threw.");
      }

      validateResultShape(result, "history validation", false);
      if (!result.valid) {
        throwServiceError("invalid_snapshot", "Confirmed Server Snapshot Service history validation failed.", result.errors);
      }
    }

    function evaluateReferences(evaluationInput) {
      let result;
      try {
        result = evaluateConfirmedServerSnapshotReferences(deepClone(evaluationInput));
      } catch (error) {
        throwServiceError("invalid_snapshot", "Confirmed Server Snapshot Service reference evaluator threw.");
      }

      validateResultShape(result, "reference evaluation", true);
      return deepClone(result);
    }

    function commit(nextSnapshots) {
      runHistoryValidation(nextSnapshots);
      const indexes = buildIndexes(nextSnapshots);
      state.snapshots = nextSnapshots;
      state.snapshotIndexById = indexes.snapshotIndexById;
      state.currentSnapshotByGroup = indexes.currentSnapshotByGroup;
    }

    function normalizeFilter(filter) {
      if (filter === undefined) {
        return null;
      }

      const value = requireRecordObject(filter, "filter");
      requireKnownFields(value, FILTER_FIELDS, "filter");
      const normalized = {};
      Object.keys(value).forEach((field) => {
        defineOwnDataProperty(normalized, field, requireNonEmptyString(value[field], `filter.${field}`));
      });
      return normalized;
    }

    function listSnapshots(filter) {
      const normalized = normalizeFilter(filter);
      const snapshots = normalized === null
        ? state.snapshots
        : state.snapshots.filter((snapshot) => Object.keys(normalized).every(
            (field) => snapshot[field] === normalized[field]
          ));

      return snapshots.map((snapshot) => deepClone(snapshot));
    }

    function getSnapshot(snapshotId) {
      const id = requireNonEmptyString(snapshotId, "snapshotId");
      const index = state.snapshotIndexById.get(id);
      return index === undefined ? null : deepClone(state.snapshots[index]);
    }

    function hasSnapshot(snapshotId) {
      return state.snapshotIndexById.has(requireNonEmptyString(snapshotId, "snapshotId"));
    }

    function getCurrentSnapshot(serverId, seasonId) {
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      const normalizedSeasonId = requireNonEmptyString(seasonId, "seasonId");
      const id = state.currentSnapshotByGroup.get(snapshotGroupKey(normalizedServerId, normalizedSeasonId));
      if (!id) {
        return null;
      }

      const index = state.snapshotIndexById.get(id);
      return index === undefined ? null : deepClone(state.snapshots[index]);
    }

    function evaluateSnapshot(evaluationInput) {
      requireRecordObject(evaluationInput, "evaluationInput");
      return evaluateReferences(evaluationInput);
    }

    function addConfirmedSnapshot(evaluationInput) {
      const normalizedInput = requireRecordObject(evaluationInput, "evaluationInput");
      const evaluation = evaluateReferences(normalizedInput);
      if (!evaluation.valid) {
        throwServiceError(
          "invalid_snapshot",
          "Confirmed Server Snapshot Service reference evaluation failed.",
          evaluation.errors
        );
      }

      const snapshot = normalizeTemporal(requireRecordObject(normalizedInput.snapshot, "evaluationInput.snapshot"), "new");
      runSnapshotValidation(snapshot);
      if (state.snapshotIndexById.has(snapshot.snapshotId)) {
        throwServiceError(
          "duplicate_snapshot_id",
          `Confirmed Server Snapshot Service already contains snapshotId '${snapshot.snapshotId}'.`
        );
      }

      const nextSnapshots = state.snapshots.map((entry) => deepClone(entry));
      nextSnapshots.push(deepClone(snapshot));
      commit(nextSnapshots);

      return {
        snapshot: deepClone(snapshot),
        projection: deepClone(evaluation.projection)
      };
    }

    function captureTransactionState() {
      return deepClone(state.snapshots);
    }

    function restoreTransactionState(snapshot) {
      if (!Array.isArray(snapshot)) {
        throwServiceError("invalid_input", "Confirmed Server Snapshot Service requires snapshot to be an array.");
      }
      const candidate = snapshot.map(deepClone);
      runHistoryValidation(candidate);
      commit(candidate);
    }

    const initialSnapshots = input.initialSnapshots.map((snapshot) => normalizeTemporal(snapshot, "legacy"));
    runHistoryValidation(initialSnapshots);
    const initialIndexes = buildIndexes(initialSnapshots);
    state.snapshots = initialSnapshots;
    state.snapshotIndexById = initialIndexes.snapshotIndexById;
    state.currentSnapshotByGroup = initialIndexes.currentSnapshotByGroup;

    return {
      listSnapshots,
      getSnapshot,
      hasSnapshot,
      getCurrentSnapshot,
      evaluateSnapshot,
      addConfirmedSnapshot,
      captureTransactionState,
      restoreTransactionState
    };
  }

  const exportsObject = {
    createConfirmedServerSnapshotService,
    ConfirmedServerSnapshotServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
