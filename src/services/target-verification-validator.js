(function initializeTargetVerificationValidator(globalScope) {
  const temporalExports = globalScope.validateEventAt
    ? globalScope
    : {
      validateEventAt(value) {
        if (value === null || typeof value !== "object" || Array.isArray(value) || !["exact", "bounded", "unknown"].includes(value.precision)) throw new Error("eventAt is invalid.");
        const timestamp = (candidate) => {
          if (typeof candidate !== "string" || parseUtcTimestamp(candidate) === null) throw new Error("eventAt timestamp is invalid.");
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
  const CANONICAL_FIELDS = [
    "verificationId",
    "serverId",
    "seasonId",
    "targetRef",
    "verifiedOwnershipRef",
    "observedAt",
    "confirmedAt",
    "sourceType",
    "evidenceIds",
    "actorId",
    "reviewerId",
    "reviewState",
    "supersededBy", "eventAt", "recordedAt", "recordedAtLegacyUnknown", "ruleVersionRef"
  ];

  const SOURCE_TYPES = new Set([
    "manual_entry",
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
  ]);

  const REVIEW_STATES = new Set(["confirmed", "superseded"]);
  const NON_MANUAL_SOURCE_TYPES = new Set([
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
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

  function validateUnknownFields(record, allowedFieldsSet, basePath, errors) {
    const unknownFields = Object.keys(record)
      .filter((fieldName) => !allowedFieldsSet.has(fieldName))
      .sort();

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

  function validateEvidenceIds(value, path, sourceType, sourceTypeValid, errors) {
    if (!Array.isArray(value)) {
      pushError(errors, "INVALID_LIFECYCLE", path, `${path} must be an array of unique non-empty evidence IDs.`);
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
        pushError(errors, "INVALID_LIFECYCLE", entryPath, `${path} must not contain duplicate IDs.`);
        valid = false;
        continue;
      }

      seen.add(entry);
    }

    if (sourceTypeValid && NON_MANUAL_SOURCE_TYPES.has(sourceType) && value.length < 1) {
      pushError(errors, "INVALID_LIFECYCLE", path, `${path} must contain at least one evidence ID for non-manual sources.`);
      valid = false;
    }

    return { valid, count: value.length };
  }

  function validateTargetRef(targetRef, path, errors) {
    if (!isRecordObject(targetRef)) {
      pushError(errors, "INVALID_OBJECT", path, `${path} must be an object with a plain or null prototype.`);
      return {
        hasValidType: false,
        type: null,
        canonicalKey: null
      };
    }

    const allAllowed = new Set(["type", "row", "col", "structureId"]);
    validateUnknownFields(targetRef, allAllowed, path, errors);

    const typePath = composePath(path, "type");
    const typeValid = validateEnum(errors, targetRef.type, typePath, typePath, new Set(["normal_map_cell", "logical_structure"]));

    if (!typeValid) {
      return {
        hasValidType: false,
        type: null,
        canonicalKey: null
      };
    }

    if (targetRef.type === "normal_map_cell") {
      const requiredFields = new Set(["type", "row", "col"]);
      if (!Object.prototype.hasOwnProperty.call(targetRef, "row")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "row"), `${composePath(path, "row")} is required.`);
      }
      if (!Object.prototype.hasOwnProperty.call(targetRef, "col")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "col"), `${composePath(path, "col")} is required.`);
      }
      validateUnknownFields(targetRef, requiredFields, path, errors);

      const rowPath = composePath(path, "row");
      const colPath = composePath(path, "col");
      const rowValid = Number.isInteger(targetRef.row) && Number.isFinite(targetRef.row) && targetRef.row > 0;
      const colValid = Number.isInteger(targetRef.col) && Number.isFinite(targetRef.col) && targetRef.col > 0;

      if (!rowValid) {
        pushError(errors, "INVALID_NUMBER", rowPath, `${rowPath} must be a positive integer.`);
      }
      if (!colValid) {
        pushError(errors, "INVALID_NUMBER", colPath, `${colPath} must be a positive integer.`);
      }

      return {
        hasValidType: true,
        type: "normal_map_cell",
        canonicalKey: rowValid && colValid ? JSON.stringify(["normal_map_cell", targetRef.row, targetRef.col]) : null
      };
    }

    const requiredFields = new Set(["type", "structureId"]);
    if (!Object.prototype.hasOwnProperty.call(targetRef, "structureId")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "structureId"), `${composePath(path, "structureId")} is required.`);
    }
    validateUnknownFields(targetRef, requiredFields, path, errors);

    const structurePath = composePath(path, "structureId");
    const structureValid = validateRequiredId(errors, targetRef.structureId, structurePath, structurePath);

    return {
      hasValidType: true,
      type: "logical_structure",
      canonicalKey: structureValid ? JSON.stringify(["logical_structure", targetRef.structureId]) : null
    };
  }

  function validateVerifiedOwnershipRef(verifiedOwnershipRef, path, errors) {
    if (!isRecordObject(verifiedOwnershipRef)) {
      pushError(errors, "INVALID_OBJECT", path, `${path} must be an object with a plain or null prototype.`);
      return {
        hasValidType: false,
        type: null
      };
    }

    const allowedFields = new Set(["type", "recordId"]);
    validateUnknownFields(verifiedOwnershipRef, allowedFields, path, errors);

    if (!Object.prototype.hasOwnProperty.call(verifiedOwnershipRef, "type")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "type"), `${composePath(path, "type")} is required.`);
    }

    if (!Object.prototype.hasOwnProperty.call(verifiedOwnershipRef, "recordId")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "recordId"), `${composePath(path, "recordId")} is required.`);
    }

    const typePath = composePath(path, "type");
    const recordIdPath = composePath(path, "recordId");

    const typeValid = validateEnum(
      errors,
      verifiedOwnershipRef.type,
      typePath,
      typePath,
      new Set(["territory_ownership_record", "structure_ownership_record"])
    );

    const recordIdValid = validateRequiredId(errors, verifiedOwnershipRef.recordId, recordIdPath, recordIdPath);

    return {
      hasValidType: typeValid,
      hasValidRecordId: recordIdValid,
      type: typeValid ? verifiedOwnershipRef.type : null
    };
  }

  function tupleKey(seasonId, serverId, targetKey) {
    return JSON.stringify([seasonId, serverId, targetKey]);
  }

  function validateTargetVerificationRecordInternal(record, basePath, errors) {
    const recordPath = basePath || "record";
    const startingErrorCount = errors.length;

    if (!isRecordObject(record)) {
      pushError(errors, "INVALID_OBJECT", recordPath, `${recordPath} must be an object with a plain or null prototype.`);
      return {
        isRecordValid: false,
        hasValidVerificationId: false,
        verificationId: null
      };
    }

    validateRequiredFieldPresence(record, basePath, errors);
    validateUnknownFields(record, new Set(CANONICAL_FIELDS), basePath, errors);

    const verificationIdPath = composePath(basePath, "verificationId");
    const serverIdPath = composePath(basePath, "serverId");
    const seasonIdPath = composePath(basePath, "seasonId");
    const targetRefPath = composePath(basePath, "targetRef");
    const ownershipRefPath = composePath(basePath, "verifiedOwnershipRef");
    const observedAtPath = composePath(basePath, "observedAt");
    const confirmedAtPath = composePath(basePath, "confirmedAt");
    const sourceTypePath = composePath(basePath, "sourceType");
    const evidenceIdsPath = composePath(basePath, "evidenceIds");
    const actorIdPath = composePath(basePath, "actorId");
    const reviewerIdPath = composePath(basePath, "reviewerId");
    const reviewStatePath = composePath(basePath, "reviewState");
    const supersededByPath = composePath(basePath, "supersededBy");

    const verificationIdValid = validateRequiredId(errors, record.verificationId, verificationIdPath, verificationIdPath);
    const serverIdValid = validateRequiredId(errors, record.serverId, serverIdPath, serverIdPath);
    const seasonIdValid = validateRequiredId(errors, record.seasonId, seasonIdPath, seasonIdPath);
    validateRequiredId(errors, record.actorId, actorIdPath, actorIdPath);
    validateRequiredId(errors, record.reviewerId, reviewerIdPath, reviewerIdPath);

    const sourceTypeValid = validateEnum(errors, record.sourceType, sourceTypePath, sourceTypePath, SOURCE_TYPES);
    const reviewStateValid = validateEnum(errors, record.reviewState, reviewStatePath, reviewStatePath, REVIEW_STATES);

    const targetRefMeta = validateTargetRef(record.targetRef, targetRefPath, errors);
    const ownershipRefMeta = validateVerifiedOwnershipRef(record.verifiedOwnershipRef, ownershipRefPath, errors);

    if (targetRefMeta.hasValidType && ownershipRefMeta.hasValidType) {
      if (targetRefMeta.type === "normal_map_cell" && ownershipRefMeta.type !== "territory_ownership_record") {
        pushError(
          errors,
          "INVALID_LIFECYCLE",
          ownershipRefPath,
          `${ownershipRefPath}.type must be territory_ownership_record for normal_map_cell targets.`
        );
      }

      if (targetRefMeta.type === "logical_structure" && ownershipRefMeta.type !== "structure_ownership_record") {
        pushError(
          errors,
          "INVALID_LIFECYCLE",
          ownershipRefPath,
          `${ownershipRefPath}.type must be structure_ownership_record for logical_structure targets.`
        );
      }
    }

    const observedAt = validateRequiredTimestamp(errors, record.observedAt, observedAtPath, observedAtPath);
    const confirmedAt = validateRequiredTimestamp(errors, record.confirmedAt, confirmedAtPath, confirmedAtPath);

    if (observedAt !== null && confirmedAt !== null && confirmedAt < observedAt) {
      pushError(errors, "INVALID_LIFECYCLE", confirmedAtPath, `${confirmedAtPath} must not be earlier than ${observedAtPath}.`);
    }
    if (Object.prototype.hasOwnProperty.call(record, "eventAt")) {
      try { temporalExports.validateEventAt(record.eventAt); } catch (error) { pushError(errors, "INVALID_EVENT_TIME", composePath(basePath, "eventAt"), error.message); }
    }
    if (Object.prototype.hasOwnProperty.call(record, "recordedAt") && record.recordedAt !== null
        && validateRequiredTimestamp(errors, record.recordedAt, composePath(basePath, "recordedAt"), composePath(basePath, "recordedAt")) === null) {
      // validateRequiredTimestamp records the precise validation error.
    }
    if (Object.prototype.hasOwnProperty.call(record, "recordedAtLegacyUnknown")
        && typeof record.recordedAtLegacyUnknown !== "boolean") {
      pushError(errors, "INVALID_BOOLEAN", composePath(basePath, "recordedAtLegacyUnknown"), "recordedAtLegacyUnknown must be boolean.");
    }
    if (Object.prototype.hasOwnProperty.call(record, "ruleVersionRef") && record.ruleVersionRef !== null) {
      try { temporalExports.validateRuleVersionRef(record.ruleVersionRef); } catch (error) { pushError(errors, "INVALID_RULE_VERSION", composePath(basePath, "ruleVersionRef"), error.message); }
    }

    const evidenceMeta = validateEvidenceIds(record.evidenceIds, evidenceIdsPath, record.sourceType, sourceTypeValid, errors);

    let supersededByValid = true;
    if (record.supersededBy !== null) {
      supersededByValid = validateRequiredId(errors, record.supersededBy, supersededByPath, supersededByPath);
    }

    if (reviewStateValid) {
      if (record.reviewState === "confirmed") {
        if (record.supersededBy !== null) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for confirmed records.`);
        }
      }

      if (record.reviewState === "superseded") {
        if (!isNonEmptyTrimmedString(record.supersededBy)) {
          pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} is required for superseded records.`);
        }
      }
    }

    const hasGroupIdentity = serverIdValid && seasonIdValid && targetRefMeta.canonicalKey !== null;
    const isRecordValid = errors.length === startingErrorCount;

    return {
      isRecordValid,
      verificationId: verificationIdValid ? record.verificationId : null,
      hasValidVerificationId: verificationIdValid,
      hasGroupIdentity,
      serverId: serverIdValid ? record.serverId : null,
      seasonId: seasonIdValid ? record.seasonId : null,
      targetKey: targetRefMeta.canonicalKey,
      reviewState: reviewStateValid ? record.reviewState : null,
      observedAt,
      supersededBy: supersededByValid && isNonEmptyTrimmedString(record.supersededBy) ? record.supersededBy : null,
      isCurrentConfirmationCandidate: isRecordValid
        && reviewStateValid
        && record.reviewState === "confirmed"
        && record.supersededBy === null
        && observedAt !== null,
      canParticipateInHistory: isRecordValid
        && hasGroupIdentity
        && reviewStateValid
        && (record.reviewState === "confirmed" || record.reviewState === "superseded"),
      evidenceMeta
    };
  }

  function addCycleErrors(edges, recordsMeta, errors, errorsByPath) {
    const visited = new Set();
    const nodeIndexes = Object.keys(edges).map((entry) => Number(entry)).sort((a, b) => a - b);

    for (let index = 0; index < nodeIndexes.length; index += 1) {
      const start = nodeIndexes[index];
      if (visited.has(start)) {
        continue;
      }

      const seenInWalk = new Map();
      const chain = [];
      let current = start;

      while (Object.prototype.hasOwnProperty.call(edges, current)) {
        if (seenInWalk.has(current)) {
          const cycleStart = seenInWalk.get(current);
          for (let cycleIndex = cycleStart; cycleIndex < chain.length; cycleIndex += 1) {
            const recordIndex = chain[cycleIndex];
            const path = `records[${recordIndex}].supersededBy`;
            if (!errorsByPath.has(path)) {
              pushError(errors, "SUPERSESSION_CYCLE", path, `${path} participates in a supersession cycle.`);
              errorsByPath.add(path);
            }
          }
          break;
        }

        if (visited.has(current)) {
          break;
        }

        seenInWalk.set(current, chain.length);
        chain.push(current);
        current = edges[current];
      }

      for (let chainIndex = 0; chainIndex < chain.length; chainIndex += 1) {
        visited.add(chain[chainIndex]);
      }
    }
  }

  function validateTargetVerificationRecord(record) {
    const errors = [];
    validateTargetVerificationRecordInternal(record, "", errors);
    return createResult(errors);
  }

  function validateTargetVerificationHistory(records) {
    const errors = [];

    if (!Array.isArray(records)) {
      pushError(errors, "INVALID_OBJECT", "records", "records must be an array.");
      return createResult(errors);
    }

    const metadata = new Array(records.length);
    const verificationIdToIndexes = new Map();

    for (let index = 0; index < records.length; index += 1) {
      const basePath = `records[${index}]`;
      const recordMeta = validateTargetVerificationRecordInternal(records[index], basePath, errors);
      metadata[index] = recordMeta;

      if (recordMeta.hasValidVerificationId) {
        if (!verificationIdToIndexes.has(recordMeta.verificationId)) {
          verificationIdToIndexes.set(recordMeta.verificationId, []);
        }
        verificationIdToIndexes.get(recordMeta.verificationId).push(index);
      }
    }

    const verificationIds = Array.from(verificationIdToIndexes.keys()).sort();
    for (let idIndex = 0; idIndex < verificationIds.length; idIndex += 1) {
      const verificationId = verificationIds[idIndex];
      const indexes = verificationIdToIndexes.get(verificationId);
      for (let dupIndex = 1; dupIndex < indexes.length; dupIndex += 1) {
        const duplicateRecordIndex = indexes[dupIndex];
        pushError(
          errors,
          "DUPLICATE_VERIFICATION_ID",
          `records[${duplicateRecordIndex}].verificationId`,
          `verificationId '${verificationId}' must be unique across history.`
        );
      }
    }

    const verificationIdToUniqueIndex = new Map();
    for (let idIndex = 0; idIndex < verificationIds.length; idIndex += 1) {
      const verificationId = verificationIds[idIndex];
      const indexes = verificationIdToIndexes.get(verificationId);
      if (indexes.length === 1) {
        verificationIdToUniqueIndex.set(verificationId, indexes[0]);
      }
    }

    const groupedCurrentCandidates = new Map();

    for (let index = 0; index < metadata.length; index += 1) {
      const meta = metadata[index];
      if (!meta.isCurrentConfirmationCandidate || !meta.hasGroupIdentity) {
        continue;
      }

      const groupKey = tupleKey(meta.seasonId, meta.serverId, meta.targetKey);
      if (!groupedCurrentCandidates.has(groupKey)) {
        groupedCurrentCandidates.set(groupKey, []);
      }

      groupedCurrentCandidates.get(groupKey).push({
        index,
        observedAt: meta.observedAt
      });
    }

    const groupKeys = Array.from(groupedCurrentCandidates.keys()).sort();
    for (let groupIndex = 0; groupIndex < groupKeys.length; groupIndex += 1) {
      const groupKey = groupKeys[groupIndex];
      const entries = groupedCurrentCandidates.get(groupKey).sort((left, right) => left.index - right.index);
      const seenObservedTimes = new Map();

      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex];
        const observedAtKey = String(entry.observedAt);

        if (seenObservedTimes.has(observedAtKey)) {
          pushError(
            errors,
            "DUPLICATE_CURRENT_OBSERVED_AT",
            `records[${entry.index}].observedAt`,
            `records[${entry.index}].observedAt conflicts with another non-superseded confirmed record at the same parsed observedAt instant.`
          );
          continue;
        }

        seenObservedTimes.set(observedAtKey, entry.index);
      }
    }

    const supersessionEdges = {};
    const cyclePathSet = new Set();

    for (let index = 0; index < metadata.length; index += 1) {
      const meta = metadata[index];
      if (!meta.isRecordValid || !meta.canParticipateInHistory || meta.reviewState !== "superseded" || meta.supersededBy === null) {
        continue;
      }

      const path = `records[${index}].supersededBy`;
      const resolvedIndex = verificationIdToUniqueIndex.get(meta.supersededBy);

      if (resolvedIndex === undefined) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          path,
          `${path} must reference another unique verificationId in history.`
        );
        continue;
      }

      if (resolvedIndex === index) {
        pushError(errors, "INVALID_SUPERSESSION_REFERENCE", path, `${path} must not reference the same record.`);
        continue;
      }

      const targetMeta = metadata[resolvedIndex];
      if (!targetMeta.isRecordValid || !targetMeta.canParticipateInHistory) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          path,
          `${path} must reference a structurally valid record in the same server, season, and target.`
        );
        continue;
      }

      const sameGroup = meta.serverId === targetMeta.serverId
        && meta.seasonId === targetMeta.seasonId
        && meta.targetKey === targetMeta.targetKey;

      if (!sameGroup) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          path,
          `${path} must reference a record in the same server, season, and canonical target.`
        );
        continue;
      }

      supersessionEdges[index] = resolvedIndex;
    }

    addCycleErrors(supersessionEdges, metadata, errors, cyclePathSet);

    return createResult(errors);
  }

  const api = {
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.validateTargetVerificationRecord = validateTargetVerificationRecord;
    globalScope.validateTargetVerificationHistory = validateTargetVerificationHistory;
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this)));