(function initializeServerObservationServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialObservations",
    "validateServerObservation",
    "validateServerObservationHistory"
  ]);
  const FILTER_FIELDS = new Set([
    "observationId", "serverId", "seasonId", "sourceType",
    "reviewState", "actorId", "reviewerId"
  ]);

  class ServerObservationServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "ServerObservationServiceError";
      this.code = code;
      if (validationErrors) this.validationErrors = validationErrors;
    }
  }

  function fail(code, message, validationErrors) {
    throw new ServerObservationServiceError(code, message, validationErrors);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
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
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwn(output, key, clone(value[key])));
    return output;
  }

  function requireRecord(value, path, code = "invalid_input") {
    if (!isRecord(value)) {
      fail(code, `Server Observation Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Server Observation Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function exactFields(value, fields, path, requireAll) {
    Object.keys(value).sort().forEach((field) => {
      if (!fields.has(field)) {
        fail("invalid_input", `Server Observation Service does not recognize ${path}.${field}.`);
      }
    });
    if (requireAll) {
      fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          fail("invalid_factory", `Server Observation Service requires ${path}.${field}.`);
        }
      });
    }
  }

  function createServerObservationService(options) {
    const input = requireRecord(options, "options", "invalid_factory");
    exactFields(input, FACTORY_FIELDS, "options", true);
    if (!Array.isArray(input.initialObservations)
        || typeof input.validateServerObservation !== "function"
        || typeof input.validateServerObservationHistory !== "function") {
      fail("invalid_factory", "Server Observation Service requires initial observations and validator functions.");
    }

    const validateRecord = input.validateServerObservation.bind(input);
    const validateHistory = input.validateServerObservationHistory.bind(input);
    let observations = [];
    let indexById = new Map();

    function validate(validator, value, label) {
      let validation;
      try {
        validation = validator(value);
      } catch (error) {
        fail("invalid_dependency", `${label} validator threw.`, [
          { code: "VALIDATOR_THROW", path: "", message: error.message }
        ]);
      }
      if (!isRecord(validation)
          || typeof validation.valid !== "boolean"
          || !Array.isArray(validation.errors)) {
        fail("invalid_dependency", `${label} validator returned an invalid result.`);
      }
      if (!validation.valid) {
        fail("invalid_history", `${label} validation failed.`, clone(validation.errors));
      }
    }

    function commit(candidate) {
      validate(validateHistory, candidate, "Server observation history");
      observations = clone(candidate);
      indexById = new Map();
      observations.forEach((observation, index) => {
        indexById.set(observation.observationId, index);
      });
    }

    function listObservations(filter) {
      const value = filter === undefined ? {} : requireRecord(filter, "filter");
      exactFields(value, FILTER_FIELDS, "filter", false);
      Object.keys(value).forEach((field) => requireString(value[field], `filter.${field}`));
      return observations.filter((observation) => (
        Object.keys(value).every((field) => observation[field] === value[field])
      )).map(clone);
    }

    function getObservation(observationId) {
      const id = requireString(observationId, "observationId");
      const index = indexById.get(id);
      return index === undefined ? null : clone(observations[index]);
    }

    function hasObservation(observationId) {
      return indexById.has(requireString(observationId, "observationId"));
    }

    function addObservation(observation) {
      const candidate = requireRecord(observation, "observation");
      validate(validateRecord, candidate, "Server observation");
      if (indexById.has(candidate.observationId)) {
        fail("duplicate_observation", `Server observation '${candidate.observationId}' already exists.`);
      }
      commit(observations.concat([clone(candidate)]));
      return clone(candidate);
    }

    function reviewProposal(observationId, reviewedObservation) {
      const id = requireString(observationId, "observationId");
      const index = indexById.get(id);
      if (index === undefined) {
        fail("unknown_observation", `Server observation '${id}' does not exist.`);
      }
      const current = observations[index];
      if (current.reviewState !== "proposed") {
        fail("invalid_transition", "Only proposed server observations may be reviewed.");
      }
      const replacement = requireRecord(reviewedObservation, "reviewedObservation");
      validate(validateRecord, replacement, "Reviewed server observation");
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
      const id = requireString(observationId, "observationId");
      const index = indexById.get(id);
      if (index === undefined) {
        fail("unknown_observation", `Server observation '${id}' does not exist.`);
      }
      const current = observations[index];
      if (current.reviewState !== "confirmed") {
        fail("invalid_transition", "Only confirmed server observations may be corrected.");
      }
      const replacement = requireRecord(replacementObservation, "replacementObservation");
      validate(validateRecord, replacement, "Replacement server observation");
      if (replacement.reviewState !== "confirmed" || replacement.observationId === id) {
        fail("invalid_transition", "Correction requires a new confirmed observation ID.");
      }
      if (replacement.serverId !== current.serverId || replacement.seasonId !== current.seasonId) {
        fail("invalid_transition", "Correction must retain the server and season scope.");
      }
      const superseded = clone(current);
      superseded.reviewState = "superseded";
      superseded.supersededBy = replacement.observationId;
      const next = observations.slice();
      next[index] = superseded;
      next.push(clone(replacement));
      commit(next);
      return { superseded: clone(superseded), replacement: clone(replacement) };
    }

    commit(input.initialObservations);
    return {
      listObservations,
      getObservation,
      hasObservation,
      addObservation,
      reviewProposal,
      correctConfirmed
    };
  }

  const exportsObject = { createServerObservationService, ServerObservationServiceError };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
