(function initializeApplicationAuditRecordValidator(globalScope) {
  const FIELDS = [
    "auditId", "transactionId", "sequence", "actionType", "targetType", "targetId",
    "seasonId", "serverId", "actorId", "recordedAt", "outcome", "details"
  ];
  const REQUIRED_FIELDS = ["auditId", "transactionId", "sequence", "actionType", "targetType", "targetId", "actorId", "recordedAt", "outcome", "details"];
  const ACTION_TYPES = new Set([
    "season_activated", "season_servers_updated", "season_completed",
    "union_registered", "union_identity_updated", "union_archived", "union_restored",
    "native_assignment_confirmed", "ownership_confirmed", "ownership_corrected",
    "server_observation_confirmed", "server_observation_corrected",
    "combat_strength_observation_confirmed", "combat_strength_observation_corrected",
    "target_verification_confirmed", "target_verification_corrected",
    "snapshot_confirmed", "evidence_record_confirmed", "evidence_record_corrected"
  ]);
  const TARGET_TYPES = new Set([
    "season_administration", "union_identity", "native_assignment", "ownership_record",
    "server_observation", "combat_strength_observation", "target_verification",
    "snapshot", "evidence_record"
  ]);
  const OUTCOMES = new Set(["accepted"]);
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const MAX_DETAILS_BYTES = 64 * 1024;

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function add(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function nonEmpty(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function isJson(value, seen) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) {
      if (seen.has(value)) return false;
      seen.add(value);
      const valid = value.every((item) => isJson(item, seen));
      seen.delete(value);
      return valid;
    }
    if (!isRecord(value) || seen.has(value)) return false;
    seen.add(value);
    const valid = Object.keys(value).every((key) => isJson(value[key], seen));
    seen.delete(value);
    return valid;
  }

  function utf8Bytes(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function validateAuditRecord(record, path = "record") {
    const errors = [];
    if (!isRecord(record)) {
      add(errors, "INVALID_OBJECT", path, `${path} must be a plain object.`);
      return { valid: false, errors, warnings: [] };
    }
    const allowed = new Set(FIELDS);
    Object.keys(record).sort().forEach((field) => {
      if (!allowed.has(field)) add(errors, "UNKNOWN_FIELD", `${path}.${field}`, `${path}.${field} is not supported.`);
    });
    REQUIRED_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) add(errors, "MISSING_REQUIRED_FIELD", `${path}.${field}`, `${path}.${field} is required.`);
    });
    ["auditId", "transactionId", "actionType", "targetType", "targetId", "actorId"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field) && !nonEmpty(record[field])) add(errors, "INVALID_STRING", `${path}.${field}`, `${path}.${field} must be non-empty.`);
    });
    if (Object.prototype.hasOwnProperty.call(record, "sequence")
        && (!Number.isSafeInteger(record.sequence) || record.sequence <= 0)) {
      add(errors, "INVALID_SEQUENCE", `${path}.sequence`, "sequence must be a positive safe integer.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "actionType") && !ACTION_TYPES.has(record.actionType)) add(errors, "INVALID_ACTION_TYPE", `${path}.actionType`, "actionType is unsupported.");
    if (Object.prototype.hasOwnProperty.call(record, "targetType") && !TARGET_TYPES.has(record.targetType)) add(errors, "INVALID_TARGET_TYPE", `${path}.targetType`, "targetType is unsupported.");
    ["seasonId", "serverId"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field) && record[field] !== null && !nonEmpty(record[field])) add(errors, "INVALID_STRING", `${path}.${field}`, `${path}.${field} must be null or non-empty.`);
    });
    if (typeof record.recordedAt === "string" && (!TIMESTAMP.test(record.recordedAt) || Number.isNaN(new Date(record.recordedAt).getTime()))) add(errors, "INVALID_TIMESTAMP", `${path}.recordedAt`, "recordedAt must be a canonical UTC timestamp.");
    if (typeof record.recordedAt !== "string") add(errors, "INVALID_TIMESTAMP", `${path}.recordedAt`, "recordedAt must be a canonical UTC timestamp.");
    if (Object.prototype.hasOwnProperty.call(record, "outcome") && !OUTCOMES.has(record.outcome)) add(errors, "INVALID_OUTCOME", `${path}.outcome`, "Only accepted outcome is durable.");
    if (Object.prototype.hasOwnProperty.call(record, "details")) {
      if (!isJson(record.details, new Set())) add(errors, "INVALID_DETAILS", `${path}.details`, "details must be bounded JSON-compatible data.");
      else if (utf8Bytes(JSON.stringify(record.details)) > MAX_DETAILS_BYTES) add(errors, "DETAILS_TOO_LARGE", `${path}.details`, "details exceed the maximum size.");
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  function validateAuditHistory(records) {
    const errors = [];
    if (!Array.isArray(records)) return { valid: false, errors: [{ code: "INVALID_ARRAY", path: "records", message: "records must be an array." }], warnings: [] };
    const ids = new Set();
    const transactions = new Set();
    records.forEach((record, index) => {
      const result = validateAuditRecord(record, `records[${index}]`);
      result.errors.forEach((error) => errors.push(error));
      if (nonEmpty(record && record.auditId)) {
        if (ids.has(record.auditId)) add(errors, "DUPLICATE_AUDIT_ID", `records[${index}].auditId`, "auditId must be unique.");
        ids.add(record.auditId);
      }
      if (nonEmpty(record && record.transactionId) && Number.isSafeInteger(record.sequence)) {
        const key = JSON.stringify([record.transactionId, record.sequence]);
        if (transactions.has(key)) add(errors, "DUPLICATE_TRANSACTION_SEQUENCE", `records[${index}].sequence`, "transactionId and sequence must be unique together.");
        transactions.add(key);
      }
    });
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  const exportsObject = { validateAuditRecord, validateAuditHistory, ACTION_TYPES, TARGET_TYPES, MAX_DETAILS_BYTES };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
