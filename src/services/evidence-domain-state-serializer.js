(function initializeEvidenceDomainStateSerializerFactory(globalScope) {
  const SCHEMA_VERSION = 1;
  const FACTORY_FIELDS = new Set(["validateEvidenceAssetHistory", "validateEvidenceRecordHistory"]);
  const ENVELOPE_FIELDS = ["schemaVersion", "savedAt", "assets", "evidenceRecords"];
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function defineOwn(target, key, value) {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwn(output, key, clone(value[key])));
    return output;
  }
  function makeResult() { return { valid: true, errors: [], warnings: [] }; }
  function add(result, code, path, message) {
    result.valid = false;
    result.errors.push({ code, path, message });
  }
  function createError(code, message, errors) {
    const error = new Error(message);
    error.name = "EvidenceDomainSerializationError";
    error.code = code;
    error.validationErrors = clone(errors || []);
    return error;
  }

  function createEvidenceDomainStateSerializer(options) {
    if (!isRecord(options)) throw createError("INVALID_FACTORY", "Evidence Domain State Serializer requires options.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) throw createError("INVALID_FACTORY", `Unknown option '${unknown[0]}'.`);
    FACTORY_FIELDS.forEach((field) => {
      if (typeof options[field] !== "function") {
        throw createError("INVALID_FACTORY", `Evidence Domain State Serializer requires options.${field}.`);
      }
    });
    const validateAssets = options.validateEvidenceAssetHistory.bind(options);
    const validateRecords = options.validateEvidenceRecordHistory.bind(options);

    function mergeValidation(result, validation, prefix) {
      if (!isRecord(validation) || typeof validation.valid !== "boolean" || !Array.isArray(validation.errors)) {
        add(result, "INVALID_VALIDATOR_RESULT", prefix, `${prefix} validator returned an invalid result.`);
        return;
      }
      validation.errors.forEach((entry) => add(
        result,
        entry.code || "UNKNOWN",
        entry.path ? `${prefix}.${entry.path}` : prefix,
        entry.message || "Validation failed."
      ));
    }

    function validateEnvelope(candidate) {
      const result = makeResult();
      if (!isRecord(candidate)) {
        add(result, "INVALID_OBJECT", "", "Evidence domain envelope must be a plain object.");
        return result;
      }
      ENVELOPE_FIELDS.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(candidate, field)) {
          add(result, "MISSING_REQUIRED_FIELD", field, `${field} is required.`);
        }
      });
      Object.keys(candidate).sort().forEach((field) => {
        if (!ENVELOPE_FIELDS.includes(field)) add(result, "UNKNOWN_FIELD", field, `Unknown field '${field}'.`);
      });
      if (candidate.schemaVersion !== SCHEMA_VERSION) {
        add(
          result,
          Number.isInteger(candidate.schemaVersion) ? "UNSUPPORTED_SCHEMA_VERSION" : "INVALID_SCHEMA_VERSION",
          "schemaVersion",
          "schemaVersion must equal integer 1."
        );
      }
      if (typeof candidate.savedAt !== "string" || !TIMESTAMP.test(candidate.savedAt)) {
        add(result, "INVALID_TIMESTAMP_FORMAT", "savedAt", "savedAt must match YYYY-MM-DDTHH:mm:ss.sssZ.");
      } else {
        const parsed = new Date(candidate.savedAt);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== candidate.savedAt) {
          add(result, "INVALID_TIMESTAMP", "savedAt", "savedAt must be a real UTC timestamp.");
        }
      }

      if (!Array.isArray(candidate.assets)) {
        add(result, "INVALID_ARRAY", "assets", "assets must be an array.");
      } else {
        try {
          mergeValidation(result, validateAssets(candidate.assets), "assets");
        } catch (_error) {
          add(result, "VALIDATOR_THROW", "assets", "Evidence asset history validator threw.");
        }
      }
      if (!Array.isArray(candidate.evidenceRecords)) {
        add(result, "INVALID_ARRAY", "evidenceRecords", "evidenceRecords must be an array.");
      } else {
        try {
          mergeValidation(result, validateRecords(candidate.evidenceRecords), "evidenceRecords");
        } catch (_error) {
          add(result, "VALIDATOR_THROW", "evidenceRecords", "Evidence record history validator threw.");
        }
      }
      if (Array.isArray(candidate.assets) && Array.isArray(candidate.evidenceRecords)) {
        const assetIds = new Set(candidate.assets
          .filter((asset) => isRecord(asset) && typeof asset.assetId === "string")
          .map((asset) => asset.assetId));
        candidate.evidenceRecords.forEach((record, index) => {
          if (isRecord(record) && record.assetId !== null
              && typeof record.assetId === "string" && !assetIds.has(record.assetId)) {
            add(
              result,
              "UNKNOWN_ASSET_REFERENCE",
              `evidenceRecords[${index}].assetId`,
              "Evidence record assetId must resolve within the envelope."
            );
          }
        });
      }
      return result;
    }

    function serializeRuntime(runtime, savedAt) {
      if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) {
        throw createError("INVALID_RUNTIME", "Evidence Domain State Serializer requires a runtime.");
      }
      const assetService = runtime.evidenceAssetService;
      const recordService = runtime.evidenceRecordService;
      if (assetService === null || typeof assetService !== "object"
          || typeof assetService.listAssets !== "function"
          || recordService === null || typeof recordService !== "object"
          || typeof recordService.listEvidenceRecords !== "function") {
        throw createError("INVALID_RUNTIME", "Evidence runtime services are missing.");
      }
      const assets = assetService.listAssets.call(assetService);
      const evidenceRecords = recordService.listEvidenceRecords.call(recordService);
      if (!Array.isArray(assets) || !Array.isArray(evidenceRecords)) {
        throw createError("INVALID_RUNTIME_RESULT", "Evidence runtime list methods must return arrays.");
      }
      const envelope = { schemaVersion: SCHEMA_VERSION, savedAt, assets, evidenceRecords };
      const validation = validateEnvelope(envelope);
      if (!validation.valid) {
        throw createError("INVALID_ENVELOPE", "Evidence runtime produced an invalid envelope.", validation.errors);
      }
      return clone(envelope);
    }

    function deserializeEnvelope(candidate) {
      const validation = validateEnvelope(candidate);
      if (!validation.valid) {
        throw createError("INVALID_ENVELOPE", "Invalid evidence domain envelope.", validation.errors);
      }
      return clone(candidate);
    }
    return { validateEnvelope, serializeRuntime, deserializeEnvelope };
  }

  const exportsObject = { createEvidenceDomainStateSerializer };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
