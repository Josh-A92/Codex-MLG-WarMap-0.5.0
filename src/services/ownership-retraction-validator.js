(function initializeOwnershipRetractionValidator(globalScope) {
  const FIELDS = [
    "retractionId",
    "seasonId",
    "serverId",
    "targetKind",
    "retractedRecordId",
    "actorId",
    "reason",
    "recordedAt",
    "transactionId",
    "sourceType"
  ];
  const TARGET_KINDS = new Set([
    "territory_ownership_record",
    "structure_ownership_record"
  ]);
  const SOURCE_TYPE = "manual_retraction";
  const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function createResult(errors) {
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  function pushError(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function validateTimestamp(errors, value, path) {
    if (typeof value !== "string" || !ISO_UTC_TIMESTAMP_PATTERN.test(value)) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${path} must be an ISO UTC timestamp.`);
      return;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${path} must be a real UTC timestamp.`);
      return;
    }
    const fraction = value.includes(".")
      ? value.slice(value.indexOf(".") + 1, -1).padEnd(3, "0")
      : "000";
    const canonical = `${value.slice(0, 19)}.${fraction}Z`;
    if (parsed.toISOString() !== canonical) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${path} must be a real UTC timestamp.`);
    }
  }

  function validateRecordShape(record, path) {
    const errors = [];
    if (!isRecordObject(record)) {
      pushError(errors, "INVALID_RECORD", path, `${path} must be a plain object.`);
      return createResult(errors);
    }

    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.${field}`, `${path}.${field} is required.`);
      }
    });

    Object.keys(record).sort().forEach((field) => {
      if (!FIELDS.includes(field)) {
        pushError(errors, "UNKNOWN_FIELD", `${path}.${field}`, `${path}.${field} is not supported.`);
      }
    });

    ["retractionId", "seasonId", "serverId", "retractedRecordId", "actorId", "reason", "transactionId"]
      .forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(record, field)
            && !isNonEmptyTrimmedString(record[field])) {
          pushError(errors, "INVALID_STRING", `${path}.${field}`, `${path}.${field} must be a non-empty string.`);
        }
      });

    if (Object.prototype.hasOwnProperty.call(record, "targetKind")
        && !TARGET_KINDS.has(record.targetKind)) {
      pushError(errors, "INVALID_TARGET_KIND", `${path}.targetKind`, `${path}.targetKind must be a supported ownership target kind.`);
    }

    if (Object.prototype.hasOwnProperty.call(record, "sourceType")
        && record.sourceType !== SOURCE_TYPE) {
      pushError(errors, "INVALID_SOURCE_TYPE", `${path}.sourceType`, `${path}.sourceType must be '${SOURCE_TYPE}'.`);
    }

    if (Object.prototype.hasOwnProperty.call(record, "recordedAt")) {
      validateTimestamp(errors, record.recordedAt, `${path}.recordedAt`);
    }

    return createResult(errors);
  }

  function validateOwnershipRetractionRecord(record) {
    return validateRecordShape(record, "record");
  }

  function validateOwnershipRetractionHistory(records) {
    const errors = [];
    if (!Array.isArray(records)) {
      pushError(errors, "INVALID_HISTORY", "records", "records must be an array.");
      return createResult(errors);
    }

    const retractionIds = new Set();
    const retractedRecordIds = new Set();

    records.forEach((record, index) => {
      const result = validateRecordShape(record, `records[${index}]`);
      errors.push(...result.errors);
      if (!result.valid) {
        return;
      }

      if (retractionIds.has(record.retractionId)) {
        pushError(
          errors,
          "DUPLICATE_RETRACTION_ID",
          `records[${index}].retractionId`,
          `records[${index}].retractionId duplicates an existing retraction ID.`
        );
      } else {
        retractionIds.add(record.retractionId);
      }

      if (retractedRecordIds.has(record.retractedRecordId)) {
        pushError(
          errors,
          "DUPLICATE_RETRACTED_RECORD",
          `records[${index}].retractedRecordId`,
          `records[${index}].retractedRecordId duplicates an existing retracted record reference.`
        );
      } else {
        retractedRecordIds.add(record.retractedRecordId);
      }
    });

    return createResult(errors);
  }

  const api = {
    validateOwnershipRetractionRecord,
    validateOwnershipRetractionHistory
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.validateOwnershipRetractionRecord = validateOwnershipRetractionRecord;
    globalScope.validateOwnershipRetractionHistory = validateOwnershipRetractionHistory;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
