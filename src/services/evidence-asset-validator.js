(function initializeEvidenceAssetValidator(globalScope) {
  const FIELDS = [
    "assetId", "storageRef", "ingestionSource", "mediaType", "byteSize", "pixelWidth",
    "pixelHeight", "uploadedBy", "uploadedAt", "observedAt", "observationTimePrecision",
    "integrityHash", "processingState", "processedAt", "failureReason", "sourceContext"
  ];
  const INGESTION_SOURCES = new Set([
    "application_upload", "discord_upload", "api_upload", "bot_upload"
  ]);
  const MEDIA_TYPES = new Set(["image/jpeg", "image/png"]);
  const TIME_PRECISIONS = new Set(["exact", "approximate"]);
  const PROCESSING_STATES = new Set(["uploaded", "processed", "failed"]);
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  const HASH = /^sha256:[0-9a-f]{64}$/;

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function output(errors) {
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  function add(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function nonEmpty(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function parseTimestamp(value) {
    if (typeof value !== "string" || !TIMESTAMP.test(value)) {
      return null;
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    const date = new Date(parsed);
    if (!match
        || date.getUTCFullYear() !== Number(match[1])
        || date.getUTCMonth() + 1 !== Number(match[2])
        || date.getUTCDate() !== Number(match[3])
        || date.getUTCHours() !== Number(match[4])
        || date.getUTCMinutes() !== Number(match[5])
        || date.getUTCSeconds() !== Number(match[6])) {
      return null;
    }
    return parsed;
  }

  function isJsonValue(value, seen) {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return true;
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) return false;
      seen.add(value);
      const valid = value.every((item) => isJsonValue(item, seen));
      seen.delete(value);
      return valid;
    }
    if (!isRecord(value) || seen.has(value)) {
      return false;
    }
    seen.add(value);
    const valid = Object.keys(value).every((key) => isJsonValue(value[key], seen));
    seen.delete(value);
    return valid;
  }

  function validateEvidenceAsset(record) {
    const errors = [];
    if (!isRecord(record)) {
      add(errors, "INVALID_OBJECT", "", "EvidenceAsset must be a plain object.");
      return output(errors);
    }
    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        add(errors, "MISSING_REQUIRED_FIELD", field, `${field} is required.`);
      }
    });
    Object.keys(record).sort().forEach((field) => {
      if (!FIELDS.includes(field)) {
        add(errors, "UNKNOWN_FIELD", field, `Unknown field '${field}'.`);
      }
    });
    ["assetId", "storageRef", "uploadedBy"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field) && !nonEmpty(record[field])) {
        add(errors, "INVALID_STRING", field, `${field} must be non-empty.`);
      }
    });
    if (Object.prototype.hasOwnProperty.call(record, "ingestionSource")
        && !INGESTION_SOURCES.has(record.ingestionSource)) {
      add(errors, "INVALID_ENUM", "ingestionSource", "ingestionSource is invalid.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "mediaType")
        && !MEDIA_TYPES.has(record.mediaType)) {
      add(errors, "INVALID_ENUM", "mediaType", "mediaType is invalid.");
    }
    ["byteSize", "pixelWidth", "pixelHeight"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field)
          && (!Number.isInteger(record[field]) || record[field] <= 0)) {
        add(errors, "INVALID_POSITIVE_INTEGER", field, `${field} must be a positive integer.`);
      }
    });
    const uploadedAt = Object.prototype.hasOwnProperty.call(record, "uploadedAt")
      ? parseTimestamp(record.uploadedAt)
      : null;
    const observedAt = Object.prototype.hasOwnProperty.call(record, "observedAt")
      ? parseTimestamp(record.observedAt)
      : null;
    const processedAt = record.processedAt === null ? null : parseTimestamp(record.processedAt);
    [["uploadedAt", uploadedAt], ["observedAt", observedAt]].forEach(([field, parsed]) => {
      if (Object.prototype.hasOwnProperty.call(record, field) && parsed === null) {
        add(errors, "INVALID_TIMESTAMP", field, `${field} must be a real UTC timestamp.`);
      }
    });
    if (record.processedAt !== null && processedAt === null) {
      add(errors, "INVALID_TIMESTAMP", "processedAt", "processedAt must be null or a real UTC timestamp.");
    }
    if (uploadedAt !== null && observedAt !== null && observedAt > uploadedAt) {
      add(errors, "INVALID_TIMESTAMP_ORDER", "observedAt", "observedAt cannot be later than uploadedAt.");
    }
    if (uploadedAt !== null && processedAt !== null && processedAt < uploadedAt) {
      add(errors, "INVALID_TIMESTAMP_ORDER", "processedAt", "processedAt cannot precede uploadedAt.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "observationTimePrecision")
        && !TIME_PRECISIONS.has(record.observationTimePrecision)) {
      add(errors, "INVALID_ENUM", "observationTimePrecision", "observationTimePrecision is invalid.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "integrityHash")
        && (typeof record.integrityHash !== "string" || !HASH.test(record.integrityHash))) {
      add(errors, "INVALID_HASH", "integrityHash", "integrityHash must be canonical sha256.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "processingState")
        && !PROCESSING_STATES.has(record.processingState)) {
      add(errors, "INVALID_ENUM", "processingState", "processingState is invalid.");
    }
    if (record.failureReason !== null && !nonEmpty(record.failureReason)) {
      add(errors, "INVALID_STRING", "failureReason", "failureReason must be null or non-empty.");
    }
    if (PROCESSING_STATES.has(record.processingState)) {
      if (record.processingState === "uploaded"
          && (record.processedAt !== null || record.failureReason !== null)) {
        add(errors, "INVALID_LIFECYCLE", "processingState", "Uploaded asset has no processing result.");
      }
      if (record.processingState === "processed"
          && (processedAt === null || record.failureReason !== null)) {
        add(errors, "INVALID_LIFECYCLE", "processingState", "Processed asset requires processedAt and no failureReason.");
      }
      if (record.processingState === "failed"
          && (processedAt === null || !nonEmpty(record.failureReason))) {
        add(errors, "INVALID_LIFECYCLE", "processingState", "Failed asset requires processedAt and failureReason.");
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, "sourceContext")
        && (!isRecord(record.sourceContext) || !isJsonValue(record.sourceContext, new Set()))) {
      add(errors, "INVALID_SOURCE_CONTEXT", "sourceContext", "sourceContext must be a JSON-compatible plain object.");
    }
    return output(errors);
  }

  function validateEvidenceAssetHistory(records) {
    const errors = [];
    if (!Array.isArray(records)) {
      add(errors, "INVALID_ARRAY", "records", "records must be an array.");
      return output(errors);
    }
    const ids = new Set();
    records.forEach((record, index) => {
      const validation = validateEvidenceAsset(record);
      validation.errors.forEach((entry) => {
        add(
          errors,
          entry.code,
          entry.path ? `records[${index}].${entry.path}` : `records[${index}]`,
          entry.message
        );
      });
      if (isRecord(record) && nonEmpty(record.assetId)) {
        if (ids.has(record.assetId)) {
          add(errors, "DUPLICATE_ASSET_ID", `records[${index}].assetId`, `Duplicate assetId '${record.assetId}'.`);
        } else {
          ids.add(record.assetId);
        }
      }
    });
    return output(errors);
  }

  const exportsObject = { validateEvidenceAsset, validateEvidenceAssetHistory };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
