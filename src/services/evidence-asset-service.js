(function initializeEvidenceAssetServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialAssets",
    "validateEvidenceAsset",
    "validateEvidenceAssetHistory"
  ]);
  const FILTER_FIELDS = new Set([
    "assetId", "ingestionSource", "mediaType", "uploadedBy", "observationTimePrecision",
    "processingState"
  ]);

  class EvidenceAssetServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "EvidenceAssetServiceError";
      this.code = code;
      if (validationErrors) this.validationErrors = validationErrors;
    }
  }

  function fail(code, message, errors) {
    throw new EvidenceAssetServiceError(code, message, errors);
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
    if (!isRecord(value)) fail(code, `Evidence Asset Service requires ${path} to be a plain object.`);
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Evidence Asset Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function exactFields(value, fields, path, requireAll) {
    Object.keys(value).sort().forEach((field) => {
      if (!fields.has(field)) fail("invalid_input", `Evidence Asset Service does not recognize ${path}.${field}.`);
    });
    if (requireAll) {
      fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          fail("invalid_factory", `Evidence Asset Service requires ${path}.${field}.`);
        }
      });
    }
  }

  function createEvidenceAssetService(options) {
    const input = requireRecord(options, "options", "invalid_factory");
    exactFields(input, FACTORY_FIELDS, "options", true);
    if (!Array.isArray(input.initialAssets)) {
      fail("invalid_factory", "Evidence Asset Service requires options.initialAssets to be an array.");
    }
    if (typeof input.validateEvidenceAsset !== "function"
        || typeof input.validateEvidenceAssetHistory !== "function") {
      fail("invalid_factory", "Evidence Asset Service requires both validator functions.");
    }
    const validateRecord = input.validateEvidenceAsset.bind(input);
    const validateHistory = input.validateEvidenceAssetHistory.bind(input);
    let assets = [];
    let indexById = new Map();

    function run(validator, value, label) {
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

    function commit(candidate) {
      run(validateHistory, candidate, "Evidence asset history");
      assets = clone(candidate);
      indexById = new Map();
      assets.forEach((asset, index) => indexById.set(asset.assetId, index));
    }

    function normalizeFilter(filter) {
      if (filter === undefined) return {};
      const value = requireRecord(filter, "filter");
      exactFields(value, FILTER_FIELDS, "filter", false);
      Object.keys(value).forEach((field) => requireString(value[field], `filter.${field}`));
      return value;
    }

    function listAssets(filter) {
      const value = normalizeFilter(filter);
      return assets.filter((asset) => Object.keys(value).every((field) => asset[field] === value[field]))
        .map(clone);
    }

    function getAsset(assetId) {
      const id = requireString(assetId, "assetId");
      const index = indexById.get(id);
      return index === undefined ? null : clone(assets[index]);
    }

    function hasAsset(assetId) {
      return indexById.has(requireString(assetId, "assetId"));
    }

    function addUploadedAsset(asset) {
      const candidate = requireRecord(asset, "asset");
      run(validateRecord, candidate, "Evidence asset");
      if (candidate.processingState !== "uploaded") {
        fail("invalid_transition", "New evidence assets must begin in uploaded state.");
      }
      if (indexById.has(candidate.assetId)) {
        fail("duplicate_asset", `Evidence asset '${candidate.assetId}' already exists.`);
      }
      commit(assets.concat([clone(candidate)]));
      return clone(candidate);
    }

    function applyProcessingResult(assetId, processingState, processedAt, failureReason) {
      const id = requireString(assetId, "assetId");
      const index = indexById.get(id);
      if (index === undefined) fail("unknown_asset", `Evidence asset '${id}' does not exist.`);
      const current = assets[index];
      if (current.processingState === "processed") {
        fail("invalid_transition", "A processed evidence asset is terminal.");
      }
      const replacement = clone(current);
      replacement.processingState = processingState;
      replacement.processedAt = processedAt;
      replacement.failureReason = failureReason;
      run(validateRecord, replacement, "Evidence asset");
      const next = assets.slice();
      next[index] = replacement;
      commit(next);
      return clone(replacement);
    }

    function markProcessed(assetId, processedAt) {
      return applyProcessingResult(assetId, "processed", processedAt, null);
    }

    function markFailed(assetId, processedAt, failureReason) {
      requireString(failureReason, "failureReason");
      return applyProcessingResult(assetId, "failed", processedAt, failureReason);
    }

    commit(input.initialAssets);
    return { listAssets, getAsset, hasAsset, addUploadedAsset, markProcessed, markFailed };
  }

  const exportsObject = { createEvidenceAssetService, EvidenceAssetServiceError };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
