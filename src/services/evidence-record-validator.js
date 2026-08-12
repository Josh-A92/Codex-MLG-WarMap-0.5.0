(function initializeEvidenceRecordValidator(globalScope) {
  const temporalExports = globalScope.validateEventAt
    ? globalScope
    : {
      validateEventAt(value) {
        if (value === null || typeof value !== "object" || Array.isArray(value) || !["exact", "bounded", "unknown"].includes(value.precision)) throw new Error("eventAt is invalid.");
        const timestamp = (candidate) => {
          if (typeof candidate !== "string" || parseTimestamp(candidate) === null) throw new Error("eventAt timestamp is invalid.");
        };
        if (value.precision === "exact") timestamp(value.at);
        if (value.precision === "bounded") {
          timestamp(value.earliestAt); timestamp(value.latestAt);
          if (Date.parse(value.earliestAt) > Date.parse(value.latestAt)) throw new Error("eventAt bounds are reversed.");
        }
        return value;
      },
      validateRuleVersionRef(value) {
        if (value === null || typeof value !== "object" || ["seasonId", "packageVersion", "rulesVersion"].some((field) => typeof value[field] !== "string" || value[field].trim() === "")) throw new Error("ruleVersionRef is invalid.");
        return value;
      }
    };
  const FIELDS = [
    "evidenceId", "assetId", "sourceType", "rawExtractedValue", "normalizedValue",
    "confidence", "observedAt", "reviewState", "actorId", "reviewerId", "reviewedAt",
    "notes", "linkedEntityType", "linkedEntityId", "supersededBy", "eventAt", "recordedAt", "recordedAtLegacyUnknown", "ruleVersionRef"
  ];
  const SOURCE_TYPES = new Set([
    "manual_entry", "screenshot_extraction", "imported_data", "api_integration", "bot_integration"
  ]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function result(errors) {
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  function add(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function nonEmpty(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function parseTimestamp(value) {
    if (typeof value !== "string" || !TIMESTAMP.test(value)) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    const date = new Date(parsed);
    return match
      && date.getUTCFullYear() === Number(match[1])
      && date.getUTCMonth() + 1 === Number(match[2])
      && date.getUTCDate() === Number(match[3])
      && date.getUTCHours() === Number(match[4])
      && date.getUTCMinutes() === Number(match[5])
      && date.getUTCSeconds() === Number(match[6])
      ? parsed
      : null;
  }

  function isJsonValue(value, seen) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) {
      if (seen.has(value)) return false;
      seen.add(value);
      const valid = value.every((item) => isJsonValue(item, seen));
      seen.delete(value);
      return valid;
    }
    if (!isRecord(value) || seen.has(value)) return false;
    seen.add(value);
    const valid = Object.keys(value).every((key) => isJsonValue(value[key], seen));
    seen.delete(value);
    return valid;
  }

  function validateInternal(record, prefix, errors) {
    const start = errors.length;
    if (!isRecord(record)) {
      add(errors, "INVALID_OBJECT", prefix, `${prefix || "record"} must be a plain object.`);
      return { valid: false, record: null, observedAt: null, reviewedAt: null };
    }
    const path = prefix ? `${prefix}.` : "";
    FIELDS.filter((field) => !["eventAt", "recordedAt", "recordedAtLegacyUnknown", "ruleVersionRef"].includes(field)).forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        add(errors, "MISSING_REQUIRED_FIELD", `${path}${field}`, `${path}${field} is required.`);
      }
    });
    Object.keys(record).sort().forEach((field) => {
      if (!FIELDS.includes(field)) add(errors, "UNKNOWN_FIELD", `${path}${field}`, `Unknown field '${field}'.`);
    });
    ["evidenceId", "actorId", "linkedEntityType", "linkedEntityId"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field) && !nonEmpty(record[field])) {
        add(errors, "INVALID_STRING", `${path}${field}`, `${path}${field} must be non-empty.`);
      }
    });
    ["assetId", "reviewerId", "supersededBy"].forEach((field) => {
      if (record[field] !== null && !nonEmpty(record[field])) {
        add(errors, "INVALID_STRING", `${path}${field}`, `${path}${field} must be null or non-empty.`);
      }
    });
    if (record.notes !== null && typeof record.notes !== "string") {
      add(errors, "INVALID_NOTES", `${path}notes`, "notes must be null or a string.");
    }
    if (record.rawExtractedValue !== null && typeof record.rawExtractedValue !== "string") {
      add(errors, "INVALID_RAW_VALUE", `${path}rawExtractedValue`, "rawExtractedValue must be null or a string.");
    }
    if (!isJsonValue(record.normalizedValue, new Set())) {
      add(errors, "INVALID_NORMALIZED_VALUE", `${path}normalizedValue`, "normalizedValue must be JSON-compatible.");
    }
    if (!SOURCE_TYPES.has(record.sourceType)) {
      add(errors, "INVALID_ENUM", `${path}sourceType`, "sourceType is invalid.");
    }
    if (!REVIEW_STATES.has(record.reviewState)) {
      add(errors, "INVALID_ENUM", `${path}reviewState`, "reviewState is invalid.");
    }
    const observedAt = parseTimestamp(record.observedAt);
    const reviewedAt = record.reviewedAt === null ? null : parseTimestamp(record.reviewedAt);
    if (observedAt === null) add(errors, "INVALID_TIMESTAMP", `${path}observedAt`, "observedAt is invalid.");
    if (record.reviewedAt !== null && reviewedAt === null) {
      add(errors, "INVALID_TIMESTAMP", `${path}reviewedAt`, "reviewedAt is invalid.");
    }
    if (observedAt !== null && reviewedAt !== null && reviewedAt < observedAt) {
      add(errors, "INVALID_TIMESTAMP_ORDER", `${path}reviewedAt`, "reviewedAt cannot precede observedAt.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "eventAt")) {
      try { temporalExports.validateEventAt(record.eventAt); } catch (error) { add(errors, "INVALID_EVENT_TIME", `${path}eventAt`, error.message); }
    }
    if (Object.prototype.hasOwnProperty.call(record, "recordedAt") && record.recordedAt !== null && parseTimestamp(record.recordedAt) === null) {
      add(errors, "INVALID_TIMESTAMP", `${path}recordedAt`, "recordedAt is invalid.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "recordedAtLegacyUnknown") && typeof record.recordedAtLegacyUnknown !== "boolean") {
      add(errors, "INVALID_BOOLEAN", `${path}recordedAtLegacyUnknown`, "recordedAtLegacyUnknown must be boolean.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "ruleVersionRef") && record.ruleVersionRef !== null) {
      try { temporalExports.validateRuleVersionRef(record.ruleVersionRef); } catch (error) { add(errors, "INVALID_RULE_VERSION", `${path}ruleVersionRef`, error.message); }
    }
    if (record.sourceType === "manual_entry") {
      if (record.confidence !== null) {
        add(errors, "INVALID_CONFIDENCE", `${path}confidence`, "Manual confidence must be null.");
      }
    } else {
      if (!nonEmpty(record.assetId)) {
        add(errors, "ASSET_REQUIRED", `${path}assetId`, "Non-manual evidence requires assetId.");
      }
      if (typeof record.confidence !== "number"
          || !Number.isFinite(record.confidence)
          || record.confidence < 0
          || record.confidence > 1) {
        add(errors, "INVALID_CONFIDENCE", `${path}confidence`, "Non-manual confidence must be from 0 through 1.");
      }
    }
    if (REVIEW_STATES.has(record.reviewState)) {
      if (record.reviewState === "proposed") {
        if (record.reviewerId !== null || record.reviewedAt !== null || record.supersededBy !== null) {
          add(errors, "INVALID_LIFECYCLE", `${path}reviewState`, "Proposed review fields must be null.");
        }
      } else {
        if (!nonEmpty(record.reviewerId) || reviewedAt === null) {
          add(errors, "INVALID_LIFECYCLE", `${path}reviewState`, "Reviewed evidence requires reviewerId and reviewedAt.");
        }
        if (record.reviewState === "superseded") {
          if (!nonEmpty(record.supersededBy)) {
            add(errors, "INVALID_LIFECYCLE", `${path}supersededBy`, "Superseded evidence requires supersededBy.");
          }
        } else if (record.supersededBy !== null) {
          add(errors, "INVALID_LIFECYCLE", `${path}supersededBy`, "Only superseded evidence uses supersededBy.");
        }
      }
    }
    return { valid: errors.length === start, record, observedAt, reviewedAt };
  }

  function validateEvidenceRecord(record) {
    const errors = [];
    validateInternal(record, "", errors);
    return result(errors);
  }

  function entityKey(record) {
    return JSON.stringify([record.linkedEntityType, record.linkedEntityId]);
  }

  function validateEvidenceRecordHistory(records) {
    const errors = [];
    if (!Array.isArray(records)) {
      add(errors, "INVALID_ARRAY", "records", "records must be an array.");
      return result(errors);
    }
    const metadata = records.map((record, index) => validateInternal(record, `records[${index}]`, errors));
    const ids = new Map();
    metadata.forEach((entry, index) => {
      if (entry.record && nonEmpty(entry.record.evidenceId)) {
        if (ids.has(entry.record.evidenceId)) {
          add(errors, "DUPLICATE_EVIDENCE_ID", `records[${index}].evidenceId`, `Duplicate evidenceId '${entry.record.evidenceId}'.`);
        } else ids.set(entry.record.evidenceId, index);
      }
    });
    const edges = new Map();
    metadata.forEach((entry, index) => {
      if (!entry.valid || entry.record.reviewState !== "superseded") return;
      const replacementIndex = ids.get(entry.record.supersededBy);
      const replacement = replacementIndex === undefined ? null : metadata[replacementIndex];
      if (!replacement
          || !replacement.valid
          || replacement.record.evidenceId === entry.record.evidenceId
          || entityKey(replacement.record) !== entityKey(entry.record)
          || (replacement.record.reviewState !== "confirmed"
            && replacement.record.reviewState !== "superseded")) {
        add(errors, "INVALID_SUPERSESSION_REFERENCE", `records[${index}].supersededBy`, "supersededBy must reference a valid correction for the same entity.");
        return;
      }
      if (replacement.reviewedAt < entry.reviewedAt) {
        add(errors, "INVALID_REVIEW_ORDER", `records[${replacementIndex}].reviewedAt`, "Replacement reviewedAt cannot precede superseded reviewedAt.");
      }
      edges.set(entry.record.evidenceId, replacement.record.evidenceId);
    });
    edges.forEach((_target, start) => {
      const visited = new Set();
      let current = start;
      while (edges.has(current)) {
        if (visited.has(current)) {
          add(errors, "SUPERSESSION_CYCLE", `records[${ids.get(start)}].supersededBy`, "Supersession chains must be cycle-free.");
          break;
        }
        visited.add(current);
        current = edges.get(current);
      }
    });
    return result(errors);
  }

  const exportsObject = { validateEvidenceRecord, validateEvidenceRecordHistory };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
