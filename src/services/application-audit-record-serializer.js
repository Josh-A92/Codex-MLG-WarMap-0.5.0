(function initializeApplicationAuditRecordSerializer(globalScope) {
  const SCHEMA_VERSION = 1;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true }));
    return output;
  }

  function createApplicationAuditRecordSerializer(options) {
    if (!isRecord(options) || typeof options.validateAuditHistory !== "function") {
      throw new TypeError("createApplicationAuditRecordSerializer requires validateAuditHistory.");
    }
    const validateHistory = options.validateAuditHistory;

    function validateEnvelope(candidate) {
      const result = { valid: true, errors: [], warnings: [] };
      if (!isRecord(candidate)) return { valid: false, errors: [{ code: "INVALID_OBJECT", path: "", message: "Audit envelope must be an object." }], warnings: [] };
      if (candidate.schemaVersion !== SCHEMA_VERSION) result.errors.push({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "schemaVersion", message: "Audit envelope schemaVersion must equal 1." });
      if (!Array.isArray(candidate.records)) result.errors.push({ code: "INVALID_ARRAY", path: "records", message: "Audit envelope records must be an array." });
      else {
        const validation = validateHistory(candidate.records);
        if (!validation || validation.valid !== true) result.errors.push(...((validation && validation.errors) || [{ code: "INVALID_HISTORY", path: "records", message: "Audit history is invalid." }]));
      }
      result.valid = result.errors.length === 0;
      return result;
    }

    function serializeRecords(records) {
      const envelope = { schemaVersion: SCHEMA_VERSION, records: clone(records) };
      const validation = validateEnvelope(envelope);
      if (!validation.valid) throw Object.assign(new Error("Audit history serialization failed."), { code: "INVALID_AUDIT_ENVELOPE", validationErrors: validation.errors });
      return envelope;
    }

    function deserializeEnvelope(candidate) {
      const validation = validateEnvelope(candidate);
      if (!validation.valid) throw Object.assign(new Error("Audit history deserialization failed."), { code: "INVALID_AUDIT_ENVELOPE", validationErrors: validation.errors });
      return clone(candidate);
    }

    return Object.freeze({ validateEnvelope, serializeRecords, deserializeEnvelope });
  }

  const exportsObject = { createApplicationAuditRecordSerializer, SCHEMA_VERSION };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
