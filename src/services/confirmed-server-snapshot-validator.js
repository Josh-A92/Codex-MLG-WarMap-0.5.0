(function initializeConfirmedServerSnapshotValidatorFactory(globalScope) {
  const SNAPSHOT_FIELDS = [
    "snapshotId",
    "serverId",
    "seasonId",
    "createdAt",
    "ownershipRecordIds",
    "structureOwnershipRecordIds",
    "verificationRecordIds",
    "unionStatusRecordIds",
    "evidenceIds",
    "creatorId",
    "reviewerId",
    "completenessRecordIds",
    "previousConfirmedSnapshotId"
  ];

  const FACTORY_DEPENDENCY_FIELDS = [
    "validateTerritoryOwnershipRecord",
    "validateTerritoryOwnershipHistory",
    "validateStructureOwnershipRecord",
    "validateStructureOwnershipHistory",
    "validateTargetVerificationRecord",
    "validateTargetVerificationHistory"
  ];

  const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;
  const FULL_MAP_WINDOW_MS = 24 * 60 * 60 * 1000;

  function createResult(errors) {
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  function createEvaluationResult(errors, projection) {
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      projection
    };
  }

  function defaultProjection() {
    return {
      mapDataConfirmedThrough: null,
      latestPartialConfirmationAt: null,
      requiredTargetCount: 0,
      verifiedTargetCount: 0,
      requiredTerritoryTargetCount: 0,
      verifiedTerritoryTargetCount: 0,
      requiredStructureTargetCount: 0,
      verifiedStructureTargetCount: 0,
      completeCoverage: false,
      qualifiesAsFullMapConfirmation: false,
      observationWindowStartedAt: null,
      observationWindowEndedAt: null,
      fullConfirmationAt: null
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

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim() !== "";
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

  function validateRequiredFieldPresence(record, fields, basePath, errors) {
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

  function validateUnknownFields(record, allowedFieldSet, basePath, errors) {
    const unknownFields = Object.keys(record)
      .filter((fieldName) => !allowedFieldSet.has(fieldName))
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

  function validateNullableId(errors, value, path, label) {
    if (value === null) {
      return true;
    }

    return validateRequiredId(errors, value, path, label);
  }

  function validateRequiredTimestamp(errors, value, path, label) {
    const parsedTime = parseUtcTimestamp(value);
    if (parsedTime === null) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${label} must be a real UTC ISO-8601 timestamp ending in Z.`);
      return null;
    }

    return parsedTime;
  }

  function validateIdArray(errors, value, path, label) {
    if (!Array.isArray(value)) {
      pushError(errors, "INVALID_ARRAY", path, `${label} must be an array of unique non-empty IDs.`);
      return { valid: false, values: [] };
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
        pushError(errors, "DUPLICATE_ID", entryPath, `${label} must not contain duplicate IDs.`);
        valid = false;
        continue;
      }

      seen.add(entry);
    }

    return {
      valid,
      values: value
    };
  }

  function validateSnapshotInternal(snapshot, basePath, errors) {
    const snapshotPath = basePath || "snapshot";
    const startingErrorCount = errors.length;

    if (!isRecordObject(snapshot)) {
      pushError(errors, "INVALID_OBJECT", snapshotPath, `${snapshotPath} must be an object with a plain or null prototype.`);
      return {
        isRecordValid: false,
        hasValidSnapshotId: false,
        snapshotId: null
      };
    }

    validateRequiredFieldPresence(snapshot, SNAPSHOT_FIELDS, basePath, errors);
    validateUnknownFields(snapshot, new Set(SNAPSHOT_FIELDS), basePath, errors);

    const snapshotIdPath = composePath(basePath, "snapshotId");
    const serverIdPath = composePath(basePath, "serverId");
    const seasonIdPath = composePath(basePath, "seasonId");
    const createdAtPath = composePath(basePath, "createdAt");
    const ownershipRecordIdsPath = composePath(basePath, "ownershipRecordIds");
    const structureOwnershipRecordIdsPath = composePath(basePath, "structureOwnershipRecordIds");
    const verificationRecordIdsPath = composePath(basePath, "verificationRecordIds");
    const unionStatusRecordIdsPath = composePath(basePath, "unionStatusRecordIds");
    const evidenceIdsPath = composePath(basePath, "evidenceIds");
    const creatorIdPath = composePath(basePath, "creatorId");
    const reviewerIdPath = composePath(basePath, "reviewerId");
    const completenessRecordIdsPath = composePath(basePath, "completenessRecordIds");
    const previousSnapshotPath = composePath(basePath, "previousConfirmedSnapshotId");

    const snapshotIdValid = validateRequiredId(errors, snapshot.snapshotId, snapshotIdPath, snapshotIdPath);
    const serverIdValid = validateRequiredId(errors, snapshot.serverId, serverIdPath, serverIdPath);
    const seasonIdValid = validateRequiredId(errors, snapshot.seasonId, seasonIdPath, seasonIdPath);
    validateRequiredId(errors, snapshot.creatorId, creatorIdPath, creatorIdPath);
    validateRequiredId(errors, snapshot.reviewerId, reviewerIdPath, reviewerIdPath);

    const createdAt = validateRequiredTimestamp(errors, snapshot.createdAt, createdAtPath, createdAtPath);

    const ownershipRecordIds = validateIdArray(errors, snapshot.ownershipRecordIds, ownershipRecordIdsPath, ownershipRecordIdsPath);
    const structureOwnershipRecordIds = validateIdArray(errors, snapshot.structureOwnershipRecordIds, structureOwnershipRecordIdsPath, structureOwnershipRecordIdsPath);
    const verificationRecordIds = validateIdArray(errors, snapshot.verificationRecordIds, verificationRecordIdsPath, verificationRecordIdsPath);
    validateIdArray(errors, snapshot.unionStatusRecordIds, unionStatusRecordIdsPath, unionStatusRecordIdsPath);
    validateIdArray(errors, snapshot.evidenceIds, evidenceIdsPath, evidenceIdsPath);
    validateIdArray(errors, snapshot.completenessRecordIds, completenessRecordIdsPath, completenessRecordIdsPath);

    const previousSnapshotValid = validateNullableId(errors, snapshot.previousConfirmedSnapshotId, previousSnapshotPath, previousSnapshotPath);
    const isRecordValid = errors.length === startingErrorCount;

    return {
      isRecordValid,
      hasValidSnapshotId: snapshotIdValid,
      snapshotId: snapshotIdValid ? snapshot.snapshotId : null,
      serverId: serverIdValid ? snapshot.serverId : null,
      seasonId: seasonIdValid ? snapshot.seasonId : null,
      createdAt,
      previousSnapshotId: previousSnapshotValid && isNonEmptyTrimmedString(snapshot.previousConfirmedSnapshotId)
        ? snapshot.previousConfirmedSnapshotId
        : null,
      hasGroupIdentity: serverIdValid && seasonIdValid,
      ownershipRecordIds: ownershipRecordIds.valid ? snapshot.ownershipRecordIds : [],
      structureOwnershipRecordIds: structureOwnershipRecordIds.valid ? snapshot.structureOwnershipRecordIds : [],
      verificationRecordIds: verificationRecordIds.valid ? snapshot.verificationRecordIds : []
    };
  }

  function tupleKey(seasonId, serverId) {
    return JSON.stringify([seasonId, serverId]);
  }

  function addCycleErrors(edges, errors, errorPaths) {
    const visited = new Set();
    const nodeIndexes = Object.keys(edges).map((entry) => Number(entry)).sort((left, right) => left - right);

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
            const path = `records[${recordIndex}].previousConfirmedSnapshotId`;
            if (!errorPaths.has(path)) {
              pushError(errors, "SNAPSHOT_CHAIN_CYCLE", path, `${path} participates in a cycle.`);
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

  function validateConfirmedServerSnapshot(snapshot) {
    const errors = [];
    validateSnapshotInternal(snapshot, "", errors);
    return createResult(errors);
  }

  function validateConfirmedServerSnapshotHistory(snapshots) {
    const errors = [];

    if (!Array.isArray(snapshots)) {
      pushError(errors, "INVALID_ARRAY", "records", "records must be an array.");
      return createResult(errors);
    }

    const metadata = new Array(snapshots.length);
    const snapshotIdToIndexes = new Map();

    for (let index = 0; index < snapshots.length; index += 1) {
      const basePath = `records[${index}]`;
      const snapshotMeta = validateSnapshotInternal(snapshots[index], basePath, errors);
      metadata[index] = snapshotMeta;

      if (snapshotMeta.hasValidSnapshotId) {
        if (!snapshotIdToIndexes.has(snapshotMeta.snapshotId)) {
          snapshotIdToIndexes.set(snapshotMeta.snapshotId, []);
        }
        snapshotIdToIndexes.get(snapshotMeta.snapshotId).push(index);
      }
    }

    const snapshotIds = Array.from(snapshotIdToIndexes.keys()).sort();
    for (let idIndex = 0; idIndex < snapshotIds.length; idIndex += 1) {
      const snapshotId = snapshotIds[idIndex];
      const indexes = snapshotIdToIndexes.get(snapshotId);
      for (let dupIndex = 1; dupIndex < indexes.length; dupIndex += 1) {
        const duplicateIndex = indexes[dupIndex];
        pushError(
          errors,
          "DUPLICATE_SNAPSHOT_ID",
          `records[${duplicateIndex}].snapshotId`,
          `snapshotId '${snapshotId}' must be unique across history.`
        );
      }
    }

    const snapshotIdToUniqueIndex = new Map();
    for (let idIndex = 0; idIndex < snapshotIds.length; idIndex += 1) {
      const snapshotId = snapshotIds[idIndex];
      const indexes = snapshotIdToIndexes.get(snapshotId);
      if (indexes.length === 1) {
        snapshotIdToUniqueIndex.set(snapshotId, indexes[0]);
      }
    }

    const previousEdges = {};
    const predecessorUseCount = new Map();
    const groupIndexes = new Map();

    for (let index = 0; index < metadata.length; index += 1) {
      const meta = metadata[index];
      if (!meta.isRecordValid || !meta.hasGroupIdentity) {
        continue;
      }

      const groupKey = tupleKey(meta.seasonId, meta.serverId);
      if (!groupIndexes.has(groupKey)) {
        groupIndexes.set(groupKey, []);
      }
      groupIndexes.get(groupKey).push(index);

      if (meta.previousSnapshotId === null) {
        continue;
      }

      const path = `records[${index}].previousConfirmedSnapshotId`;
      const previousIndex = snapshotIdToUniqueIndex.get(meta.previousSnapshotId);

      if (previousIndex === undefined) {
        pushError(errors, "INVALID_PREVIOUS_SNAPSHOT", path, `${path} must reference another unique snapshotId in history.`);
        continue;
      }

      if (previousIndex === index) {
        pushError(errors, "INVALID_PREVIOUS_SNAPSHOT", path, `${path} must not reference the same snapshot.`);
        continue;
      }

      const previousMeta = metadata[previousIndex];
      if (!previousMeta.isRecordValid || !previousMeta.hasGroupIdentity) {
        pushError(errors, "INVALID_PREVIOUS_SNAPSHOT", path, `${path} must reference an individually valid snapshot in the same server and season.`);
        continue;
      }

      if (meta.serverId !== previousMeta.serverId || meta.seasonId !== previousMeta.seasonId) {
        pushError(errors, "INVALID_PREVIOUS_SNAPSHOT", path, `${path} must reference a snapshot in the same server and season.`);
        continue;
      }

      if (meta.createdAt === null || previousMeta.createdAt === null || previousMeta.createdAt >= meta.createdAt) {
        pushError(errors, "INVALID_PREVIOUS_SNAPSHOT", path, `${path} must reference a snapshot with a strictly earlier createdAt.`);
        continue;
      }

      previousEdges[index] = previousIndex;
      predecessorUseCount.set(previousIndex, (predecessorUseCount.get(previousIndex) || 0) + 1);
    }

    const predecessorIndexes = Array.from(predecessorUseCount.keys()).sort((left, right) => left - right);
    for (let index = 0; index < predecessorIndexes.length; index += 1) {
      const predecessorIndex = predecessorIndexes[index];
      const useCount = predecessorUseCount.get(predecessorIndex);
      if (useCount > 1) {
        pushError(
          errors,
          "SNAPSHOT_CHAIN_FORK",
          `records[${predecessorIndex}].snapshotId`,
          `records[${predecessorIndex}] is referenced by multiple later snapshots.`
        );
      }
    }

    const cycleErrorPaths = new Set();
    addCycleErrors(previousEdges, errors, cycleErrorPaths);

    const groupKeys = Array.from(groupIndexes.keys()).sort();
    for (let groupIndex = 0; groupIndex < groupKeys.length; groupIndex += 1) {
      const groupKey = groupKeys[groupIndex];
      const indexes = groupIndexes.get(groupKey);
      let tailCount = 0;

      for (let index = 0; index < indexes.length; index += 1) {
        const snapshotIndex = indexes[index];
        const usedAsPrevious = predecessorUseCount.get(snapshotIndex) || 0;
        if (usedAsPrevious === 0) {
          tailCount += 1;
        }
      }

      if (tailCount > 1) {
        const candidateIndexes = indexes.slice().sort((left, right) => left - right);
        pushError(
          errors,
          "SNAPSHOT_CHAIN_MULTIPLE_TAILS",
          `records[${candidateIndexes[candidateIndexes.length - 1]}].snapshotId`,
          "Snapshot chain has multiple current tails for the same server and season."
        );
      }
    }

    return createResult(errors);
  }

  function validateRequiredTargetRef(targetRef, path, errors) {
    if (!isRecordObject(targetRef)) {
      pushError(errors, "INVALID_OBJECT", path, `${path} must be an object with a plain or null prototype.`);
      return null;
    }

    const allowedFields = new Set(["type", "row", "col", "structureId"]);
    validateUnknownFields(targetRef, allowedFields, path, errors);

    if (!Object.prototype.hasOwnProperty.call(targetRef, "type")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "type"), `${composePath(path, "type")} is required.`);
      return null;
    }

    if (targetRef.type === "normal_map_cell") {
      const requiredFields = new Set(["type", "row", "col"]);
      validateUnknownFields(targetRef, requiredFields, path, errors);

      if (!Object.prototype.hasOwnProperty.call(targetRef, "row")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "row"), `${composePath(path, "row")} is required.`);
      }
      if (!Object.prototype.hasOwnProperty.call(targetRef, "col")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "col"), `${composePath(path, "col")} is required.`);
      }

      const rowValid = Number.isInteger(targetRef.row) && Number.isFinite(targetRef.row) && targetRef.row > 0;
      const colValid = Number.isInteger(targetRef.col) && Number.isFinite(targetRef.col) && targetRef.col > 0;

      if (!rowValid) {
        pushError(errors, "INVALID_NUMBER", composePath(path, "row"), `${composePath(path, "row")} must be a positive integer.`);
      }
      if (!colValid) {
        pushError(errors, "INVALID_NUMBER", composePath(path, "col"), `${composePath(path, "col")} must be a positive integer.`);
      }

      return rowValid && colValid ? JSON.stringify(["normal_map_cell", targetRef.row, targetRef.col]) : null;
    }

    if (targetRef.type === "logical_structure") {
      const requiredFields = new Set(["type", "structureId"]);
      validateUnknownFields(targetRef, requiredFields, path, errors);

      if (!Object.prototype.hasOwnProperty.call(targetRef, "structureId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", composePath(path, "structureId"), `${composePath(path, "structureId")} is required.`);
        return null;
      }

      if (!isNonEmptyTrimmedString(targetRef.structureId)) {
        pushError(errors, "INVALID_STRING", composePath(path, "structureId"), `${composePath(path, "structureId")} must be a non-empty string.`);
        return null;
      }

      return JSON.stringify(["logical_structure", targetRef.structureId]);
    }

    pushError(errors, "INVALID_ENUM", composePath(path, "type"), `${composePath(path, "type")} has an unsupported value.`);
    return null;
  }

  function prefixErrors(errors, prefix) {
    const prefixed = [];
    for (let index = 0; index < errors.length; index += 1) {
      const error = errors[index];
      prefixed.push({
        code: error.code,
        path: error.path ? `${prefix}.${error.path}` : prefix,
        message: error.message
      });
    }
    return prefixed;
  }

  function runDependencyValidation(dependencySet, methodName, value) {
    return dependencySet[methodName](value);
  }

  function evaluateConfirmedServerSnapshotReferencesInternal(input, dependencySet) {
    const errors = [];
    const projection = defaultProjection();

    if (!isRecordObject(input)) {
      pushError(errors, "INVALID_OBJECT", "input", "input must be an object with a plain or null prototype.");
      return createEvaluationResult(errors, projection);
    }

    const inputFields = [
      "snapshot",
      "territoryOwnershipRecords",
      "structureOwnershipRecords",
      "verificationRecords",
      "requiredTargetRefs"
    ];

    validateRequiredFieldPresence(input, inputFields, "", errors);
    validateUnknownFields(input, new Set(inputFields), "", errors);

    const snapshotMeta = validateSnapshotInternal(input.snapshot, "snapshot", errors);

    const requiredTargetRefKeys = new Set();
    if (!Array.isArray(input.requiredTargetRefs)) {
      pushError(errors, "INVALID_ARRAY", "requiredTargetRefs", "requiredTargetRefs must be an array.");
    } else {
      for (let index = 0; index < input.requiredTargetRefs.length; index += 1) {
        const targetPath = `requiredTargetRefs[${index}]`;
        const targetKey = validateRequiredTargetRef(input.requiredTargetRefs[index], targetPath, errors);
        if (targetKey === null) {
          continue;
        }

        if (requiredTargetRefKeys.has(targetKey)) {
          pushError(errors, "DUPLICATE_REQUIRED_TARGET", targetPath, `${targetPath} duplicates another required target.`);
          continue;
        }

        requiredTargetRefKeys.add(targetKey);
      }
    }

    const collectionDescriptors = [
      {
        field: "territoryOwnershipRecords",
        historyMethod: "validateTerritoryOwnershipHistory",
        recordMethod: "validateTerritoryOwnershipRecord",
        idField: "ownershipRecordId",
        idPathLabel: "ownershipRecordId",
        targetKeyFromRecord(record) {
          return record && record.territoryRef
            ? JSON.stringify(["normal_map_cell", record.territoryRef.row, record.territoryRef.col])
            : null;
        }
      },
      {
        field: "structureOwnershipRecords",
        historyMethod: "validateStructureOwnershipHistory",
        recordMethod: "validateStructureOwnershipRecord",
        idField: "structureOwnershipId",
        idPathLabel: "structureOwnershipId",
        targetKeyFromRecord(record) {
          return record && Object.prototype.hasOwnProperty.call(record, "structureId")
            ? JSON.stringify(["logical_structure", record.structureId])
            : null;
        }
      },
      {
        field: "verificationRecords",
        historyMethod: "validateTargetVerificationHistory",
        recordMethod: "validateTargetVerificationRecord",
        idField: "verificationId",
        idPathLabel: "verificationId",
        targetKeyFromRecord(record) {
          if (!record || !record.targetRef) {
            return null;
          }
          if (record.targetRef.type === "normal_map_cell") {
            return JSON.stringify(["normal_map_cell", record.targetRef.row, record.targetRef.col]);
          }
          if (record.targetRef.type === "logical_structure") {
            return JSON.stringify(["logical_structure", record.targetRef.structureId]);
          }
          return null;
        }
      }
    ];

    const collectionState = {};

    for (let descriptorIndex = 0; descriptorIndex < collectionDescriptors.length; descriptorIndex += 1) {
      const descriptor = collectionDescriptors[descriptorIndex];
      const value = input[descriptor.field];

      if (!Array.isArray(value)) {
        pushError(errors, "INVALID_ARRAY", descriptor.field, `${descriptor.field} must be an array.`);
        collectionState[descriptor.field] = {
          items: [],
          idToIndexes: new Map(),
          validIdToIndex: new Map(),
          validCurrentByTarget: new Map()
        };
        continue;
      }

      const historyResult = runDependencyValidation(dependencySet, descriptor.historyMethod, value);
      const historyErrors = prefixErrors(historyResult.errors, descriptor.field);
      for (let errorIndex = 0; errorIndex < historyErrors.length; errorIndex += 1) {
        errors.push(historyErrors[errorIndex]);
      }

      const items = new Array(value.length);
      const idToIndexes = new Map();
      const validIdToIndex = new Map();
      const validCurrentByTarget = new Map();

      for (let index = 0; index < value.length; index += 1) {
        const record = value[index];
        const recordResult = runDependencyValidation(dependencySet, descriptor.recordMethod, record);
        const isRecordValid = recordResult.valid;

        let recordId = null;
        if (isRecordObject(record) && Object.prototype.hasOwnProperty.call(record, descriptor.idField) && isNonEmptyTrimmedString(record[descriptor.idField])) {
          recordId = record[descriptor.idField];
          if (!idToIndexes.has(recordId)) {
            idToIndexes.set(recordId, []);
          }
          idToIndexes.get(recordId).push(index);
        }

        const targetKey = isRecordValid ? descriptor.targetKeyFromRecord(record) : null;

        items[index] = {
          index,
          record,
          recordResult,
          isRecordValid,
          recordId,
          targetKey
        };
      }

      const sortedRecordIds = Array.from(idToIndexes.keys()).sort();
      for (let idIndex = 0; idIndex < sortedRecordIds.length; idIndex += 1) {
        const recordId = sortedRecordIds[idIndex];
        const indexes = idToIndexes.get(recordId);
        const validIndexes = [];

        for (let index = 0; index < indexes.length; index += 1) {
          const itemIndex = indexes[index];
          if (items[itemIndex].isRecordValid) {
            validIndexes.push(itemIndex);
          }
        }

        if (validIndexes.length === 1) {
          validIdToIndex.set(recordId, validIndexes[0]);
        }
      }

      if (descriptor.field === "verificationRecords") {
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (!item.isRecordValid || item.targetKey === null) {
            continue;
          }

          if (item.record.reviewState === "confirmed" && item.record.supersededBy === null) {
            const current = validCurrentByTarget.get(item.targetKey);
            const observedAtParsed = parseUtcTimestamp(item.record.observedAt);
            if (observedAtParsed === null) {
              continue;
            }

            if (!current || observedAtParsed > current.observedAtParsed || (observedAtParsed === current.observedAtParsed && item.index < current.index)) {
              validCurrentByTarget.set(item.targetKey, {
                index: item.index,
                observedAtParsed
              });
            }
          }
        }
      }

      collectionState[descriptor.field] = {
        items,
        idToIndexes,
        validIdToIndex,
        validCurrentByTarget
      };
    }

    if (!snapshotMeta.isRecordValid) {
      return createEvaluationResult(errors, projection);
    }

    const territoryState = collectionState.territoryOwnershipRecords;
    const structureState = collectionState.structureOwnershipRecords;
    const verificationState = collectionState.verificationRecords;

    const selectedTerritoryByTarget = new Map();
    const selectedStructureByTarget = new Map();
    const selectedVerificationByTarget = new Map();

    function resolveSelectedIds(idList, state, collectionPath, collectionType) {
      const selectedItems = [];
      for (let index = 0; index < idList.length; index += 1) {
        const id = idList[index];
        const path = `${collectionPath}[${index}]`;

        const allIndexes = state.idToIndexes.get(id) || [];
        const validIndexes = [];
        for (let i = 0; i < allIndexes.length; i += 1) {
          if (state.items[allIndexes[i]].isRecordValid) {
            validIndexes.push(allIndexes[i]);
          }
        }

        if (validIndexes.length !== 1) {
          pushError(errors, "UNRESOLVED_REFERENCE", path, `${path} must resolve to exactly one individually valid record.`);
          continue;
        }

        const item = state.items[validIndexes[0]];
        selectedItems.push({ path, item });

        const matchesSnapshot = item.record.serverId === snapshotMeta.serverId && item.record.seasonId === snapshotMeta.seasonId;
        if (!matchesSnapshot) {
          pushError(errors, "SNAPSHOT_REFERENCE_SCOPE_MISMATCH", path, `${path} must reference a record in the same server and season as snapshot.`);
        }

        if (collectionType === "ownership") {
          if (item.record.reviewState !== "confirmed" || item.record.supersededBy !== null) {
            pushError(errors, "INVALID_SELECTED_RECORD_STATE", path, `${path} must reference a confirmed non-superseded ownership record.`);
          }
        }

        if (collectionType === "verification") {
          if (item.record.reviewState !== "confirmed" || item.record.supersededBy !== null) {
            pushError(errors, "INVALID_SELECTED_RECORD_STATE", path, `${path} must reference a confirmed non-superseded verification record.`);
          }
        }
      }

      return selectedItems;
    }

    const selectedTerritory = resolveSelectedIds(
      snapshotMeta.ownershipRecordIds,
      territoryState,
      "snapshot.ownershipRecordIds",
      "ownership"
    );

    const selectedStructure = resolveSelectedIds(
      snapshotMeta.structureOwnershipRecordIds,
      structureState,
      "snapshot.structureOwnershipRecordIds",
      "ownership"
    );

    const selectedVerification = resolveSelectedIds(
      snapshotMeta.verificationRecordIds,
      verificationState,
      "snapshot.verificationRecordIds",
      "verification"
    );

    for (let index = 0; index < selectedTerritory.length; index += 1) {
      const selected = selectedTerritory[index];
      const targetKey = selected.item.targetKey;
      if (targetKey === null) {
        continue;
      }
      if (selectedTerritoryByTarget.has(targetKey)) {
        pushError(errors, "DUPLICATE_SELECTED_TARGET", selected.path, `${selected.path} duplicates another selected ownership target.`);
      } else {
        selectedTerritoryByTarget.set(targetKey, selected.item);
      }
    }

    for (let index = 0; index < selectedStructure.length; index += 1) {
      const selected = selectedStructure[index];
      const targetKey = selected.item.targetKey;
      if (targetKey === null) {
        continue;
      }
      if (selectedStructureByTarget.has(targetKey)) {
        pushError(errors, "DUPLICATE_SELECTED_TARGET", selected.path, `${selected.path} duplicates another selected ownership target.`);
      } else {
        selectedStructureByTarget.set(targetKey, selected.item);
      }
    }

    for (let index = 0; index < selectedVerification.length; index += 1) {
      const selected = selectedVerification[index];
      const targetKey = selected.item.targetKey;
      if (targetKey === null) {
        continue;
      }

      if (selectedVerificationByTarget.has(targetKey)) {
        pushError(errors, "DUPLICATE_SELECTED_TARGET", selected.path, `${selected.path} duplicates another selected verification target.`);
      } else {
        selectedVerificationByTarget.set(targetKey, selected.item);
      }

      const verifiedOwnershipRef = selected.item.record.verifiedOwnershipRef;
      const ownershipType = verifiedOwnershipRef.type;
      const ownershipId = verifiedOwnershipRef.recordId;

      if (ownershipType === "territory_ownership_record") {
        const targetOwnership = selectedTerritoryByTarget.get(targetKey);
        if (!targetOwnership || targetOwnership.recordId !== ownershipId) {
          pushError(errors, "OWNERSHIP_VERIFICATION_MISMATCH", selected.path, `${selected.path} must reference the selected territory ownership record for this target.`);
        }
      } else if (ownershipType === "structure_ownership_record") {
        const targetOwnership = selectedStructureByTarget.get(targetKey);
        if (!targetOwnership || targetOwnership.recordId !== ownershipId) {
          pushError(errors, "OWNERSHIP_VERIFICATION_MISMATCH", selected.path, `${selected.path} must reference the selected structure ownership record for this target.`);
        }
      } else {
        pushError(errors, "OWNERSHIP_VERIFICATION_MISMATCH", selected.path, `${selected.path} references an unsupported ownership type.`);
      }

      const confirmedAt = parseUtcTimestamp(selected.item.record.confirmedAt);
      if (confirmedAt !== null && snapshotMeta.createdAt !== null && snapshotMeta.createdAt < confirmedAt) {
        pushError(errors, "SNAPSHOT_CREATED_AT_ORDER", selected.path, `${selected.path} has confirmedAt later than snapshot.createdAt.`);
      }
    }

    function validateOwnershipHasVerification(selectedMap, label) {
      const targetKeys = Array.from(selectedMap.keys()).sort();
      for (let index = 0; index < targetKeys.length; index += 1) {
        const targetKey = targetKeys[index];
        const ownershipItem = selectedMap.get(targetKey);
        if (!selectedVerificationByTarget.has(targetKey)) {
          pushError(
            errors,
            "MISSING_SELECTED_VERIFICATION",
            `snapshot.${label}`,
            `Selected ownership target '${targetKey}' must have exactly one matching selected verification.`
          );
        }
      }
    }

    validateOwnershipHasVerification(selectedTerritoryByTarget, "ownershipRecordIds");
    validateOwnershipHasVerification(selectedStructureByTarget, "structureOwnershipRecordIds");

    const requiredTargetKeys = Array.from(requiredTargetRefKeys.values()).sort();
    projection.requiredTargetCount = requiredTargetKeys.length;
    requiredTargetKeys.forEach((targetKey) => {
      const type = JSON.parse(targetKey)[0];
      if (type === "normal_map_cell") projection.requiredTerritoryTargetCount += 1;
      if (type === "logical_structure") projection.requiredStructureTargetCount += 1;
    });

    if (requiredTargetKeys.length === 0) {
      return createEvaluationResult(errors, projection);
    }

    if (errors.length > 0) {
      return createEvaluationResult(errors, projection);
    }

    let completeCoverage = true;
    const selectedObservedAtValues = [];

    for (let index = 0; index < requiredTargetKeys.length; index += 1) {
      const targetKey = requiredTargetKeys[index];
      const selectedVerificationItem = selectedVerificationByTarget.get(targetKey);

      if (!selectedVerificationItem) {
        completeCoverage = false;
        continue;
      }

      const observedAtParsed = parseUtcTimestamp(selectedVerificationItem.record.observedAt);
      if (observedAtParsed === null) {
        completeCoverage = false;
        continue;
      }

      selectedObservedAtValues.push(observedAtParsed);
      const selectedType = JSON.parse(targetKey)[0];
      if (selectedType === "normal_map_cell") projection.verifiedTerritoryTargetCount += 1;
      if (selectedType === "logical_structure") projection.verifiedStructureTargetCount += 1;

      const latestInHistory = verificationState.validCurrentByTarget.get(targetKey);
      if (!latestInHistory) {
        continue;
      }

      if (latestInHistory.index !== selectedVerificationItem.index) {
        pushError(
          errors,
          "NOT_LATEST_SELECTED_VERIFICATION",
          "snapshot.verificationRecordIds",
          "Selected verification must be the latest valid non-superseded confirmed verification for each required target."
        );
      }
    }

    projection.verifiedTargetCount = selectedObservedAtValues.length;
    if (selectedObservedAtValues.length > 0) {
      const newestSelectedObservedAt = Math.max(...selectedObservedAtValues);
      projection.latestPartialConfirmationAt =
        new Date(newestSelectedObservedAt).toISOString().replace(".000Z", "Z");
    }

    if (errors.length > 0) {
      return createEvaluationResult(errors, projection);
    }

    if (!completeCoverage) {
      return createEvaluationResult(errors, projection);
    }

    if (selectedObservedAtValues.length !== requiredTargetKeys.length) {
      return createEvaluationResult(errors, projection);
    }

    let oldestObservedAt = selectedObservedAtValues[0];
    let newestObservedAt = selectedObservedAtValues[0];

    for (let index = 1; index < selectedObservedAtValues.length; index += 1) {
      const value = selectedObservedAtValues[index];
      if (value < oldestObservedAt) {
        oldestObservedAt = value;
      }
      if (value > newestObservedAt) {
        newestObservedAt = value;
      }
    }

    projection.completeCoverage = true;
    projection.mapDataConfirmedThrough = new Date(oldestObservedAt).toISOString().replace(".000Z", "Z");

    const windowSpan = newestObservedAt - oldestObservedAt;
    if (windowSpan <= FULL_MAP_WINDOW_MS) {
      projection.qualifiesAsFullMapConfirmation = true;
      projection.observationWindowStartedAt = new Date(oldestObservedAt).toISOString().replace(".000Z", "Z");
      projection.observationWindowEndedAt = new Date(newestObservedAt).toISOString().replace(".000Z", "Z");
      projection.fullConfirmationAt = projection.observationWindowStartedAt;
    }

    return createEvaluationResult(errors, projection);
  }

  function createConfirmedServerSnapshotValidator(options) {
    if (!isRecordObject(options)) {
      throw new TypeError("createConfirmedServerSnapshotValidator options must be a plain object.");
    }

    const optionKeys = Object.keys(options).sort();
    const expectedKeys = FACTORY_DEPENDENCY_FIELDS.slice().sort();

    for (let index = 0; index < optionKeys.length; index += 1) {
      const key = optionKeys[index];
      if (expectedKeys.indexOf(key) === -1) {
        throw new TypeError(`createConfirmedServerSnapshotValidator does not recognize option '${key}'.`);
      }
    }

    for (let index = 0; index < FACTORY_DEPENDENCY_FIELDS.length; index += 1) {
      const key = FACTORY_DEPENDENCY_FIELDS[index];
      if (!Object.prototype.hasOwnProperty.call(options, key)) {
        throw new TypeError(`createConfirmedServerSnapshotValidator requires '${key}'.`);
      }

      if (typeof options[key] !== "function") {
        throw new TypeError(`createConfirmedServerSnapshotValidator '${key}' must be a function.`);
      }
    }

    const dependencySet = options;

    function evaluateConfirmedServerSnapshotReferences(input) {
      return evaluateConfirmedServerSnapshotReferencesInternal(input, dependencySet);
    }

    return {
      validateConfirmedServerSnapshot,
      validateConfirmedServerSnapshotHistory,
      evaluateConfirmedServerSnapshotReferences
    };
  }

  const api = {
    createConfirmedServerSnapshotValidator
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.createConfirmedServerSnapshotValidator = createConfirmedServerSnapshotValidator;
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this)));
