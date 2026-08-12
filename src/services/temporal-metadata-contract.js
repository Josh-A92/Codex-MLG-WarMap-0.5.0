(function initializeTemporalMetadataContract(globalScope) {
  const PRECISIONS = new Set(["exact", "bounded", "unknown"]);
  const RULE_VERSION_FIELDS = new Set(["seasonId", "packageVersion", "rulesVersion"]);
  const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

  class TemporalMetadataError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "TemporalMetadataError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new TemporalMetadataError(code, message);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    return Object.keys(value).reduce((result, key) => {
      Object.defineProperty(result, key, {
        value: clone(value[key]), enumerable: true, configurable: true, writable: true
      });
      return result;
    }, Object.getPrototypeOf(value) === null ? Object.create(null) : {});
  }

  function validateTimestamp(value, path) {
    if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
      fail("invalid_timestamp", `${path} must be a UTC ISO-8601 timestamp ending in Z.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      fail("invalid_timestamp", `${path} must represent a real UTC timestamp.`);
    }
    const fraction = value.includes(".") ? value.slice(value.indexOf(".") + 1, -1).padEnd(3, "0") : "000";
    const canonical = `${value.slice(0, 19)}.${fraction}Z`;
    if (parsed.toISOString() !== canonical) {
      fail("invalid_timestamp", `${path} must represent a real UTC timestamp.`);
    }
    return value;
  }

  function validateEventAt(value, path = "eventAt") {
    if (!isRecord(value) || typeof value.precision !== "string" || !PRECISIONS.has(value.precision)) {
      fail("invalid_event_time", `${path} must use exact, bounded, or unknown precision.`);
    }
    const keys = Object.keys(value);
    if (value.precision === "exact") {
      if (keys.some((key) => !["precision", "at"].includes(key)) || keys.length !== 2) {
        fail("invalid_event_time", `${path} exact values require only precision and at.`);
      }
      validateTimestamp(value.at, `${path}.at`);
      return clone(value);
    }
    if (value.precision === "bounded") {
      if (keys.some((key) => !["precision", "earliestAt", "latestAt"].includes(key)) || keys.length !== 3) {
        fail("invalid_event_time", `${path} bounded values require precision, earliestAt, and latestAt.`);
      }
      validateTimestamp(value.earliestAt, `${path}.earliestAt`);
      validateTimestamp(value.latestAt, `${path}.latestAt`);
      if (Date.parse(value.earliestAt) > Date.parse(value.latestAt)) {
        fail("invalid_event_time", `${path}.earliestAt must not be later than latestAt.`);
      }
      return clone(value);
    }
    if (keys.length !== 1) fail("invalid_event_time", `${path} unknown values require only precision.`);
    return { precision: "unknown" };
  }

  function validateRuleVersionRef(value) {
    if (!isRecord(value)) fail("invalid_rule_version", "ruleVersionRef must be an object when present.");
    const keys = Object.keys(value);
    if (keys.some((key) => !RULE_VERSION_FIELDS.has(key)) || keys.length !== RULE_VERSION_FIELDS.size) {
      fail("invalid_rule_version", "ruleVersionRef requires seasonId, packageVersion, and rulesVersion only.");
    }
    RULE_VERSION_FIELDS.forEach((field) => {
      if (typeof value[field] !== "string" || value[field].trim() === "") {
        fail("invalid_rule_version", `ruleVersionRef.${field} must be a non-empty string.`);
      }
    });
    return clone(value);
  }

  function createTemporalMetadataContract(options) {
    if (!isRecord(options) || typeof options.clock !== "function") {
      throw new TypeError("createTemporalMetadataContract requires a clock function.");
    }

    function assignRecordedAt() {
      const value = options.clock();
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        fail("invalid_clock", "The application clock must return a valid Date.");
      }
      return value.toISOString();
    }

    function normalize(record, mode = "new") {
      if (!isRecord(record)) fail("invalid_record", "record must be an object.");
      const legacy = mode === "legacy";
      if (mode !== "new" && !legacy) fail("invalid_mode", "mode must be new or legacy.");
      const result = clone(record);
      if (Object.prototype.hasOwnProperty.call(result, "eventAt")) {
        result.eventAt = validateEventAt(result.eventAt);
      } else if (legacy && Object.prototype.hasOwnProperty.call(result, "effectiveAt")) {
        validateTimestamp(result.effectiveAt, "effectiveAt");
        result.eventAt = { precision: "exact", at: result.effectiveAt };
        delete result.effectiveAt;
      } else if (legacy) {
        result.eventAt = { precision: "unknown" };
      } else if (!legacy) {
        fail("missing_event_time", "New records require eventAt.");
      }

      ["observedAt", "reviewedAt"].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(result, field) && result[field] !== null) {
          validateTimestamp(result[field], field);
        }
      });

      if (Object.prototype.hasOwnProperty.call(result, "ruleVersionRef") && result.ruleVersionRef !== null) {
        result.ruleVersionRef = validateRuleVersionRef(result.ruleVersionRef);
      }

      if (legacy) {
        if (Object.prototype.hasOwnProperty.call(result, "recordedAt") && result.recordedAt !== null) {
          validateTimestamp(result.recordedAt, "recordedAt");
          result.recordedAtLegacyUnknown = false;
        } else {
          result.recordedAt = null;
          result.recordedAtLegacyUnknown = true;
        }
      } else {
        if (Object.prototype.hasOwnProperty.call(result, "recordedAt")) {
          fail("caller_recorded_at", "New records cannot author recordedAt.");
        }
        result.recordedAt = assignRecordedAt();
        result.recordedAtLegacyUnknown = false;
      }
      return result;
    }

    return Object.freeze({
      normalizeNew: (record) => normalize(record, "new"),
      normalizeLegacy: (record) => normalize(record, "legacy"),
      validateEventAt,
      validateRuleVersionRef
    });
  }

  const exportsObject = { createTemporalMetadataContract, TemporalMetadataError, validateEventAt, validateRuleVersionRef };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
