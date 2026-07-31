(function initializeEvidenceRecordServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialEvidenceRecords",
    "validateEvidenceRecord",
    "validateEvidenceRecordHistory",
    "evidenceAssetService"
  ]);
  const FILTER_FIELDS = new Set([
    "evidenceId", "assetId", "sourceType", "reviewState", "actorId", "reviewerId",
    "linkedEntityType", "linkedEntityId"
  ]);

  class EvidenceRecordServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "EvidenceRecordServiceError";
      this.code = code;
      if (validationErrors) this.validationErrors = validationErrors;
    }
  }

  function fail(code, message, errors) {
    throw new EvidenceRecordServiceError(code, message, errors);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineOwn(target, key, value) {
    Object.defineProperty(target, key, {
      value, enumerable: true, configurable: true, writable: true
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
    if (!isRecord(value)) fail(code, `Evidence Record Service requires ${path} to be a plain object.`);
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Evidence Record Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function exactFields(value, fields, path, requireAll) {
    Object.keys(value).sort().forEach((field) => {
      if (!fields.has(field)) fail("invalid_input", `Evidence Record Service does not recognize ${path}.${field}.`);
    });
    if (requireAll) fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_factory", `Evidence Record Service requires ${path}.${field}.`);
      }
    });
  }

  function createEvidenceRecordService(options) {
    const input = requireRecord(options, "options", "invalid_factory");
    exactFields(input, FACTORY_FIELDS, "options", true);
    if (!Array.isArray(input.initialEvidenceRecords)
        || typeof input.validateEvidenceRecord !== "function"
        || typeof input.validateEvidenceRecordHistory !== "function") {
      fail("invalid_factory", "Evidence Record Service requires initial records and validator functions.");
    }
    const assetService = input.evidenceAssetService;
    if (assetService === null
        || typeof assetService !== "object"
        || Array.isArray(assetService)
        || typeof assetService.hasAsset !== "function") {
      fail("invalid_factory", "Evidence Record Service requires options.evidenceAssetService.hasAsset.");
    }
    const hasAsset = assetService.hasAsset.bind(assetService);
    const validateRecord = input.validateEvidenceRecord.bind(input);
    const validateHistory = input.validateEvidenceRecordHistory.bind(input);
    let records = [];
    let indexById = new Map();

    function validate(validator, value, label) {
      let result;
      try {
        result = validator(value);
      } catch (error) {
        fail("invalid_dependency", `${label} validator threw.`, [
          { code: "VALIDATOR_THROW", path: "", message: error.message }
        ]);
      }
      if (!isRecord(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
        fail("invalid_dependency", `${label} validator returned an invalid result.`);
      }
      if (!result.valid) fail("invalid_history", `${label} validation failed.`, clone(result.errors));
    }

    function validateAssets(candidate) {
      candidate.forEach((record, index) => {
        if (record.assetId !== null && !hasAsset(record.assetId)) {
          fail(
            "unknown_asset",
            `Evidence Record Service could not resolve records[${index}].assetId '${record.assetId}'.`
          );
        }
      });
    }

    function commit(candidate) {
      validate(validateHistory, candidate, "Evidence record history");
      validateAssets(candidate);
      records = clone(candidate);
      indexById = new Map();
      records.forEach((record, index) => indexById.set(record.evidenceId, index));
    }

    function listEvidenceRecords(filter) {
      const value = filter === undefined ? {} : requireRecord(filter, "filter");
      exactFields(value, FILTER_FIELDS, "filter", false);
      Object.keys(value).forEach((field) => {
        if (value[field] !== null) requireString(value[field], `filter.${field}`);
      });
      return records.filter((record) => (
        Object.keys(value).every((field) => record[field] === value[field])
      )).map(clone);
    }

    function getEvidenceRecord(evidenceId) {
      const id = requireString(evidenceId, "evidenceId");
      const index = indexById.get(id);
      return index === undefined ? null : clone(records[index]);
    }

    function hasEvidenceRecord(evidenceId) {
      return indexById.has(requireString(evidenceId, "evidenceId"));
    }

    function addEvidenceRecord(record) {
      const candidate = requireRecord(record, "record");
      validate(validateRecord, candidate, "Evidence record");
      if (indexById.has(candidate.evidenceId)) {
        fail("duplicate_evidence", `Evidence record '${candidate.evidenceId}' already exists.`);
      }
      commit(records.concat([clone(candidate)]));
      return clone(candidate);
    }

    function reviewProposal(evidenceId, reviewedRecord) {
      const id = requireString(evidenceId, "evidenceId");
      const index = indexById.get(id);
      if (index === undefined) fail("unknown_evidence", `Evidence record '${id}' does not exist.`);
      const current = records[index];
      if (current.reviewState !== "proposed") {
        fail("invalid_transition", "Only proposed evidence records may be reviewed.");
      }
      const replacement = requireRecord(reviewedRecord, "reviewedRecord");
      validate(validateRecord, replacement, "Reviewed evidence record");
      if (replacement.evidenceId !== id
          || (replacement.reviewState !== "confirmed" && replacement.reviewState !== "rejected")) {
        fail("invalid_transition", "Proposal review must retain its ID and become confirmed or rejected.");
      }
      const lifecycle = new Set(["reviewState", "reviewerId", "reviewedAt"]);
      Object.keys(current).forEach((field) => {
        if (!lifecycle.has(field)
            && JSON.stringify(current[field]) !== JSON.stringify(replacement[field])) {
          fail("invalid_transition", `Proposal review cannot change factual field '${field}'.`);
        }
      });
      const next = records.slice();
      next[index] = clone(replacement);
      commit(next);
      return clone(replacement);
    }

    function correctConfirmed(evidenceId, replacementRecord) {
      const id = requireString(evidenceId, "evidenceId");
      const index = indexById.get(id);
      if (index === undefined) fail("unknown_evidence", `Evidence record '${id}' does not exist.`);
      const current = records[index];
      if (current.reviewState !== "confirmed") {
        fail("invalid_transition", "Only confirmed evidence records may be corrected.");
      }
      const replacement = requireRecord(replacementRecord, "replacementRecord");
      validate(validateRecord, replacement, "Replacement evidence record");
      if (replacement.reviewState !== "confirmed" || replacement.evidenceId === id) {
        fail("invalid_transition", "Correction requires a new confirmed evidence ID.");
      }
      const superseded = clone(current);
      superseded.reviewState = "superseded";
      superseded.supersededBy = replacement.evidenceId;
      const next = records.slice();
      next[index] = superseded;
      next.push(clone(replacement));
      commit(next);
      return { superseded: clone(superseded), replacement: clone(replacement) };
    }

    commit(input.initialEvidenceRecords);
    return {
      listEvidenceRecords,
      getEvidenceRecord,
      hasEvidenceRecord,
      addEvidenceRecord,
      reviewProposal,
      correctConfirmed
    };
  }

  const exportsObject = { createEvidenceRecordService, EvidenceRecordServiceError };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
