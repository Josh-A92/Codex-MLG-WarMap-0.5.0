(function initializeNativeUnionAssignmentValidator(globalScope) {
  const temporalExports = globalScope.validateEventAt
    ? globalScope
    : { validateEventAt(value) { if (value === null || typeof value !== "object" || !["exact", "bounded", "unknown"].includes(value.precision)) throw new Error("eventAt is invalid."); return value; }, validateRuleVersionRef(value) { if (value === null || typeof value !== "object" || ["seasonId", "packageVersion", "rulesVersion"].some((field) => typeof value[field] !== "string" || value[field].trim() === "")) throw new Error("ruleVersionRef is invalid."); return value; } };
  const CANONICAL_FIELDS = [
    "assignmentId",
    "unionId",
    "serverId",
    "seasonId",
    "nativeState",
    "reviewState",
    "sourceType",
    "rawExtractedValue",
    "normalizedValue",
    "confidence",
    "evidenceId",
    "observedAt",
    "effectiveFrom",
    "effectiveTo",
    "reviewer",
    "reviewedAt",
    "supersededBy", "eventAt", "recordedAt", "recordedAtLegacyUnknown", "ruleVersionRef"
  ];

  const NATIVE_STATES = new Set(["native", "not_native", "unknown"]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const SOURCE_TYPES = new Set(["manual_entry", "screenshot_extraction", "imported_data", "api_integration", "bot_integration"]);
  const NON_MANUAL_SOURCE_TYPES = new Set(["screenshot_extraction", "imported_data", "api_integration", "bot_integration"]);
  const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;

  function createResult(errors) {
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  function pushError(errors, code, path, message) {
    errors.push({
      code,
      path,
      message
    });
  }

  function composePath(basePath, fieldName) {
    return basePath ? `${basePath}.${fieldName}` : fieldName;
  }

  function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function parseUtcTimestamp(value) {
    if (typeof value !== "string") {
      return null;
    }

    const timestampMatch = ISO_UTC_TIMESTAMP_PATTERN.exec(value);
    if (!timestampMatch) {
      return null;
    }

    const parsedTime = Date.parse(value);
    if (!Number.isFinite(parsedTime)) {
      return null;
    }

    const normalized = new Date(parsedTime).toISOString();
    const fractionalDigits = timestampMatch[1] || null;
    if (fractionalDigits === null) {
      if (value !== normalized.replace(".000Z", "Z")) {
        return null;
      }
    } else {
      const normalizedFraction = normalized.slice(20, 23);
      if (normalizedFraction.slice(0, fractionalDigits.length) !== fractionalDigits) {
        return null;
      }
      if (!value.startsWith(normalized.slice(0, 19) + ".")) {
        return null;
      }
      if (!value.endsWith("Z")) {
        return null;
      }
    }

    if (Date.parse(normalized) !== parsedTime) {
      return null;
    }

    return parsedTime;
  }

  function validateRequiredFieldPresence(record, basePath, errors) {
    for (let index = 0; index < CANONICAL_FIELDS.length; index += 1) {
      const fieldName = CANONICAL_FIELDS[index];
      if (["eventAt", "recordedAt", "recordedAtLegacyUnknown", "ruleVersionRef"].includes(fieldName)) continue;
      if (!Object.prototype.hasOwnProperty.call(record, fieldName)) {
        pushError(
          errors,
          "MISSING_REQUIRED_FIELD",
          composePath(basePath, fieldName),
          `${composePath(basePath, fieldName)} is required.`
        );
      }
    }
  }

  function validateUnknownFields(record, basePath, errors) {
    const knownFields = new Set(CANONICAL_FIELDS);
    const unknownFields = Object.keys(record).filter((fieldName) => !knownFields.has(fieldName)).sort();

    for (let index = 0; index < unknownFields.length; index += 1) {
      const unknownField = unknownFields[index];
      pushError(
        errors,
        "UNKNOWN_FIELD",
        composePath(basePath, unknownField),
        `Unknown field '${unknownField}'.`
      );
    }
  }

  function validateEnum(errors, value, path, label, allowedValuesSet) {
    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "INVALID_STRING", path, `${label} must be a non-empty string.`);
      return false;
    }

    if (!allowedValuesSet.has(value)) {
      pushError(errors, "INVALID_ENUM", path, `${label} has an unsupported value.`);
      return false;
    }

    return true;
  }

  function validateRequiredId(errors, value, path, label) {
    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "INVALID_STRING", path, `${label} must be a non-empty string.`);
      return false;
    }

    return true;
  }

  function validateNullableNonEmptyString(errors, value, path, label) {
    if (value === null) {
      return true;
    }

    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "INVALID_STRING", path, `${label} must be null or a non-empty string.`);
      return false;
    }

    return true;
  }

  function validateNullableString(errors, value, path, label) {
    if (value === null) {
      return true;
    }

    if (typeof value !== "string") {
      pushError(errors, "INVALID_STRING", path, `${label} must be null or a string.`);
      return false;
    }

    return true;
  }

  function validateRequiredTimestamp(errors, value, path, label) {
    const parsedTime = parseUtcTimestamp(value);

    if (parsedTime === null) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${label} must be a real UTC ISO-8601 timestamp ending in Z.`);
      return null;
    }

    return parsedTime;
  }

  function validateNullableTimestamp(errors, value, path, label) {
    if (value === null) {
      return { hasValue: false, parsedTime: null };
    }

    const parsedTime = parseUtcTimestamp(value);
    if (parsedTime === null) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${label} must be null or a real UTC ISO-8601 timestamp ending in Z.`);
      return { hasValue: true, parsedTime: null };
    }

    return { hasValue: true, parsedTime };
  }

  function tupleKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  function validateNativeUnionAssignmentInternal(record, basePath, errors) {
    if (!isRecordObject(record)) {
      pushError(errors, "INVALID_OBJECT", basePath || "record", `${basePath || "record"} must be an object with a plain or null prototype.`);
      return null;
    }

    validateRequiredFieldPresence(record, basePath, errors);
    validateUnknownFields(record, basePath, errors);

    const assignmentPath = composePath(basePath, "assignmentId");
    const unionPath = composePath(basePath, "unionId");
    const serverPath = composePath(basePath, "serverId");
    const seasonPath = composePath(basePath, "seasonId");
    const nativePath = composePath(basePath, "nativeState");
    const reviewPath = composePath(basePath, "reviewState");
    const sourcePath = composePath(basePath, "sourceType");
    const rawPath = composePath(basePath, "rawExtractedValue");
    const normalizedPath = composePath(basePath, "normalizedValue");
    const confidencePath = composePath(basePath, "confidence");
    const evidencePath = composePath(basePath, "evidenceId");
    const observedPath = composePath(basePath, "observedAt");
    const effectiveFromPath = composePath(basePath, "effectiveFrom");
    const effectiveToPath = composePath(basePath, "effectiveTo");
    const reviewerPath = composePath(basePath, "reviewer");
    const reviewedAtPath = composePath(basePath, "reviewedAt");
    const supersededByPath = composePath(basePath, "supersededBy");

    const assignmentIdValid = validateRequiredId(errors, record.assignmentId, assignmentPath, assignmentPath);
    const unionIdValid = validateRequiredId(errors, record.unionId, unionPath, unionPath);
    const serverIdValid = validateRequiredId(errors, record.serverId, serverPath, serverPath);
    const seasonIdValid = validateRequiredId(errors, record.seasonId, seasonPath, seasonPath);

    validateEnum(errors, record.nativeState, nativePath, nativePath, NATIVE_STATES);
    const reviewStateValid = validateEnum(errors, record.reviewState, reviewPath, reviewPath, REVIEW_STATES);
    const sourceTypeValid = validateEnum(errors, record.sourceType, sourcePath, sourcePath, SOURCE_TYPES);

    validateNullableString(errors, record.rawExtractedValue, rawPath, rawPath);

    let normalizedValueValid = true;
    if (record.normalizedValue !== null) {
      normalizedValueValid = validateRequiredId(errors, record.normalizedValue, normalizedPath, normalizedPath);
    }

    if (record.normalizedValue !== null && normalizedValueValid && unionIdValid && record.normalizedValue !== record.unionId) {
      pushError(errors, "INVALID_LIFECYCLE", normalizedPath, `${normalizedPath} must equal unionId when present.`);
    }

    if (record.confidence !== null) {
      if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) {
        pushError(errors, "INVALID_NUMBER", confidencePath, `${confidencePath} must be null or a number in the range [0, 1].`);
      }
    }

    const evidenceIdValid = validateNullableNonEmptyString(errors, record.evidenceId, evidencePath, evidencePath);
    const reviewerValid = validateNullableNonEmptyString(errors, record.reviewer, reviewerPath, reviewerPath);
    const supersededByValid = validateNullableNonEmptyString(errors, record.supersededBy, supersededByPath, supersededByPath);

    const observedAt = validateRequiredTimestamp(errors, record.observedAt, observedPath, observedPath);
    const effectiveFrom = validateNullableTimestamp(errors, record.effectiveFrom, effectiveFromPath, effectiveFromPath);
    const effectiveTo = validateNullableTimestamp(errors, record.effectiveTo, effectiveToPath, effectiveToPath);
    const reviewedAt = validateNullableTimestamp(errors, record.reviewedAt, reviewedAtPath, reviewedAtPath);
    if (Object.prototype.hasOwnProperty.call(record, "eventAt")) {
      try { temporalExports.validateEventAt(record.eventAt); } catch (error) { pushError(errors, "INVALID_EVENT_TIME", composePath(basePath, "eventAt"), error.message); }
      if (record.eventAt && record.eventAt.precision === "exact" && record.effectiveFrom !== null && record.effectiveFrom !== record.eventAt.at) {
        pushError(errors, "INVALID_COMPATIBILITY_TIME", effectiveFromPath, "effectiveFrom must match exact eventAt.at.");
      }
      if (record.eventAt && record.eventAt.precision !== "exact" && record.effectiveFrom !== null) {
        pushError(errors, "INVALID_UNCERTAIN_EFFECTIVE_TIME", effectiveFromPath, "Bounded or unknown eventAt requires effectiveFrom to be null.");
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, "recordedAt") && record.recordedAt !== null && validateRequiredTimestamp(errors, record.recordedAt, composePath(basePath, "recordedAt"), composePath(basePath, "recordedAt")) === null) {
      // validation error already recorded
    }
    if (Object.prototype.hasOwnProperty.call(record, "recordedAtLegacyUnknown") && typeof record.recordedAtLegacyUnknown !== "boolean") {
      pushError(errors, "INVALID_BOOLEAN", composePath(basePath, "recordedAtLegacyUnknown"), "recordedAtLegacyUnknown must be boolean.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "ruleVersionRef") && record.ruleVersionRef !== null) {
      try { temporalExports.validateRuleVersionRef(record.ruleVersionRef); } catch (error) { pushError(errors, "INVALID_RULE_VERSION", composePath(basePath, "ruleVersionRef"), error.message); }
    }

    if (sourceTypeValid) {
      if (record.sourceType === "manual_entry") {
        if (record.confidence !== null) {
          pushError(errors, "INVALID_LIFECYCLE", confidencePath, `${confidencePath} must be null when sourceType is manual_entry.`);
        }
      } else if (record.confidence === null || typeof record.confidence !== "number" || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) {
        pushError(errors, "INVALID_NUMBER", confidencePath, `${confidencePath} must be a number in the range [0, 1] for non-manual sources.`);
      }

      if (NON_MANUAL_SOURCE_TYPES.has(record.sourceType) && record.evidenceId === null) {
        pushError(errors, "INVALID_LIFECYCLE", evidencePath, `${evidencePath} is required for non-manual sources.`);
      }
    }

    if (reviewStateValid) {
      if (record.reviewState === "proposed") {
        if (record.effectiveFrom !== null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveFromPath, `${effectiveFromPath} must be null for proposed records.`);
        }
        if (record.effectiveTo !== null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} must be null for proposed records.`);
        }
        if (record.reviewer !== null) {
          pushError(errors, "INVALID_LIFECYCLE", reviewerPath, `${reviewerPath} must be null for proposed records.`);
        }
        if (record.reviewedAt !== null) {
          pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} must be null for proposed records.`);
        }
        if (record.supersededBy !== null) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for proposed records.`);
        }
        if (record.sourceType === "manual_entry") {
          pushError(errors, "INVALID_LIFECYCLE", sourcePath, `${sourcePath} must not be manual_entry for proposed records.`);
        }
      }

      if (record.reviewState === "rejected") {
        if (record.effectiveFrom !== null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveFromPath, `${effectiveFromPath} must be null for rejected records.`);
        }
        if (record.effectiveTo !== null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} must be null for rejected records.`);
        }
        if (!isNonEmptyTrimmedString(record.reviewer)) {
          pushError(errors, "INVALID_LIFECYCLE", reviewerPath, `${reviewerPath} is required for rejected records.`);
        }
        if (record.reviewedAt === null) {
          pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} is required for rejected records.`);
        }
        if (record.supersededBy !== null) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for rejected records.`);
        }
      }

      if (record.reviewState === "confirmed") {
        if (record.effectiveFrom === null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveFromPath, `${effectiveFromPath} is required for confirmed records.`);
        }
        if (record.effectiveTo !== null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} must be null for confirmed records.`);
        }
        if (!isNonEmptyTrimmedString(record.reviewer)) {
          pushError(errors, "INVALID_LIFECYCLE", reviewerPath, `${reviewerPath} is required for confirmed records.`);
        }
        if (record.reviewedAt === null) {
          pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} is required for confirmed records.`);
        }
        if (record.supersededBy !== null) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for confirmed records.`);
        }
      }

      if (record.reviewState === "superseded") {
        if (record.effectiveFrom === null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveFromPath, `${effectiveFromPath} is required for superseded records.`);
        }
        if (record.effectiveTo === null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} is required for superseded records.`);
        }
        if (!isNonEmptyTrimmedString(record.reviewer)) {
          pushError(errors, "INVALID_LIFECYCLE", reviewerPath, `${reviewerPath} is required for superseded records.`);
        }
        if (record.reviewedAt === null) {
          pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} is required for superseded records.`);
        }
        if (!isNonEmptyTrimmedString(record.supersededBy)) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} is required for superseded records.`);
        }
      }
    }

    if (reviewedAt.hasValue && reviewedAt.parsedTime !== null && observedAt !== null && reviewedAt.parsedTime < observedAt) {
      pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} cannot precede observedAt.`);
    }

    if (effectiveFrom.hasValue && effectiveTo.hasValue && effectiveFrom.parsedTime !== null && effectiveTo.parsedTime !== null && effectiveTo.parsedTime < effectiveFrom.parsedTime) {
      pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} cannot precede effectiveFrom.`);
    }

    return {
      assignmentId: assignmentIdValid ? record.assignmentId : null,
      unionId: unionIdValid ? record.unionId : null,
      serverId: serverIdValid ? record.serverId : null,
      seasonId: seasonIdValid ? record.seasonId : null,
      reviewState: reviewStateValid ? record.reviewState : null,
      supersededBy: supersededByValid && record.supersededBy !== null ? record.supersededBy : null,
      effectiveFromValue: effectiveFrom.hasValue && effectiveFrom.parsedTime !== null ? record.effectiveFrom : null,
      effectiveToValue: effectiveTo.hasValue && effectiveTo.parsedTime !== null ? record.effectiveTo : null,
      effectiveFromTime: effectiveFrom.hasValue ? effectiveFrom.parsedTime : null,
      effectiveToTime: effectiveTo.hasValue ? effectiveTo.parsedTime : null,
      hasGroupIdentity: unionIdValid && serverIdValid && seasonIdValid,
      hasValidAssignmentId: assignmentIdValid,
      isCurrentConfirmed: reviewStateValid
        && record.reviewState === "confirmed"
        && effectiveFrom.hasValue
        && effectiveFrom.parsedTime !== null
        && record.effectiveTo === null,
      contributesEffectivePeriod: reviewStateValid
        && (record.reviewState === "confirmed" || record.reviewState === "superseded")
        && effectiveFrom.hasValue
        && effectiveFrom.parsedTime !== null
        && (
          (record.reviewState === "confirmed" && record.effectiveTo === null)
          || (record.reviewState === "superseded" && effectiveTo.hasValue && effectiveTo.parsedTime !== null)
        )
    };
  }

  function validateNativeUnionAssignment(record) {
    const errors = [];
    validateNativeUnionAssignmentInternal(record, "", errors);
    return createResult(errors);
  }

  function validateNativeUnionAssignmentHistory(records) {
    const errors = [];

    if (!Array.isArray(records)) {
      pushError(errors, "INVALID_OBJECT", "records", "records must be an array.");
      return createResult(errors);
    }

    const validatedRecords = [];

    for (let index = 0; index < records.length; index += 1) {
      validatedRecords.push(validateNativeUnionAssignmentInternal(records[index], `records[${index}]`, errors));
    }

    const assignmentIndexById = new Map();
    for (let index = 0; index < validatedRecords.length; index += 1) {
      const validatedRecord = validatedRecords[index];
      if (!validatedRecord || !validatedRecord.hasValidAssignmentId) {
        continue;
      }

      if (assignmentIndexById.has(validatedRecord.assignmentId)) {
        pushError(
          errors,
          "DUPLICATE_ASSIGNMENT_ID",
          `records[${index}].assignmentId`,
          `assignmentId '${validatedRecord.assignmentId}' must be unique in the history.`
        );
      } else {
        assignmentIndexById.set(validatedRecord.assignmentId, index);
      }
    }

    const groups = new Map();
    for (let index = 0; index < validatedRecords.length; index += 1) {
      const validatedRecord = validatedRecords[index];
      if (!validatedRecord || !validatedRecord.hasGroupIdentity) {
        continue;
      }

      const groupKey = tupleKey(validatedRecord.seasonId, validatedRecord.serverId, validatedRecord.unionId);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }

      groups.get(groupKey).push(index);
    }

    groups.forEach((recordIndices) => {
      const currentAssignments = [];
      const periods = [];
      const recordsByAssignmentId = new Map();

      for (let index = 0; index < recordIndices.length; index += 1) {
        const recordIndex = recordIndices[index];
        const validatedRecord = validatedRecords[recordIndex];

        if (!validatedRecord) {
          continue;
        }

        if (validatedRecord.hasValidAssignmentId) {
          recordsByAssignmentId.set(validatedRecord.assignmentId, recordIndex);
        }

        if (validatedRecord.isCurrentConfirmed) {
          currentAssignments.push(recordIndex);
        }

        if (validatedRecord.contributesEffectivePeriod) {
          periods.push({
            recordIndex,
            startTime: validatedRecord.effectiveFromTime,
            endTime: validatedRecord.reviewState === "confirmed" ? Number.POSITIVE_INFINITY : validatedRecord.effectiveToTime
          });
        }
      }

      for (let index = 1; index < currentAssignments.length; index += 1) {
        const conflictingIndex = currentAssignments[index];
        pushError(
          errors,
          "MULTIPLE_CURRENT_ASSIGNMENTS",
          `records[${conflictingIndex}].reviewState`,
          "Only one current confirmed assignment is allowed per union/server/season relationship."
        );
      }

      periods.sort((left, right) => {
        if (left.startTime !== right.startTime) {
          return left.startTime - right.startTime;
        }

        if (left.endTime !== right.endTime) {
          return left.endTime - right.endTime;
        }

        return left.recordIndex - right.recordIndex;
      });

      for (let outer = 0; outer < periods.length; outer += 1) {
        for (let inner = outer + 1; inner < periods.length; inner += 1) {
          const first = periods[outer];
          const second = periods[inner];

          if (first.startTime < second.endTime && second.startTime < first.endTime) {
            pushError(
              errors,
              "OVERLAPPING_EFFECTIVE_PERIOD",
              `records[${second.recordIndex}].effectiveFrom`,
              "Effective periods must not overlap for the same union/server/season relationship."
            );
          }
        }
      }

      const supersessionEdges = new Map();
      for (let index = 0; index < recordIndices.length; index += 1) {
        const recordIndex = recordIndices[index];
        const validatedRecord = validatedRecords[recordIndex];

        if (!validatedRecord || validatedRecord.reviewState !== "superseded" || validatedRecord.supersededBy === null) {
          continue;
        }

        const replacementIndex = recordsByAssignmentId.get(validatedRecord.supersededBy);
        if (replacementIndex === undefined) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "supersededBy must reference an existing confirmed or superseded record in the same relationship group."
          );
          continue;
        }

        const replacementRecord = validatedRecords[replacementIndex];
        if (!replacementRecord || (replacementRecord.reviewState !== "confirmed" && replacementRecord.reviewState !== "superseded")) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "supersededBy must reference a confirmed or superseded replacement record."
          );
          continue;
        }

        if (validatedRecord.effectiveToTime === null || replacementRecord.effectiveFromTime === null || validatedRecord.effectiveToTime !== replacementRecord.effectiveFromTime) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "Replacement effectiveFrom must exactly match the superseded record effectiveTo boundary."
          );
          continue;
        }

        supersessionEdges.set(validatedRecord.assignmentId, replacementRecord.assignmentId);
      }

      const cycleReported = new Set();
      const globallyVisited = new Set();
      const assignmentToIndex = new Map();

      for (let index = 0; index < recordIndices.length; index += 1) {
        const recordIndex = recordIndices[index];
        const validatedRecord = validatedRecords[recordIndex];

        if (validatedRecord && validatedRecord.hasValidAssignmentId) {
          assignmentToIndex.set(validatedRecord.assignmentId, recordIndex);
        }
      }

      const edgeStarts = Array.from(supersessionEdges.keys()).sort((left, right) => assignmentToIndex.get(left) - assignmentToIndex.get(right));

      for (let index = 0; index < edgeStarts.length; index += 1) {
        const startId = edgeStarts[index];
        if (globallyVisited.has(startId)) {
          continue;
        }

        const stackPositions = new Map();
        const traversal = [];
        let currentId = startId;

        while (supersessionEdges.has(currentId)) {
          if (stackPositions.has(currentId)) {
            const cycleStart = stackPositions.get(currentId);

            for (let cycleIndex = cycleStart; cycleIndex < traversal.length; cycleIndex += 1) {
              const cycleAssignmentId = traversal[cycleIndex];
              if (cycleReported.has(cycleAssignmentId)) {
                continue;
              }

              cycleReported.add(cycleAssignmentId);
              pushError(
                errors,
                "SUPERSESSION_CYCLE",
                `records[${assignmentToIndex.get(cycleAssignmentId)}].supersededBy`,
                "Supersession references must not form cycles."
              );
            }

            break;
          }

          if (globallyVisited.has(currentId)) {
            break;
          }

          stackPositions.set(currentId, traversal.length);
          traversal.push(currentId);
          currentId = supersessionEdges.get(currentId);
        }

        for (let visitedIndex = 0; visitedIndex < traversal.length; visitedIndex += 1) {
          globallyVisited.add(traversal[visitedIndex]);
        }
      }
    });

    return createResult(errors);
  }

  const exportsObject = {
    validateNativeUnionAssignment,
    validateNativeUnionAssignmentHistory
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
