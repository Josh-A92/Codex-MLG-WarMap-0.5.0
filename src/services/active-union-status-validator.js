(function initializeActiveUnionStatusValidator(globalScope) {
  const CANONICAL_FIELDS = [
    "statusId",
    "unionId",
    "serverId",
    "seasonId",
    "activityState",
    "reviewState",
    "derivedFrom",
    "firstConfirmedPresenceAt",
    "mostRecentConfirmedPresenceAt",
    "zeroTerritorySince",
    "verificationWindowStartedAt",
    "verificationThrough",
    "verificationSnapshotIds",
    "effectiveFrom",
    "effectiveTo",
    "supersededBy"
  ];

  const ACTIVITY_STATES = new Set(["active", "inactive"]);
  const REVIEW_STATES = new Set(["confirmed", "superseded"]);
  const DERIVED_FROM_VALUES = new Set([
    "known_relation_without_confirmed_ownership",
    "confirmed_ownership",
    "verified_zero_territory_period"
  ]);
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
    }

    if (Date.parse(normalized) !== parsedTime) {
      return null;
    }

    return parsedTime;
  }

  function validateRequiredFieldPresence(record, basePath, errors) {
    for (let index = 0; index < CANONICAL_FIELDS.length; index += 1) {
      const fieldName = CANONICAL_FIELDS[index];
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
      const fieldName = unknownFields[index];
      pushError(errors, "UNKNOWN_FIELD", composePath(basePath, fieldName), `Unknown field '${fieldName}'.`);
    }
  }

  function validateRequiredId(errors, value, path, label) {
    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "INVALID_STRING", path, `${label} must be a non-empty string.`);
      return false;
    }

    return true;
  }

  function validateNullableId(errors, value, path, label) {
    if (value === null) {
      return true;
    }

    return validateRequiredId(errors, value, path, label);
  }

  function validateEnum(errors, value, path, label, allowedValues) {
    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "INVALID_STRING", path, `${label} must be a non-empty string.`);
      return false;
    }

    if (!allowedValues.has(value)) {
      pushError(errors, "INVALID_ENUM", path, `${label} has an unsupported value.`);
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

  function validateSnapshotIds(errors, value, path) {
    if (!Array.isArray(value)) {
      pushError(errors, "INVALID_LIFECYCLE", path, `${path} must be an array of unique non-empty snapshot IDs.`);
      return { valid: false, count: 0 };
    }

    const seen = new Set();
    let valid = true;

    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      const entryPath = `${path}[${index}]`;

      if (!isNonEmptyTrimmedString(entry)) {
        pushError(errors, "INVALID_STRING", entryPath, `${entryPath} must be a non-empty string.`);
        valid = false;
        continue;
      }

      if (seen.has(entry)) {
        pushError(errors, "INVALID_LIFECYCLE", entryPath, `${path} must not contain duplicate snapshot IDs.`);
        valid = false;
        continue;
      }

      seen.add(entry);
    }

    return { valid, count: value.length };
  }

  function tupleKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  function validateActiveUnionStatusInternal(record, basePath, errors) {
    if (!isRecordObject(record)) {
      pushError(errors, "INVALID_OBJECT", basePath || "record", `${basePath || "record"} must be an object with a plain or null prototype.`);
      return null;
    }

    validateRequiredFieldPresence(record, basePath, errors);
    validateUnknownFields(record, basePath, errors);

    const statusIdPath = composePath(basePath, "statusId");
    const unionIdPath = composePath(basePath, "unionId");
    const serverIdPath = composePath(basePath, "serverId");
    const seasonIdPath = composePath(basePath, "seasonId");
    const activityStatePath = composePath(basePath, "activityState");
    const reviewStatePath = composePath(basePath, "reviewState");
    const derivedFromPath = composePath(basePath, "derivedFrom");
    const firstPresencePath = composePath(basePath, "firstConfirmedPresenceAt");
    const mostRecentPresencePath = composePath(basePath, "mostRecentConfirmedPresenceAt");
    const zeroTerritorySincePath = composePath(basePath, "zeroTerritorySince");
    const windowStartPath = composePath(basePath, "verificationWindowStartedAt");
    const verificationThroughPath = composePath(basePath, "verificationThrough");
    const snapshotIdsPath = composePath(basePath, "verificationSnapshotIds");
    const effectiveFromPath = composePath(basePath, "effectiveFrom");
    const effectiveToPath = composePath(basePath, "effectiveTo");
    const supersededByPath = composePath(basePath, "supersededBy");

    const statusIdValid = validateRequiredId(errors, record.statusId, statusIdPath, statusIdPath);
    const unionIdValid = validateRequiredId(errors, record.unionId, unionIdPath, unionIdPath);
    const serverIdValid = validateRequiredId(errors, record.serverId, serverIdPath, serverIdPath);
    const seasonIdValid = validateRequiredId(errors, record.seasonId, seasonIdPath, seasonIdPath);

    const activityStateValid = validateEnum(errors, record.activityState, activityStatePath, activityStatePath, ACTIVITY_STATES);
    const reviewStateValid = validateEnum(errors, record.reviewState, reviewStatePath, reviewStatePath, REVIEW_STATES);
    const derivedFromValid = validateEnum(errors, record.derivedFrom, derivedFromPath, derivedFromPath, DERIVED_FROM_VALUES);

    const firstPresence = validateNullableTimestamp(errors, record.firstConfirmedPresenceAt, firstPresencePath, firstPresencePath);
    const mostRecentPresence = validateNullableTimestamp(errors, record.mostRecentConfirmedPresenceAt, mostRecentPresencePath, mostRecentPresencePath);
    const zeroTerritorySince = validateNullableTimestamp(errors, record.zeroTerritorySince, zeroTerritorySincePath, zeroTerritorySincePath);
    const windowStartedAt = validateNullableTimestamp(errors, record.verificationWindowStartedAt, windowStartPath, windowStartPath);
    const verificationThrough = validateNullableTimestamp(errors, record.verificationThrough, verificationThroughPath, verificationThroughPath);
    const effectiveFrom = validateRequiredTimestamp(errors, record.effectiveFrom, effectiveFromPath, effectiveFromPath);
    const effectiveTo = validateNullableTimestamp(errors, record.effectiveTo, effectiveToPath, effectiveToPath);

    const supersededByValid = validateNullableId(errors, record.supersededBy, supersededByPath, supersededByPath);
    const snapshotIds = validateSnapshotIds(errors, record.verificationSnapshotIds, snapshotIdsPath);

    const bothPresenceNull = record.firstConfirmedPresenceAt === null && record.mostRecentConfirmedPresenceAt === null;
    const bothPresenceNonNull = record.firstConfirmedPresenceAt !== null && record.mostRecentConfirmedPresenceAt !== null;

    if (!bothPresenceNull && !bothPresenceNonNull) {
      pushError(errors, "INVALID_LIFECYCLE", mostRecentPresencePath, `${firstPresencePath} and ${mostRecentPresencePath} must both be null or both be non-null.`);
    }

    if (bothPresenceNonNull && firstPresence.parsedTime !== null && mostRecentPresence.parsedTime !== null && firstPresence.parsedTime > mostRecentPresence.parsedTime) {
      pushError(errors, "INVALID_LIFECYCLE", mostRecentPresencePath, `${firstPresencePath} cannot be later than ${mostRecentPresencePath}.`);
    }

    if (record.zeroTerritorySince !== null
      && record.mostRecentConfirmedPresenceAt !== null
      && zeroTerritorySince.parsedTime !== null
      && mostRecentPresence.parsedTime !== null
      && mostRecentPresence.parsedTime > zeroTerritorySince.parsedTime) {
      pushError(errors, "INVALID_LIFECYCLE", zeroTerritorySincePath, `${mostRecentPresencePath} cannot be later than ${zeroTerritorySincePath}.`);
    }

    if (record.zeroTerritorySince !== null
      && record.verificationWindowStartedAt !== null
      && zeroTerritorySince.parsedTime !== null
      && windowStartedAt.parsedTime !== null
      && zeroTerritorySince.parsedTime > windowStartedAt.parsedTime) {
      pushError(errors, "INVALID_LIFECYCLE", windowStartPath, `${windowStartPath} cannot precede ${zeroTerritorySincePath}.`);
    }

    if (record.verificationWindowStartedAt !== null
      && record.verificationThrough !== null
      && windowStartedAt.parsedTime !== null
      && verificationThrough.parsedTime !== null
      && windowStartedAt.parsedTime > verificationThrough.parsedTime) {
      pushError(errors, "INVALID_LIFECYCLE", verificationThroughPath, `${verificationThroughPath} cannot precede ${windowStartPath}.`);
    }

    if (record.effectiveTo !== null && effectiveFrom !== null && effectiveTo.parsedTime !== null && effectiveFrom > effectiveTo.parsedTime) {
      pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} cannot precede ${effectiveFromPath}.`);
    }

    if (reviewStateValid) {
      if (record.reviewState === "confirmed") {
        if (record.effectiveTo !== null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} must be null for confirmed records.`);
        }

        if (record.supersededBy !== null) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for confirmed records.`);
        }
      }

      if (record.reviewState === "superseded") {
        if (record.effectiveTo === null) {
          pushError(errors, "INVALID_LIFECYCLE", effectiveToPath, `${effectiveToPath} is required for superseded records.`);
        }

        if (!isNonEmptyTrimmedString(record.supersededBy)) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} is required for superseded records.`);
        }
      }
    }

    if (derivedFromValid && activityStateValid) {
      if (record.derivedFrom === "known_relation_without_confirmed_ownership") {
        if (record.activityState !== "inactive") {
          pushError(errors, "INVALID_LIFECYCLE", activityStatePath, `${activityStatePath} must be inactive when ${derivedFromPath} is known_relation_without_confirmed_ownership.`);
        }

        if (!bothPresenceNull) {
          pushError(errors, "INVALID_LIFECYCLE", mostRecentPresencePath, `${firstPresencePath} and ${mostRecentPresencePath} must be null for known_relation_without_confirmed_ownership.`);
        }

        if (record.zeroTerritorySince !== null) {
          pushError(errors, "INVALID_LIFECYCLE", zeroTerritorySincePath, `${zeroTerritorySincePath} must be null for known_relation_without_confirmed_ownership.`);
        }

        if (record.verificationWindowStartedAt !== null) {
          pushError(errors, "INVALID_LIFECYCLE", windowStartPath, `${windowStartPath} must be null for known_relation_without_confirmed_ownership.`);
        }

        if (record.verificationThrough !== null) {
          pushError(errors, "INVALID_LIFECYCLE", verificationThroughPath, `${verificationThroughPath} must be null for known_relation_without_confirmed_ownership.`);
        }

        if (snapshotIds.valid && snapshotIds.count !== 0) {
          pushError(errors, "INVALID_LIFECYCLE", snapshotIdsPath, `${snapshotIdsPath} must be empty for known_relation_without_confirmed_ownership.`);
        }
      }

      if (record.derivedFrom === "confirmed_ownership") {
        if (record.activityState !== "active") {
          pushError(errors, "INVALID_LIFECYCLE", activityStatePath, `${activityStatePath} must be active when ${derivedFromPath} is confirmed_ownership.`);
        }

        if (!bothPresenceNonNull) {
          pushError(errors, "INVALID_LIFECYCLE", mostRecentPresencePath, `${firstPresencePath} and ${mostRecentPresencePath} must be non-null for confirmed_ownership.`);
        }

        if (record.zeroTerritorySince !== null) {
          pushError(errors, "INVALID_LIFECYCLE", zeroTerritorySincePath, `${zeroTerritorySincePath} must be null for confirmed_ownership.`);
        }

        if (record.verificationWindowStartedAt !== null) {
          pushError(errors, "INVALID_LIFECYCLE", windowStartPath, `${windowStartPath} must be null for confirmed_ownership.`);
        }

        if (record.verificationThrough === null) {
          pushError(errors, "INVALID_LIFECYCLE", verificationThroughPath, `${verificationThroughPath} is required for confirmed_ownership.`);
        }

        if (snapshotIds.valid && snapshotIds.count < 1) {
          pushError(errors, "INVALID_LIFECYCLE", snapshotIdsPath, `${snapshotIdsPath} must contain at least one snapshot ID for confirmed_ownership.`);
        }
      }

      if (record.derivedFrom === "verified_zero_territory_period") {
        if (!bothPresenceNonNull) {
          pushError(errors, "INVALID_LIFECYCLE", mostRecentPresencePath, `${firstPresencePath} and ${mostRecentPresencePath} must be non-null for verified_zero_territory_period.`);
        }

        if (record.zeroTerritorySince === null) {
          pushError(errors, "INVALID_LIFECYCLE", zeroTerritorySincePath, `${zeroTerritorySincePath} is required for verified_zero_territory_period.`);
        }

        if (record.verificationWindowStartedAt === null) {
          pushError(errors, "INVALID_LIFECYCLE", windowStartPath, `${windowStartPath} is required for verified_zero_territory_period.`);
        }

        if (record.verificationThrough === null) {
          pushError(errors, "INVALID_LIFECYCLE", verificationThroughPath, `${verificationThroughPath} is required for verified_zero_territory_period.`);
        }

        if (record.activityState === "active") {
          if (snapshotIds.valid && snapshotIds.count < 1) {
            pushError(errors, "INVALID_LIFECYCLE", snapshotIdsPath, `${snapshotIdsPath} must contain at least one snapshot ID for active verified_zero_territory_period.`);
          }
        }

        if (record.activityState === "inactive") {
          if (snapshotIds.valid && snapshotIds.count < 5) {
            pushError(errors, "INVALID_LIFECYCLE", snapshotIdsPath, `${snapshotIdsPath} must contain at least five snapshot IDs for inactive verified_zero_territory_period.`);
          }
        }
      }
    }

    return {
      statusId: statusIdValid ? record.statusId : null,
      unionId: unionIdValid ? record.unionId : null,
      serverId: serverIdValid ? record.serverId : null,
      seasonId: seasonIdValid ? record.seasonId : null,
      reviewState: reviewStateValid ? record.reviewState : null,
      supersededBy: supersededByValid && record.supersededBy !== null ? record.supersededBy : null,
      effectiveFromTime: effectiveFrom,
      effectiveToTime: effectiveTo.hasValue ? effectiveTo.parsedTime : null,
      hasGroupIdentity: unionIdValid && serverIdValid && seasonIdValid,
      hasValidStatusId: statusIdValid,
      isCurrentCandidate: reviewStateValid
        && record.reviewState === "confirmed"
        && record.effectiveTo === null
        && record.supersededBy === null
        && effectiveFrom !== null,
      contributesEffectivePeriod: reviewStateValid
        && effectiveFrom !== null
        && (
          (record.reviewState === "confirmed" && record.effectiveTo === null)
          || (record.reviewState === "superseded" && record.effectiveTo !== null && effectiveTo.parsedTime !== null)
        )
    };
  }

  function validateActiveUnionStatus(record) {
    const errors = [];
    validateActiveUnionStatusInternal(record, "", errors);
    return createResult(errors);
  }

  function validateActiveUnionStatusHistory(records) {
    const errors = [];

    if (!Array.isArray(records)) {
      pushError(errors, "INVALID_OBJECT", "records", "records must be an array.");
      return createResult(errors);
    }

    const validatedRecords = [];
    for (let index = 0; index < records.length; index += 1) {
      validatedRecords.push(validateActiveUnionStatusInternal(records[index], `records[${index}]`, errors));
    }

    const statusIndexById = new Map();
    for (let index = 0; index < validatedRecords.length; index += 1) {
      const validatedRecord = validatedRecords[index];
      if (!validatedRecord || !validatedRecord.hasValidStatusId) {
        continue;
      }

      if (statusIndexById.has(validatedRecord.statusId)) {
        pushError(
          errors,
          "DUPLICATE_STATUS_ID",
          `records[${index}].statusId`,
          `statusId '${validatedRecord.statusId}' must be unique in the history.`
        );
      } else {
        statusIndexById.set(validatedRecord.statusId, index);
      }
    }

    const groups = new Map();
    for (let index = 0; index < validatedRecords.length; index += 1) {
      const validatedRecord = validatedRecords[index];
      if (!validatedRecord || !validatedRecord.hasGroupIdentity) {
        continue;
      }

      const key = tupleKey(validatedRecord.seasonId, validatedRecord.serverId, validatedRecord.unionId);
      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(index);
    }

    groups.forEach((recordIndices) => {
      const recordsByStatusId = new Map();
      const currentCandidates = [];
      const periods = [];

      for (let index = 0; index < recordIndices.length; index += 1) {
        const recordIndex = recordIndices[index];
        const validatedRecord = validatedRecords[recordIndex];

        if (!validatedRecord) {
          continue;
        }

        if (validatedRecord.hasValidStatusId) {
          recordsByStatusId.set(validatedRecord.statusId, recordIndex);
        }

        if (validatedRecord.isCurrentCandidate) {
          currentCandidates.push(recordIndex);
        }

        if (validatedRecord.contributesEffectivePeriod) {
          periods.push({
            recordIndex,
            startTime: validatedRecord.effectiveFromTime,
            endTime: validatedRecord.reviewState === "confirmed" ? Number.POSITIVE_INFINITY : validatedRecord.effectiveToTime
          });
        }
      }

      if (currentCandidates.length === 0) {
        const anchorIndex = recordIndices[0];
        pushError(
          errors,
          "MISSING_CURRENT_STATUS",
          `records[${anchorIndex}].reviewState`,
          "Each union/server/season group must contain exactly one current confirmed record."
        );
      }

      for (let index = 1; index < currentCandidates.length; index += 1) {
        const recordIndex = currentCandidates[index];
        pushError(
          errors,
          "MULTIPLE_CURRENT_STATUSES",
          `records[${recordIndex}].reviewState`,
          "Each union/server/season group must contain exactly one current confirmed record."
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
          const left = periods[outer];
          const right = periods[inner];

          if (left.startTime < right.endTime && right.startTime < left.endTime) {
            pushError(
              errors,
              "OVERLAPPING_EFFECTIVE_PERIOD",
              `records[${right.recordIndex}].effectiveFrom`,
              "Effective periods must not overlap within the same union/server/season group."
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

        if (!validatedRecord.hasValidStatusId) {
          continue;
        }

        const sourceStatusId = validatedRecord.statusId;
        const targetIndex = recordsByStatusId.get(validatedRecord.supersededBy);

        if (targetIndex === undefined) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "supersededBy must reference another existing record in the same union/server/season group."
          );
          continue;
        }

        if (validatedRecord.supersededBy === sourceStatusId) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "A superseded record cannot reference itself."
          );
          continue;
        }

        const targetRecord = validatedRecords[targetIndex];

        if (!targetRecord || (targetRecord.reviewState !== "confirmed" && targetRecord.reviewState !== "superseded")) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "supersededBy must reference a confirmed or superseded target record."
          );
          continue;
        }

        if (validatedRecord.effectiveToTime === null || targetRecord.effectiveFromTime === null || validatedRecord.effectiveToTime !== targetRecord.effectiveFromTime) {
          pushError(
            errors,
            "INVALID_SUPERSESSION_REFERENCE",
            `records[${recordIndex}].supersededBy`,
            "supersession boundary requires source.effectiveTo to equal target.effectiveFrom by parsed timestamp instant."
          );
          continue;
        }

        supersessionEdges.set(sourceStatusId, targetRecord.statusId);
      }

      const assignmentToIndex = new Map();
      for (let index = 0; index < recordIndices.length; index += 1) {
        const recordIndex = recordIndices[index];
        const validatedRecord = validatedRecords[recordIndex];
        if (validatedRecord && validatedRecord.hasValidStatusId) {
          assignmentToIndex.set(validatedRecord.statusId, recordIndex);
        }
      }

      const cycleReported = new Set();
      const globallyVisited = new Set();
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
              const cycleStatusId = traversal[cycleIndex];
              if (cycleReported.has(cycleStatusId)) {
                continue;
              }

              cycleReported.add(cycleStatusId);
              pushError(
                errors,
                "SUPERSESSION_CYCLE",
                `records[${assignmentToIndex.get(cycleStatusId)}].supersededBy`,
                "Supersession chains must not contain cycles."
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
    validateActiveUnionStatus,
    validateActiveUnionStatusHistory
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
