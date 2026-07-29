(function initializeOwnershipRecordValidator(globalScope) {
  const TERRITORY_FIELDS = [
    "ownershipRecordId",
    "serverId",
    "seasonId",
    "territoryRef",
    "ownerUnionId",
    "ownershipState",
    "reviewState",
    "effectiveAt",
    "sourceType",
    "evidenceIds",
    "actorId",
    "reviewerId",
    "reviewedAt",
    "supersededBy"
  ];

  const STRUCTURE_FIELDS = [
    "structureOwnershipId",
    "serverId",
    "seasonId",
    "structureId",
    "ownerUnionId",
    "ownershipState",
    "reviewState",
    "effectiveAt",
    "sourceType",
    "evidenceIds",
    "actorId",
    "reviewerId",
    "reviewedAt",
    "supersededBy"
  ];

  const OWNERSHIP_STATES = new Set(["owned", "unclaimed", "unknown"]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const SOURCE_TYPES = new Set([
    "manual_entry",
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
  ]);
  const NON_MANUAL_SOURCE_TYPES = new Set([
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
  ]);
  const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;

  const TERRITORY_DESCRIPTOR = {
    fields: TERRITORY_FIELDS,
    idField: "ownershipRecordId",
    kind: "territory"
  };

  const STRUCTURE_DESCRIPTOR = {
    fields: STRUCTURE_FIELDS,
    idField: "structureOwnershipId",
    kind: "structure"
  };

  function createResult(errors) {
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  function pushError(errors, code, path, message) {
    errors.push({ code, path, message });
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

    const match = ISO_UTC_TIMESTAMP_PATTERN.exec(value);
    if (!match) {
      return null;
    }

    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    const normalized = new Date(parsed).toISOString();
    const fraction = match[1] || null;

    if (fraction === null) {
      if (value !== normalized.replace(".000Z", "Z")) {
        return null;
      }
    } else {
      if (!value.startsWith(`${normalized.slice(0, 19)}.`)) {
        return null;
      }

      if (normalized.slice(20, 23).slice(0, fraction.length) !== fraction) {
        return null;
      }
    }

    return parsed;
  }

  function validateRequiredFields(record, fields, basePath, errors) {
    for (let index = 0; index < fields.length; index += 1) {
      const fieldName = fields[index];
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

  function validateUnknownFields(record, fields, basePath, errors) {
    const allowedFields = new Set(fields);
    const fieldNames = Object.keys(record).sort();

    for (let index = 0; index < fieldNames.length; index += 1) {
      const fieldName = fieldNames[index];
      if (!allowedFields.has(fieldName)) {
        pushError(
          errors,
          "UNKNOWN_FIELD",
          composePath(basePath, fieldName),
          `${composePath(basePath, fieldName)} is not allowed.`
        );
      }
    }
  }

  function validateRequiredId(value, path, errors) {
    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "INVALID_STRING", path, `${path} must be a non-empty, non-whitespace string.`);
      return false;
    }

    return true;
  }

  function validateNullableId(value, path, errors) {
    if (value === null) {
      return true;
    }

    return validateRequiredId(value, path, errors);
  }

  function validateEnum(value, allowedValues, path, errors) {
    if (!allowedValues.has(value)) {
      pushError(errors, "INVALID_ENUM", path, `${path} contains an unsupported value.`);
      return false;
    }

    return true;
  }

  function validateRequiredTimestamp(value, path, errors) {
    const parsed = parseUtcTimestamp(value);
    if (parsed === null) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${path} must be a real UTC ISO-8601 timestamp ending in Z.`);
    }
    return parsed;
  }

  function validateNullableTimestamp(value, path, errors) {
    if (value === null) {
      return null;
    }
    return validateRequiredTimestamp(value, path, errors);
  }

  function validateEvidenceIds(value, path, sourceType, sourceTypeValid, errors) {
    if (!Array.isArray(value)) {
      pushError(errors, "INVALID_ARRAY", path, `${path} must be an array.`);
      return;
    }

    const seenIds = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const itemPath = `${path}[${index}]`;
      if (!validateRequiredId(value[index], itemPath, errors)) {
        continue;
      }

      if (seenIds.has(value[index])) {
        pushError(errors, "DUPLICATE_ID", itemPath, `${itemPath} must be unique within ${path}.`);
      } else {
        seenIds.add(value[index]);
      }
    }

    if (sourceTypeValid && NON_MANUAL_SOURCE_TYPES.has(sourceType) && value.length === 0) {
      pushError(errors, "MISSING_EVIDENCE", path, `${path} requires at least one evidence ID for non-manual sources.`);
    }
  }

  function validateTerritoryRef(value, path, errors) {
    if (!isRecordObject(value)) {
      pushError(errors, "INVALID_OBJECT", path, `${path} must be an object with a plain or null prototype.`);
      return null;
    }

    const fields = ["type", "row", "col"];
    validateRequiredFields(value, fields, path, errors);
    validateUnknownFields(value, fields, path, errors);

    let valid = true;
    if (value.type !== "normal_map_cell") {
      pushError(errors, "INVALID_ENUM", `${path}.type`, `${path}.type must be normal_map_cell.`);
      valid = false;
    }

    if (!Number.isInteger(value.row) || value.row < 1) {
      pushError(errors, "INVALID_INTEGER", `${path}.row`, `${path}.row must be a positive integer.`);
      valid = false;
    }

    if (!Number.isInteger(value.col) || value.col < 1) {
      pushError(errors, "INVALID_INTEGER", `${path}.col`, `${path}.col must be a positive integer.`);
      valid = false;
    }

    return valid ? JSON.stringify(["normal_map_cell", value.row, value.col]) : null;
  }

  function validateOwner(record, basePath, ownershipStateValid, errors) {
    const ownerPath = composePath(basePath, "ownerUnionId");

    if (!ownershipStateValid) {
      if (record.ownerUnionId !== null) {
        validateRequiredId(record.ownerUnionId, ownerPath, errors);
      }
      return;
    }

    if (record.ownershipState === "owned") {
      if (!isNonEmptyTrimmedString(record.ownerUnionId)) {
        pushError(errors, "INVALID_LIFECYCLE", ownerPath, `${ownerPath} is required when ownershipState is owned.`);
      }
      return;
    }

    if (record.ownerUnionId !== null) {
      pushError(
        errors,
        "INVALID_LIFECYCLE",
        ownerPath,
        `${ownerPath} must be null when ownershipState is ${record.ownershipState}.`
      );
    }
  }

  function validateLifecycle(record, basePath, reviewStateValid, errors) {
    const reviewerPath = composePath(basePath, "reviewerId");
    const reviewedAtPath = composePath(basePath, "reviewedAt");
    const supersededByPath = composePath(basePath, "supersededBy");

    validateNullableId(record.reviewerId, reviewerPath, errors);
    validateNullableId(record.supersededBy, supersededByPath, errors);

    if (!reviewStateValid) {
      return;
    }

    if (record.reviewState === "proposed") {
      if (record.reviewerId !== null) {
        pushError(errors, "INVALID_LIFECYCLE", reviewerPath, `${reviewerPath} must be null for proposed records.`);
      }
      if (record.reviewedAt !== null) {
        pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} must be null for proposed records.`);
      }
      if (record.supersededBy !== null) {
        pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for proposed records.`);
      }
      return;
    }

    if (!isNonEmptyTrimmedString(record.reviewerId)) {
      pushError(errors, "INVALID_LIFECYCLE", reviewerPath, `${reviewerPath} is required for ${record.reviewState} records.`);
    }

    if (parseUtcTimestamp(record.reviewedAt) === null) {
      pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} is required for ${record.reviewState} records.`);
    }

    if (record.reviewState === "superseded") {
      if (!isNonEmptyTrimmedString(record.supersededBy)) {
        pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} is required for superseded records.`);
      }
    } else if (record.supersededBy !== null) {
      pushError(errors, "INVALID_LIFECYCLE", supersededByPath, `${supersededByPath} must be null for ${record.reviewState} records.`);
    }
  }

  function validateRecordInternal(record, basePath, errors, descriptor) {
    const startingErrorCount = errors.length;
    const recordPath = basePath || "record";

    if (!isRecordObject(record)) {
      pushError(errors, "INVALID_OBJECT", recordPath, `${recordPath} must be an object with a plain or null prototype.`);
      return {
        isRecordValid: false,
        hasValidRecordId: false,
        recordId: null
      };
    }

    validateRequiredFields(record, descriptor.fields, basePath, errors);
    validateUnknownFields(record, descriptor.fields, basePath, errors);

    const idPath = composePath(basePath, descriptor.idField);
    const serverIdPath = composePath(basePath, "serverId");
    const seasonIdPath = composePath(basePath, "seasonId");
    const ownershipStatePath = composePath(basePath, "ownershipState");
    const reviewStatePath = composePath(basePath, "reviewState");
    const sourceTypePath = composePath(basePath, "sourceType");
    const effectiveAtPath = composePath(basePath, "effectiveAt");
    const reviewedAtPath = composePath(basePath, "reviewedAt");

    const recordIdValid = validateRequiredId(record[descriptor.idField], idPath, errors);
    const serverIdValid = validateRequiredId(record.serverId, serverIdPath, errors);
    const seasonIdValid = validateRequiredId(record.seasonId, seasonIdPath, errors);
    validateRequiredId(record.actorId, composePath(basePath, "actorId"), errors);

    const ownershipStateValid = validateEnum(record.ownershipState, OWNERSHIP_STATES, ownershipStatePath, errors);
    const reviewStateValid = validateEnum(record.reviewState, REVIEW_STATES, reviewStatePath, errors);
    const sourceTypeValid = validateEnum(record.sourceType, SOURCE_TYPES, sourceTypePath, errors);

    validateOwner(record, basePath, ownershipStateValid, errors);
    validateEvidenceIds(record.evidenceIds, composePath(basePath, "evidenceIds"), record.sourceType, sourceTypeValid, errors);

    let targetKey = null;
    if (descriptor.kind === "territory") {
      targetKey = validateTerritoryRef(record.territoryRef, composePath(basePath, "territoryRef"), errors);
    } else if (validateRequiredId(record.structureId, composePath(basePath, "structureId"), errors)) {
      targetKey = JSON.stringify(["logical_structure", record.structureId]);
    }

    const effectiveAt = validateRequiredTimestamp(record.effectiveAt, effectiveAtPath, errors);
    const reviewedAt = validateNullableTimestamp(record.reviewedAt, reviewedAtPath, errors);
    if (effectiveAt !== null && reviewedAt !== null && reviewedAt < effectiveAt) {
      pushError(errors, "INVALID_LIFECYCLE", reviewedAtPath, `${reviewedAtPath} must not be earlier than ${effectiveAtPath}.`);
    }

    validateLifecycle(record, basePath, reviewStateValid, errors);

    const isRecordValid = errors.length === startingErrorCount;
    const hasGroupIdentity = serverIdValid && seasonIdValid && targetKey !== null;

    return {
      isRecordValid,
      hasValidRecordId: recordIdValid,
      recordId: recordIdValid ? record[descriptor.idField] : null,
      serverId: serverIdValid ? record.serverId : null,
      seasonId: seasonIdValid ? record.seasonId : null,
      targetKey,
      hasGroupIdentity,
      reviewState: reviewStateValid ? record.reviewState : null,
      effectiveAt,
      reviewedAt,
      supersededBy: isNonEmptyTrimmedString(record.supersededBy) ? record.supersededBy : null,
      isCurrentCandidate: isRecordValid && record.reviewState === "confirmed" && record.supersededBy === null,
      canParticipateInHistory: isRecordValid && hasGroupIdentity
    };
  }

  function addCycleErrors(edges, errors) {
    const visited = new Set();
    const nodeIndexes = Object.keys(edges).map(Number).sort((left, right) => left - right);
    const errorPaths = new Set();

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
            if (!errorPaths.has(path)) {
              pushError(errors, "SUPERSESSION_CYCLE", path, `${path} participates in a supersession cycle.`);
              errorPaths.add(path);
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

  function validateRecord(record, descriptor) {
    const errors = [];
    validateRecordInternal(record, "", errors, descriptor);
    return createResult(errors);
  }

  function validateHistory(records, descriptor) {
    const errors = [];
    if (!Array.isArray(records)) {
      pushError(errors, "INVALID_ARRAY", "records", "records must be an array.");
      return createResult(errors);
    }

    const metadata = new Array(records.length);
    const idToIndexes = new Map();

    for (let index = 0; index < records.length; index += 1) {
      const meta = validateRecordInternal(records[index], `records[${index}]`, errors, descriptor);
      metadata[index] = meta;

      if (meta.hasValidRecordId) {
        if (!idToIndexes.has(meta.recordId)) {
          idToIndexes.set(meta.recordId, []);
        }
        idToIndexes.get(meta.recordId).push(index);
      }
    }

    const recordIds = Array.from(idToIndexes.keys()).sort();
    const uniqueIdToIndex = new Map();
    for (let idIndex = 0; idIndex < recordIds.length; idIndex += 1) {
      const recordId = recordIds[idIndex];
      const indexes = idToIndexes.get(recordId);

      if (indexes.length === 1) {
        uniqueIdToIndex.set(recordId, indexes[0]);
      } else {
        for (let duplicateIndex = 1; duplicateIndex < indexes.length; duplicateIndex += 1) {
          const recordIndex = indexes[duplicateIndex];
          pushError(
            errors,
            "DUPLICATE_RECORD_ID",
            `records[${recordIndex}].${descriptor.idField}`,
            `${descriptor.idField} '${recordId}' must be unique across history.`
          );
        }
      }
    }

    const currentByGroup = new Map();
    for (let index = 0; index < metadata.length; index += 1) {
      const meta = metadata[index];
      if (!meta.isCurrentCandidate || !meta.hasGroupIdentity) {
        continue;
      }

      const groupKey = JSON.stringify([meta.serverId, meta.seasonId, meta.targetKey]);
      if (currentByGroup.has(groupKey)) {
        pushError(
          errors,
          "MULTIPLE_CURRENT_OWNERSHIP_RECORDS",
          `records[${index}].reviewState`,
          `records[${index}] conflicts with another current confirmed ownership record for the same target.`
        );
      } else {
        currentByGroup.set(groupKey, index);
      }
    }

    const supersessionEdges = {};
    for (let index = 0; index < metadata.length; index += 1) {
      const meta = metadata[index];
      if (!meta.canParticipateInHistory || meta.reviewState !== "superseded" || meta.supersededBy === null) {
        continue;
      }

      const path = `records[${index}].supersededBy`;
      const replacementIndex = uniqueIdToIndex.get(meta.supersededBy);
      if (replacementIndex === undefined) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          path,
          `${path} must reference another unique record ID in this history.`
        );
        continue;
      }

      if (replacementIndex === index) {
        pushError(errors, "INVALID_SUPERSESSION_REFERENCE", path, `${path} must not reference the same record.`);
        continue;
      }

      const replacement = metadata[replacementIndex];
      if (!replacement.isRecordValid || !replacement.canParticipateInHistory) {
        pushError(errors, "INVALID_SUPERSESSION_REFERENCE", path, `${path} must reference an individually valid record.`);
        continue;
      }

      const sameGroup = meta.serverId === replacement.serverId
        && meta.seasonId === replacement.seasonId
        && meta.targetKey === replacement.targetKey;
      if (!sameGroup) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          path,
          `${path} must reference a record for the same server, season, and canonical target.`
        );
        continue;
      }

      if (replacement.reviewState !== "confirmed" && replacement.reviewState !== "superseded") {
        pushError(
          errors,
          "INVALID_SUPERSESSION_REFERENCE",
          path,
          `${path} must reference a confirmed or superseded replacement record.`
        );
        continue;
      }

      if (replacement.effectiveAt < meta.effectiveAt) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_ORDER",
          path,
          `${path} references a replacement whose effectiveAt is earlier than the superseded record.`
        );
        continue;
      }

      if (replacement.reviewedAt < meta.reviewedAt) {
        pushError(
          errors,
          "INVALID_SUPERSESSION_ORDER",
          path,
          `${path} references a replacement whose reviewedAt is earlier than the superseded record.`
        );
        continue;
      }

      supersessionEdges[index] = replacementIndex;
    }

    addCycleErrors(supersessionEdges, errors);
    return createResult(errors);
  }

  function validateTerritoryOwnershipRecord(record) {
    return validateRecord(record, TERRITORY_DESCRIPTOR);
  }

  function validateTerritoryOwnershipHistory(records) {
    return validateHistory(records, TERRITORY_DESCRIPTOR);
  }

  function validateStructureOwnershipRecord(record) {
    return validateRecord(record, STRUCTURE_DESCRIPTOR);
  }

  function validateStructureOwnershipHistory(records) {
    return validateHistory(records, STRUCTURE_DESCRIPTOR);
  }

  const api = {
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.validateTerritoryOwnershipRecord = validateTerritoryOwnershipRecord;
    globalScope.validateTerritoryOwnershipHistory = validateTerritoryOwnershipHistory;
    globalScope.validateStructureOwnershipRecord = validateStructureOwnershipRecord;
    globalScope.validateStructureOwnershipHistory = validateStructureOwnershipHistory;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
