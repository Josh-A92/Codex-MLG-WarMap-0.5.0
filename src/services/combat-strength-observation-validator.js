(function initializeCombatStrengthObservationValidator(globalScope) {
  const FIELDS = [
    "observationId", "unionId", "serverId", "seasonId", "value", "unit",
    "displayFormat", "observedAt", "sourceType", "evidenceId", "extractionMethod",
    "rawExtractedValue", "normalizedValue", "confidence", "reviewState", "actorId",
    "reviewerId", "reviewedAt", "supersededBy"
  ];
  const SOURCE_TYPES = new Set([
    "manual_entry", "screenshot_extraction", "imported_data", "api_integration",
    "bot_integration"
  ]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function createResult(errors) {
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  function add(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function nonEmpty(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function finiteNonNegative(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  function parseTimestamp(value) {
    if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
      return null;
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const components = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    const date = new Date(parsed);
    if (!components
        || date.getUTCFullYear() !== Number(components[1])
        || date.getUTCMonth() + 1 !== Number(components[2])
        || date.getUTCDate() !== Number(components[3])
        || date.getUTCHours() !== Number(components[4])
        || date.getUTCMinutes() !== Number(components[5])
        || date.getUTCSeconds() !== Number(components[6])) {
      return null;
    }
    return parsed;
  }

  function validateTimestamp(errors, value, path, nullable) {
    if (nullable && value === null) {
      return null;
    }
    const parsed = parseTimestamp(value);
    if (parsed === null) {
      add(errors, "INVALID_TIMESTAMP", path, `${path} must be a real UTC timestamp ending in Z.`);
    }
    return parsed;
  }

  function validateNullableString(errors, value, path) {
    if (value !== null && !nonEmpty(value)) {
      add(errors, "INVALID_STRING", path, `${path} must be null or a non-empty string.`);
    }
  }

  function validateRecordInternal(record, basePath, errors) {
    const start = errors.length;
    if (!isRecord(record)) {
      add(errors, "INVALID_OBJECT", basePath, `${basePath || "record"} must be a plain object.`);
      return { valid: false, record: null, observedAt: null, reviewedAt: null };
    }
    const prefix = basePath ? `${basePath}.` : "";
    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        add(errors, "MISSING_REQUIRED_FIELD", `${prefix}${field}`, `${prefix}${field} is required.`);
      }
    });
    Object.keys(record).sort().forEach((field) => {
      if (!FIELDS.includes(field)) {
        add(errors, "UNKNOWN_FIELD", `${prefix}${field}`, `Unknown field '${field}'.`);
      }
    });

    ["observationId", "unionId", "serverId", "seasonId", "unit", "displayFormat", "actorId"]
      .forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(record, field) && !nonEmpty(record[field])) {
          add(errors, "INVALID_STRING", `${prefix}${field}`, `${prefix}${field} must be non-empty.`);
        }
      });

    if (Object.prototype.hasOwnProperty.call(record, "value") && !finiteNonNegative(record.value)) {
      add(errors, "INVALID_VALUE", `${prefix}value`, `${prefix}value must be a finite non-negative number.`);
    }
    if (Object.prototype.hasOwnProperty.call(record, "sourceType")
        && !SOURCE_TYPES.has(record.sourceType)) {
      add(errors, "INVALID_ENUM", `${prefix}sourceType`, `${prefix}sourceType is invalid.`);
    }
    if (Object.prototype.hasOwnProperty.call(record, "reviewState")
        && !REVIEW_STATES.has(record.reviewState)) {
      add(errors, "INVALID_ENUM", `${prefix}reviewState`, `${prefix}reviewState is invalid.`);
    }

    const observedAt = Object.prototype.hasOwnProperty.call(record, "observedAt")
      ? validateTimestamp(errors, record.observedAt, `${prefix}observedAt`, false)
      : null;
    const reviewedAt = Object.prototype.hasOwnProperty.call(record, "reviewedAt")
      ? validateTimestamp(errors, record.reviewedAt, `${prefix}reviewedAt`, true)
      : null;
    if (observedAt !== null && reviewedAt !== null && reviewedAt < observedAt) {
      add(errors, "INVALID_TIMESTAMP_ORDER", `${prefix}reviewedAt`, "reviewedAt cannot precede observedAt.");
    }

    ["evidenceId", "extractionMethod", "reviewerId", "supersededBy"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        validateNullableString(errors, record[field], `${prefix}${field}`);
      }
    });
    if (Object.prototype.hasOwnProperty.call(record, "rawExtractedValue")
        && record.rawExtractedValue !== null
        && typeof record.rawExtractedValue !== "string") {
      add(
        errors,
        "INVALID_RAW_VALUE",
        `${prefix}rawExtractedValue`,
        "rawExtractedValue must be null or a string."
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, "normalizedValue")
        && record.normalizedValue !== null
        && !finiteNonNegative(record.normalizedValue)) {
      add(
        errors,
        "INVALID_NORMALIZED_VALUE",
        `${prefix}normalizedValue`,
        "normalizedValue must be null or a finite non-negative number."
      );
    } else if (record.normalizedValue !== null
        && finiteNonNegative(record.normalizedValue)
        && finiteNonNegative(record.value)
        && record.normalizedValue !== record.value) {
      add(
        errors,
        "NORMALIZED_VALUE_MISMATCH",
        `${prefix}normalizedValue`,
        "normalizedValue must equal value."
      );
    }

    const isManual = record.sourceType === "manual_entry";
    if (Object.prototype.hasOwnProperty.call(record, "confidence")) {
      if (isManual) {
        if (record.confidence !== null) {
          add(errors, "INVALID_CONFIDENCE", `${prefix}confidence`, "Manual confidence must be null.");
        }
      } else if (typeof record.confidence !== "number"
          || !Number.isFinite(record.confidence)
          || record.confidence < 0
          || record.confidence > 1) {
        add(errors, "INVALID_CONFIDENCE", `${prefix}confidence`, "Assisted confidence must be from 0 through 1.");
      }
    }
    if (isManual) {
      if (record.extractionMethod !== null) {
        add(errors, "INVALID_EXTRACTION_METHOD", `${prefix}extractionMethod`, "Manual extractionMethod must be null.");
      }
    } else {
      if (!nonEmpty(record.evidenceId)) {
        add(errors, "EVIDENCE_REQUIRED", `${prefix}evidenceId`, "Non-manual evidenceId is required.");
      }
      if (!nonEmpty(record.extractionMethod)) {
        add(
          errors,
          "EXTRACTION_METHOD_REQUIRED",
          `${prefix}extractionMethod`,
          "Non-manual extractionMethod is required."
        );
      }
    }

    if (REVIEW_STATES.has(record.reviewState)) {
      if (record.reviewState === "proposed") {
        if (record.reviewerId !== null || record.reviewedAt !== null || record.supersededBy !== null) {
          add(errors, "INVALID_LIFECYCLE", `${prefix}reviewState`, "Proposed review fields must be null.");
        }
      } else {
        if (!nonEmpty(record.reviewerId) || reviewedAt === null) {
          add(errors, "INVALID_LIFECYCLE", `${prefix}reviewState`, "Reviewed records require reviewerId and reviewedAt.");
        }
        if (record.reviewState === "superseded") {
          if (!nonEmpty(record.supersededBy)) {
            add(errors, "INVALID_LIFECYCLE", `${prefix}supersededBy`, "Superseded record requires supersededBy.");
          }
        } else if (record.supersededBy !== null) {
          add(errors, "INVALID_LIFECYCLE", `${prefix}supersededBy`, "Only superseded records use supersededBy.");
        }
      }
    }

    return {
      valid: errors.length === start,
      record,
      observedAt,
      reviewedAt
    };
  }

  function validateCombatStrengthObservation(record) {
    const errors = [];
    validateRecordInternal(record, "", errors);
    return createResult(errors);
  }

  function tuple(record) {
    return JSON.stringify([record.seasonId, record.serverId, record.unionId]);
  }

  function validateCombatStrengthObservationHistory(records) {
    const errors = [];
    if (!Array.isArray(records)) {
      add(errors, "INVALID_ARRAY", "records", "records must be an array.");
      return createResult(errors);
    }
    const metadata = records.map((record, index) => (
      validateRecordInternal(record, `records[${index}]`, errors)
    ));
    const idIndexes = new Map();
    metadata.forEach((entry, index) => {
      if (entry.record && nonEmpty(entry.record.observationId)) {
        if (idIndexes.has(entry.record.observationId)) {
          add(
            errors,
            "DUPLICATE_OBSERVATION_ID",
            `records[${index}].observationId`,
            `Duplicate observationId '${entry.record.observationId}'.`
          );
        } else {
          idIndexes.set(entry.record.observationId, index);
        }
      }
    });

    const currentTimes = new Map();
    metadata.forEach((entry, index) => {
      if (!entry.valid || entry.record.reviewState !== "confirmed") {
        return;
      }
      const key = JSON.stringify([tuple(entry.record), entry.observedAt]);
      if (currentTimes.has(key)) {
        add(
          errors,
          "DUPLICATE_CONFIRMED_OBSERVED_AT",
          `records[${index}].observedAt`,
          "Only one confirmed observation may exist at the same factual instant."
        );
      } else {
        currentTimes.set(key, index);
      }
    });

    const edges = new Map();
    metadata.forEach((entry, index) => {
      if (!entry.valid || entry.record.reviewState !== "superseded") {
        return;
      }
      const replacementIndex = idIndexes.get(entry.record.supersededBy);
      const replacement = replacementIndex === undefined ? null : metadata[replacementIndex];
      if (!replacement || !replacement.valid) {
        add(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          `records[${index}].supersededBy`,
          "supersededBy must reference a valid replacement."
        );
        return;
      }
      if (replacement.record.observationId === entry.record.observationId
          || tuple(replacement.record) !== tuple(entry.record)
          || replacement.observedAt !== entry.observedAt
          || (replacement.record.reviewState !== "confirmed"
            && replacement.record.reviewState !== "superseded")) {
        add(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          `records[${index}].supersededBy`,
          "Replacement must match scope and observedAt and be confirmed or superseded."
        );
        return;
      }
      if (replacement.reviewedAt < entry.reviewedAt) {
        add(
          errors,
          "INVALID_REVIEW_ORDER",
          `records[${replacementIndex}].reviewedAt`,
          "Replacement reviewedAt cannot precede superseded reviewedAt."
        );
      }
      edges.set(entry.record.observationId, replacement.record.observationId);
    });

    edges.forEach((_target, start) => {
      const visited = new Set();
      let current = start;
      while (edges.has(current)) {
        if (visited.has(current)) {
          const index = idIndexes.get(start);
          add(
            errors,
            "SUPERSESSION_CYCLE",
            `records[${index}].supersededBy`,
            "Supersession chains must be cycle-free."
          );
          break;
        }
        visited.add(current);
        current = edges.get(current);
      }
    });
    return createResult(errors);
  }

  const exportsObject = {
    validateCombatStrengthObservation,
    validateCombatStrengthObservationHistory
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
