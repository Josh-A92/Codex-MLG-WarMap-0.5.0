(function initializeCombatStrengthObservationServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialObservations",
    "validateCombatStrengthObservation",
    "validateCombatStrengthObservationHistory"
  ]);
  const FILTER_FIELDS = new Set([
    "observationId", "unionId", "serverId", "seasonId", "sourceType", "reviewState", "actorId",
    "reviewerId"
  ]);

  class CombatStrengthObservationServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "CombatStrengthObservationServiceError";
      this.code = code;
      if (validationErrors) {
        this.validationErrors = validationErrors;
      }
    }
  }

  function fail(code, message, validationErrors) {
    throw new CombatStrengthObservationServiceError(code, message, validationErrors);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineOwn(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function clone(value) {
    if (Array.isArray(value)) {
      return value.map(clone);
    }
    if (!isRecord(value)) {
      return value;
    }
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwn(output, key, clone(value[key])));
    return output;
  }

  function requireRecord(value, path) {
    if (!isRecord(value)) {
      fail("invalid_input", `Combat Strength Observation Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function nonEmpty(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Combat Strength Observation Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function exactFields(value, fields, path, requireAll) {
    Object.keys(value).sort().forEach((field) => {
      if (!fields.has(field)) {
        fail("invalid_input", `Combat Strength Observation Service does not recognize ${path}.${field}.`);
      }
    });
    if (requireAll) {
      fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          fail("invalid_input", `Combat Strength Observation Service requires ${path}.${field}.`);
        }
      });
    }
  }

  function bindValidator(owner, value, path) {
    if (typeof value !== "function") {
      fail("invalid_factory", `Combat Strength Observation Service requires ${path}.`);
    }
    return value.bind(owner);
  }

  function createCombatStrengthObservationService(options) {
    const input = requireRecord(options, "options");
    exactFields(input, FACTORY_FIELDS, "options", true);
    if (!Array.isArray(input.initialObservations)) {
      fail("invalid_factory", "Combat Strength Observation Service requires options.initialObservations to be an array.");
    }
    const validateRecord = bindValidator(
      input,
      input.validateCombatStrengthObservation,
      "options.validateCombatStrengthObservation"
    );
    const validateHistory = bindValidator(
      input,
      input.validateCombatStrengthObservationHistory,
      "options.validateCombatStrengthObservationHistory"
    );
    let observations = [];
    let indexById = new Map();

    function runValidation(validator, candidate, label) {
      let result;
      try {
        result = validator(candidate);
      } catch (error) {
        fail("invalid_dependency", `${label} validator threw.`, [{ code: "VALIDATOR_THROW", path: "", message: error.message }]);
      }
      if (!isRecord(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
        fail("invalid_dependency", `${label} validator returned an invalid result.`);
      }
      if (!result.valid) {
        fail("invalid_history", `${label} validation failed.`, clone(result.errors));
      }
    }

    function rebuildIndex(candidate) {
      const next = new Map();
      candidate.forEach((observation, index) => next.set(observation.observationId, index));
      return next;
    }

    function commit(candidate) {
      runValidation(validateHistory, candidate, "Observation history");
      observations = clone(candidate);
      indexById = rebuildIndex(observations);
    }

    function normalizeFilter(filter) {
      if (filter === undefined) {
        return {};
      }
      const value = requireRecord(filter, "filter");
      exactFields(value, FILTER_FIELDS, "filter", false);
      Object.keys(value).forEach((field) => {
        if (value[field] !== null) {
          nonEmpty(value[field], `filter.${field}`);
        }
      });
      return value;
    }

    function listObservations(filter) {
      const normalized = normalizeFilter(filter);
      return observations.filter((observation) => (
        Object.keys(normalized).every((field) => observation[field] === normalized[field])
      )).map(clone);
    }

    function getObservation(observationId) {
      const id = nonEmpty(observationId, "observationId");
      const index = indexById.get(id);
      return index === undefined ? null : clone(observations[index]);
    }

    function hasObservation(observationId) {
      return indexById.has(nonEmpty(observationId, "observationId"));
    }

    function getLatestConfirmed(seasonId, serverId, unionId) {
      const scope = [
        nonEmpty(seasonId, "seasonId"),
        nonEmpty(serverId, "serverId"),
        nonEmpty(unionId, "unionId")
      ];
      let latest = null;
      let latestTime = null;
      observations.forEach((observation) => {
        if (observation.seasonId !== scope[0]
            || observation.serverId !== scope[1]
            || observation.unionId !== scope[2]
            || observation.reviewState !== "confirmed") {
          return;
        }
        const time = Date.parse(observation.observedAt);
        if (latest === null || time > latestTime) {
          latest = observation;
          latestTime = time;
        }
      });
      return latest === null ? null : clone(latest);
    }

    function addObservation(observation) {
      const candidate = requireRecord(observation, "observation");
      runValidation(validateRecord, candidate, "Observation");
      if (indexById.has(candidate.observationId)) {
        fail("duplicate_observation", `Observation '${candidate.observationId}' already exists.`);
      }
      const next = observations.concat([clone(candidate)]);
      commit(next);
      return clone(candidate);
    }

    function captureTransactionState() {
      return clone(observations);
    }

    function restoreTransactionState(snapshot) {
      if (!Array.isArray(snapshot)) fail("invalid_input", "Combat Strength Observation Service requires snapshot to be an array.");
      commit(snapshot.map(clone));
    }

    function reviewProposal(observationId, reviewedObservation) {
      const id = nonEmpty(observationId, "observationId");
      const index = indexById.get(id);
      if (index === undefined) {
        fail("unknown_observation", `Observation '${id}' does not exist.`);
      }
      const current = observations[index];
      if (current.reviewState !== "proposed") {
        fail("invalid_transition", "Only proposed observations may be reviewed.");
      }
      const replacement = requireRecord(reviewedObservation, "reviewedObservation");
      runValidation(validateRecord, replacement, "Reviewed observation");
      if (replacement.observationId !== id
          || (replacement.reviewState !== "confirmed" && replacement.reviewState !== "rejected")) {
        fail("invalid_transition", "Proposal review must retain its ID and become confirmed or rejected.");
      }
      const lifecycleFields = new Set(["reviewState", "reviewerId", "reviewedAt"]);
      Object.keys(current).forEach((field) => {
        if (!lifecycleFields.has(field)
            && JSON.stringify(current[field]) !== JSON.stringify(replacement[field])) {
          fail("invalid_transition", `Proposal review cannot change factual field '${field}'.`);
        }
      });
      const next = observations.slice();
      next[index] = clone(replacement);
      commit(next);
      return clone(replacement);
    }

    function correctConfirmed(observationId, replacementObservation) {
      const id = nonEmpty(observationId, "observationId");
      const index = indexById.get(id);
      if (index === undefined) {
        fail("unknown_observation", `Observation '${id}' does not exist.`);
      }
      const current = observations[index];
      if (current.reviewState !== "confirmed") {
        fail("invalid_transition", "Only confirmed observations may be corrected.");
      }
      const replacement = requireRecord(replacementObservation, "replacementObservation");
      runValidation(validateRecord, replacement, "Replacement observation");
      if (replacement.reviewState !== "confirmed" || replacement.observationId === id) {
        fail("invalid_transition", "Correction requires a new confirmed observation ID.");
      }
      const superseded = clone(current);
      superseded.reviewState = "superseded";
      superseded.supersededBy = replacement.observationId;
      const next = observations.slice();
      next[index] = superseded;
      next.push(clone(replacement));
      commit(next);
      return {
        superseded: clone(superseded),
        replacement: clone(replacement)
      };
    }

    commit(input.initialObservations);
    return {
      listObservations,
      getObservation,
      hasObservation,
      getLatestConfirmed,
      addObservation,
      reviewProposal,
      correctConfirmed,
      captureTransactionState,
      restoreTransactionState
    };
  }

  const exportsObject = {
    createCombatStrengthObservationService,
    CombatStrengthObservationServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
