(function initializeApplicationAuditRecordService(globalScope) {
  class ApplicationAuditRecordServiceError extends Error {
    constructor(code, message, validationErrors) {
      super(message);
      this.name = "ApplicationAuditRecordServiceError";
      this.code = code;
      if (validationErrors) this.validationErrors = validationErrors;
    }
  }

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

  function fail(code, message, errors) {
    throw new ApplicationAuditRecordServiceError(code, message, errors);
  }

  function createApplicationAuditRecordService(options) {
    if (!isRecord(options)) fail("invalid_factory", "options must be a plain object.");
    const allowed = new Set(["initialRecords", "validateAuditRecord", "validateAuditHistory", "createAuditId", "clock"]);
    const unknown = Object.keys(options).filter((key) => !allowed.has(key)).sort();
    if (unknown.length) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    ["initialRecords", "validateAuditRecord", "validateAuditHistory", "createAuditId", "clock"].forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) fail("invalid_factory", `Missing option '${field}'.`);
    });
    if (!Array.isArray(options.initialRecords) || typeof options.validateAuditRecord !== "function" || typeof options.validateAuditHistory !== "function" || typeof options.createAuditId !== "function" || typeof options.clock !== "function") fail("invalid_factory", "Audit service dependencies are invalid.");
    const validateRecord = options.validateAuditRecord;
    const validateHistory = options.validateAuditHistory;
    let records = [];

    function validate(candidate, validator, code) {
      let result;
      try { result = validator(candidate); } catch (error) { fail(code, "Audit validator threw."); }
      if (!result || result.valid !== true || !Array.isArray(result.errors)) fail(code, "Audit validator rejected the record.", result && result.errors);
    }

    function ordered() {
      return records.slice().sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.transactionId.localeCompare(right.transactionId) || left.sequence - right.sequence || left.auditId.localeCompare(right.auditId));
    }

    function append(input) {
      if (!isRecord(input)) fail("invalid_input", "audit intent must be a plain object.");
      if (Object.prototype.hasOwnProperty.call(input, "auditId") || Object.prototype.hasOwnProperty.call(input, "recordedAt") || input.outcome !== undefined) fail("forged_audit_metadata", "auditId, recordedAt, and outcome are system-controlled.");
      const id = options.createAuditId();
      const clockValue = options.clock();
      if (typeof id !== "string" || id.trim() === "") fail("invalid_dependency", "createAuditId must return a non-empty string.");
      if (!(clockValue instanceof Date) || Number.isNaN(clockValue.getTime())) fail("invalid_clock", "clock must return a valid Date.");
      const record = clone({ ...input, auditId: id, recordedAt: clockValue.toISOString(), outcome: "accepted" });
      validate(record, validateRecord, "invalid_record");
      if (records.some((entry) => entry.auditId === record.auditId)) fail("duplicate_audit_id", "auditId already exists.");
      if (records.some((entry) => entry.transactionId === record.transactionId && entry.sequence === record.sequence)) fail("duplicate_transaction_sequence", "transactionId and sequence already exists.");
      records = records.concat([record]);
      return clone(record);
    }

    function captureTransactionState() { return clone(records); }
    function restoreTransactionState(snapshot) {
      if (!Array.isArray(snapshot)) fail("invalid_input", "snapshot must be an array.");
      validate(snapshot, validateHistory, "invalid_history");
      records = clone(snapshot);
    }

    validate(options.initialRecords, validateHistory, "invalid_history");
    records = clone(options.initialRecords);
    return Object.freeze({ append, listRecords: () => ordered().map(clone), captureTransactionState, restoreTransactionState });
  }

  const exportsObject = { createApplicationAuditRecordService, ApplicationAuditRecordServiceError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
