(function initializeServerObservationValidator(globalScope) {
  const FIELDS = [
    "observationId", "serverId", "seasonId", "text", "observedAt", "sourceType",
    "evidenceIds", "actorId", "reviewState", "reviewerId", "reviewedAt", "supersededBy"
  ];
  const SOURCES = new Set([
    "manual_entry", "screenshot_extraction", "imported_data", "api_integration", "bot_integration"
  ]);
  const STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function result(errors) { return { valid: errors.length === 0, errors, warnings: [] }; }
  function add(errors, code, path, message) { errors.push({ code, path, message }); }
  function nonEmpty(value) { return typeof value === "string" && value.trim() !== ""; }
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
      ? parsed : null;
  }

  function validateInternal(record, prefix, errors) {
    const start = errors.length;
    if (!isRecord(record)) {
      add(errors, "INVALID_OBJECT", prefix, `${prefix || "record"} must be a plain object.`);
      return { valid: false, record: null, observedAt: null, reviewedAt: null };
    }
    const path = prefix ? `${prefix}.` : "";
    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        add(errors, "MISSING_REQUIRED_FIELD", `${path}${field}`, `${path}${field} is required.`);
      }
    });
    Object.keys(record).sort().forEach((field) => {
      if (!FIELDS.includes(field)) add(errors, "UNKNOWN_FIELD", `${path}${field}`, `Unknown field '${field}'.`);
    });
    ["observationId", "serverId", "seasonId", "text", "actorId"].forEach((field) => {
      if (!nonEmpty(record[field])) add(errors, "INVALID_STRING", `${path}${field}`, `${path}${field} must be non-empty.`);
    });
    if (!SOURCES.has(record.sourceType)) add(errors, "INVALID_ENUM", `${path}sourceType`, "sourceType is invalid.");
    if (!STATES.has(record.reviewState)) add(errors, "INVALID_ENUM", `${path}reviewState`, "reviewState is invalid.");
    const observedAt = parseTimestamp(record.observedAt);
    const reviewedAt = record.reviewedAt === null ? null : parseTimestamp(record.reviewedAt);
    if (observedAt === null) add(errors, "INVALID_TIMESTAMP", `${path}observedAt`, "observedAt is invalid.");
    if (record.reviewedAt !== null && reviewedAt === null) add(errors, "INVALID_TIMESTAMP", `${path}reviewedAt`, "reviewedAt is invalid.");
    if (observedAt !== null && reviewedAt !== null && reviewedAt < observedAt) {
      add(errors, "INVALID_TIMESTAMP_ORDER", `${path}reviewedAt`, "reviewedAt cannot precede observedAt.");
    }
    if (!Array.isArray(record.evidenceIds)) {
      add(errors, "INVALID_ARRAY", `${path}evidenceIds`, "evidenceIds must be an array.");
    } else {
      const ids = new Set();
      record.evidenceIds.forEach((id, index) => {
        if (!nonEmpty(id)) add(errors, "INVALID_EVIDENCE_ID", `${path}evidenceIds[${index}]`, "Evidence ID must be non-empty.");
        else if (ids.has(id)) add(errors, "DUPLICATE_EVIDENCE_ID", `${path}evidenceIds[${index}]`, "Evidence IDs must be unique.");
        else ids.add(id);
      });
      if (record.sourceType !== "manual_entry" && record.evidenceIds.length === 0) {
        add(errors, "EVIDENCE_REQUIRED", `${path}evidenceIds`, "Non-manual observations require evidence.");
      }
    }
    ["reviewerId", "supersededBy"].forEach((field) => {
      if (record[field] !== null && !nonEmpty(record[field])) {
        add(errors, "INVALID_STRING", `${path}${field}`, `${path}${field} must be null or non-empty.`);
      }
    });
    if (STATES.has(record.reviewState)) {
      if (record.reviewState === "proposed") {
        if (record.reviewerId !== null || record.reviewedAt !== null || record.supersededBy !== null) {
          add(errors, "INVALID_LIFECYCLE", `${path}reviewState`, "Proposed review fields must be null.");
        }
      } else {
        if (!nonEmpty(record.reviewerId) || reviewedAt === null) {
          add(errors, "INVALID_LIFECYCLE", `${path}reviewState`, "Reviewed observations require reviewerId and reviewedAt.");
        }
        if (record.reviewState === "superseded") {
          if (!nonEmpty(record.supersededBy)) add(errors, "INVALID_LIFECYCLE", `${path}supersededBy`, "Superseded observation requires supersededBy.");
        } else if (record.supersededBy !== null) {
          add(errors, "INVALID_LIFECYCLE", `${path}supersededBy`, "Only superseded observations use supersededBy.");
        }
      }
    }
    return { valid: errors.length === start, record, observedAt, reviewedAt };
  }

  function validateServerObservation(record) {
    const errors = [];
    validateInternal(record, "", errors);
    return result(errors);
  }

  function scope(record) { return JSON.stringify([record.seasonId, record.serverId]); }

  function validateServerObservationHistory(records) {
    const errors = [];
    if (!Array.isArray(records)) {
      add(errors, "INVALID_ARRAY", "records", "records must be an array.");
      return result(errors);
    }
    const metadata = records.map((record, index) => validateInternal(record, `records[${index}]`, errors));
    const ids = new Map();
    metadata.forEach((entry, index) => {
      if (entry.record && nonEmpty(entry.record.observationId)) {
        if (ids.has(entry.record.observationId)) add(errors, "DUPLICATE_OBSERVATION_ID", `records[${index}].observationId`, "observationId must be unique.");
        else ids.set(entry.record.observationId, index);
      }
    });
    const edges = new Map();
    metadata.forEach((entry, index) => {
      if (!entry.valid || entry.record.reviewState !== "superseded") return;
      const replacementIndex = ids.get(entry.record.supersededBy);
      const replacement = replacementIndex === undefined ? null : metadata[replacementIndex];
      if (!replacement
          || !replacement.valid
          || replacement.record.observationId === entry.record.observationId
          || scope(replacement.record) !== scope(entry.record)
          || (replacement.record.reviewState !== "confirmed"
            && replacement.record.reviewState !== "superseded")) {
        add(errors, "INVALID_SUPERSESSION_REFERENCE", `records[${index}].supersededBy`, "supersededBy must reference a valid same-scope correction.");
        return;
      }
      if (replacement.reviewedAt < entry.reviewedAt) {
        add(errors, "INVALID_REVIEW_ORDER", `records[${replacementIndex}].reviewedAt`, "Replacement reviewedAt cannot precede superseded reviewedAt.");
      }
      edges.set(entry.record.observationId, replacement.record.observationId);
    });
    edges.forEach((_target, start) => {
      const seen = new Set();
      let current = start;
      while (edges.has(current)) {
        if (seen.has(current)) {
          add(errors, "SUPERSESSION_CYCLE", `records[${ids.get(start)}].supersededBy`, "Supersession chains must be cycle-free.");
          break;
        }
        seen.add(current);
        current = edges.get(current);
      }
    });
    return result(errors);
  }

  const exportsObject = { validateServerObservation, validateServerObservationHistory };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
