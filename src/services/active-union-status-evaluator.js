(function initializeActiveUnionStatusEvaluatorFactory(globalScope) {
  const ROOT_FIELDS = new Set([
    "identity",
    "currentStatus",
    "confirmedPresenceFacts",
    "qualifyingFullMapConfirmations"
  ]);

  const IDENTITY_FIELDS = new Set([
    "statusId",
    "unionId",
    "serverId",
    "seasonId",
    "evaluatedAt"
  ]);

  const PRESENCE_FIELDS = new Set([
    "factId",
    "unionId",
    "serverId",
    "seasonId",
    "observedAt",
    "ownershipRecordId",
    "snapshotId"
  ]);

  const QUALIFYING_FIELDS = new Set([
    "snapshotId",
    "unionId",
    "serverId",
    "seasonId",
    "fullConfirmationAt",
    "ownedTerritoryCount"
  ]);

  const FACTUAL_FIELDS = [
    "unionId",
    "serverId",
    "seasonId",
    "activityState",
    "derivedFrom",
    "firstConfirmedPresenceAt",
    "mostRecentConfirmedPresenceAt",
    "zeroTerritorySince",
    "verificationWindowStartedAt",
    "verificationThrough",
    "verificationSnapshotIds"
  ];

  const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const FIVE_DAYS_MS = 5 * DAY_MS;
  const FOURTEEN_DAYS_MS = 14 * DAY_MS;

  class ActiveUnionStatusEvaluatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ActiveUnionStatusEvaluatorError";
      this.code = code;
    }
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function createFactoryError(message) {
    return new ActiveUnionStatusEvaluatorError("invalid_factory", message);
  }

  function createResult(errors, evaluation) {
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      evaluation: errors.length === 0 ? evaluation : null
    };
  }

  function pushError(errors, code, path, message) {
    errors.push({ code, path, message });
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

  function deepClone(value) {
    if (Array.isArray(value)) {
      const clone = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        clone[index] = deepClone(value[index]);
      }
      return clone;
    }

    if (!isRecordObject(value)) {
      return value;
    }

    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });
    return clone;
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

  function normalizeTimestamp(parsedTime) {
    return new Date(parsedTime).toISOString().replace(".000Z", "Z");
  }

  function validateRecordObject(value, path, errors) {
    if (!isRecordObject(value)) {
      pushError(errors, "invalid_input", path, `${path} must be a plain object.`);
      return false;
    }

    return true;
  }

  function validateRequiredFields(record, requiredFields, path, errors) {
    requiredFields.forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(record, fieldName)) {
        pushError(errors, "invalid_input", `${path}.${fieldName}`, `${path}.${fieldName} is required.`);
      }
    });
  }

  function validateUnknownFields(record, allowedFields, path, errors) {
    const unknownFields = Object.keys(record).filter((fieldName) => !allowedFields.has(fieldName)).sort();
    for (let index = 0; index < unknownFields.length; index += 1) {
      const fieldName = unknownFields[index];
      pushError(errors, "invalid_input", `${path}.${fieldName}`, `Unknown field '${fieldName}'.`);
    }
  }

  function validateRequiredId(value, path, errors) {
    if (!isNonEmptyTrimmedString(value)) {
      pushError(errors, "invalid_input", path, `${path} must be a non-empty string.`);
      return false;
    }
    return true;
  }

  function validateRequiredTimestamp(value, path, errors) {
    const parsedTime = parseUtcTimestamp(value);
    if (parsedTime === null) {
      pushError(errors, "invalid_input", path, `${path} must be a real UTC ISO-8601 timestamp ending in Z.`);
      return null;
    }
    return parsedTime;
  }

  function validateNonNegativeInteger(value, path, errors) {
    if (!Number.isInteger(value) || value < 0) {
      pushError(errors, "invalid_input", path, `${path} must be a non-negative integer.`);
      return false;
    }
    return true;
  }

  function createCallableValidator(owner, maybeFn) {
    if (typeof maybeFn !== "function") {
      throw createFactoryError("Active Union Status Evaluator requires validateActiveUnionStatus to be a function.");
    }

    return function boundValidator() {
      return maybeFn.apply(owner, arguments);
    };
  }

  function sortByTimeThenId(left, right) {
    if (left.time !== right.time) {
      return left.time - right.time;
    }

    if (left.id < right.id) {
      return -1;
    }

    if (left.id > right.id) {
      return 1;
    }

    return 0;
  }

  function normalizeArrayForComparison(values) {
    return values.slice().sort();
  }

  function normalizeStatusFactsForComparison(status) {
    const normalized = {};

    for (let index = 0; index < FACTUAL_FIELDS.length; index += 1) {
      const fieldName = FACTUAL_FIELDS[index];
      if (fieldName === "verificationSnapshotIds") {
        normalized[fieldName] = normalizeArrayForComparison(Array.isArray(status[fieldName]) ? status[fieldName] : []);
        continue;
      }

      const value = status[fieldName];
      if (value === null) {
        normalized[fieldName] = null;
        continue;
      }

      if (fieldName === "unionId" || fieldName === "serverId" || fieldName === "seasonId" || fieldName === "activityState" || fieldName === "derivedFrom") {
        normalized[fieldName] = value;
        continue;
      }

      normalized[fieldName] = parseUtcTimestamp(value);
    }

    return normalized;
  }

  function factualStateEquals(left, right) {
    const leftNormalized = normalizeStatusFactsForComparison(left);
    const rightNormalized = normalizeStatusFactsForComparison(right);

    for (let index = 0; index < FACTUAL_FIELDS.length; index += 1) {
      const fieldName = FACTUAL_FIELDS[index];
      if (fieldName === "verificationSnapshotIds") {
        const leftArray = leftNormalized[fieldName];
        const rightArray = rightNormalized[fieldName];
        if (leftArray.length !== rightArray.length) {
          return false;
        }

        for (let arrayIndex = 0; arrayIndex < leftArray.length; arrayIndex += 1) {
          if (leftArray[arrayIndex] !== rightArray[arrayIndex]) {
            return false;
          }
        }

        continue;
      }

      if (leftNormalized[fieldName] !== rightNormalized[fieldName]) {
        return false;
      }
    }

    return true;
  }

  function findRetroactiveChangedTimestampField(nextStatus, currentStatus, currentEffectiveFrom) {
    const timestampFields = [
      "firstConfirmedPresenceAt",
      "mostRecentConfirmedPresenceAt",
      "zeroTerritorySince",
      "verificationWindowStartedAt",
      "verificationThrough"
    ];

    for (let index = 0; index < timestampFields.length; index += 1) {
      const fieldName = timestampFields[index];
      const nextValue = nextStatus[fieldName];
      const currentValue = currentStatus[fieldName];
      const nextParsed = nextValue === null ? null : parseUtcTimestamp(nextValue);
      const currentParsed = currentValue === null ? null : parseUtcTimestamp(currentValue);

      if (nextParsed === currentParsed) {
        continue;
      }

      if (nextParsed !== null && nextParsed < currentEffectiveFrom) {
        return fieldName;
      }
    }

    return null;
  }

  function evaluateFactory(validateActiveUnionStatus) {
    function evaluate(input) {
      const errors = [];

      if (!validateRecordObject(input, "input", errors)) {
        return createResult(errors, null);
      }

      validateRequiredFields(input, ROOT_FIELDS, "input", errors);
      validateUnknownFields(input, ROOT_FIELDS, "input", errors);

      if (errors.length > 0) {
        return createResult(errors, null);
      }

      const identity = input.identity;
      const currentStatus = input.currentStatus;
      const confirmedPresenceFacts = input.confirmedPresenceFacts;
      const qualifyingFullMapConfirmations = input.qualifyingFullMapConfirmations;

      let identityMeta = null;
      if (validateRecordObject(identity, "input.identity", errors)) {
        validateRequiredFields(identity, IDENTITY_FIELDS, "input.identity", errors);
        validateUnknownFields(identity, IDENTITY_FIELDS, "input.identity", errors);

        const statusIdValid = validateRequiredId(identity.statusId, "input.identity.statusId", errors);
        const unionIdValid = validateRequiredId(identity.unionId, "input.identity.unionId", errors);
        const serverIdValid = validateRequiredId(identity.serverId, "input.identity.serverId", errors);
        const seasonIdValid = validateRequiredId(identity.seasonId, "input.identity.seasonId", errors);
        const evaluatedAt = validateRequiredTimestamp(identity.evaluatedAt, "input.identity.evaluatedAt", errors);

        identityMeta = {
          statusId: statusIdValid ? identity.statusId : null,
          unionId: unionIdValid ? identity.unionId : null,
          serverId: serverIdValid ? identity.serverId : null,
          seasonId: seasonIdValid ? identity.seasonId : null,
          evaluatedAt
        };
      }

      let currentStatusMeta = null;
      if (currentStatus !== null) {
        if (validateRecordObject(currentStatus, "input.currentStatus", errors)) {
          let validationResult = null;
          try {
            validationResult = validateActiveUnionStatus(currentStatus);
          } catch (error) {
            validationResult = null;
          }

          if (!isRecordObject(validationResult) || typeof validationResult.valid !== "boolean" || !Array.isArray(validationResult.errors)) {
            pushError(errors, "invalid_current_status", "input.currentStatus", "currentStatus validator returned an invalid result.");
          } else if (!validationResult.valid) {
            pushError(errors, "invalid_current_status", "input.currentStatus", "currentStatus must be a valid ActiveUnionStatus record.");
          } else {
            const parsedEffectiveFrom = parseUtcTimestamp(currentStatus.effectiveFrom);
            if (currentStatus.reviewState !== "confirmed" || currentStatus.effectiveTo !== null || currentStatus.supersededBy !== null) {
              pushError(errors, "invalid_current_status", "input.currentStatus", "currentStatus must be confirmed, current, and non-superseded.");
            } else if (
              identityMeta
              && (
                currentStatus.unionId !== identityMeta.unionId
                || currentStatus.serverId !== identityMeta.serverId
                || currentStatus.seasonId !== identityMeta.seasonId
              )
            ) {
              pushError(errors, "invalid_current_status", "input.currentStatus", "currentStatus must match identity unionId, serverId, and seasonId.");
            } else {
              currentStatusMeta = {
                effectiveFrom: parsedEffectiveFrom
              };
            }
          }
        }
      }

      const presenceItems = [];
      const seenFactIds = new Set();
      const seenOwnershipRecordIds = new Set();

      if (!Array.isArray(confirmedPresenceFacts)) {
        pushError(errors, "invalid_input", "input.confirmedPresenceFacts", "input.confirmedPresenceFacts must be an array.");
      } else {
        for (let index = 0; index < confirmedPresenceFacts.length; index += 1) {
          const item = confirmedPresenceFacts[index];
          const path = `input.confirmedPresenceFacts[${index}]`;

          if (!validateRecordObject(item, path, errors)) {
            continue;
          }

          validateRequiredFields(item, PRESENCE_FIELDS, path, errors);
          validateUnknownFields(item, PRESENCE_FIELDS, path, errors);

          const factIdValid = validateRequiredId(item.factId, `${path}.factId`, errors);
          const unionIdValid = validateRequiredId(item.unionId, `${path}.unionId`, errors);
          const serverIdValid = validateRequiredId(item.serverId, `${path}.serverId`, errors);
          const seasonIdValid = validateRequiredId(item.seasonId, `${path}.seasonId`, errors);
          const observedAt = validateRequiredTimestamp(item.observedAt, `${path}.observedAt`, errors);
          const ownershipRecordIdValid = validateRequiredId(item.ownershipRecordId, `${path}.ownershipRecordId`, errors);
          const snapshotIdValid = validateRequiredId(item.snapshotId, `${path}.snapshotId`, errors);

          if (factIdValid) {
            if (seenFactIds.has(item.factId)) {
              pushError(errors, "invalid_input", `${path}.factId`, `Duplicate factId '${item.factId}'.`);
            } else {
              seenFactIds.add(item.factId);
            }
          }

          if (ownershipRecordIdValid) {
            if (seenOwnershipRecordIds.has(item.ownershipRecordId)) {
              pushError(errors, "invalid_input", `${path}.ownershipRecordId`, `Duplicate ownershipRecordId '${item.ownershipRecordId}'.`);
            } else {
              seenOwnershipRecordIds.add(item.ownershipRecordId);
            }
          }

          if (
            identityMeta
            && unionIdValid
            && serverIdValid
            && seasonIdValid
            && (
              item.unionId !== identityMeta.unionId
              || item.serverId !== identityMeta.serverId
              || item.seasonId !== identityMeta.seasonId
            )
          ) {
            pushError(errors, "invalid_input", path, `${path} must match identity unionId, serverId, and seasonId.`);
          }

          presenceItems.push({
            factId: factIdValid ? item.factId : null,
            ownershipRecordId: ownershipRecordIdValid ? item.ownershipRecordId : null,
            snapshotId: snapshotIdValid ? item.snapshotId : null,
            time: observedAt,
            path
          });
        }
      }

      const qualifyingItems = [];
      const seenQualifyingSnapshotIds = new Set();

      if (!Array.isArray(qualifyingFullMapConfirmations)) {
        pushError(errors, "invalid_input", "input.qualifyingFullMapConfirmations", "input.qualifyingFullMapConfirmations must be an array.");
      } else {
        for (let index = 0; index < qualifyingFullMapConfirmations.length; index += 1) {
          const item = qualifyingFullMapConfirmations[index];
          const path = `input.qualifyingFullMapConfirmations[${index}]`;

          if (!validateRecordObject(item, path, errors)) {
            continue;
          }

          validateRequiredFields(item, QUALIFYING_FIELDS, path, errors);
          validateUnknownFields(item, QUALIFYING_FIELDS, path, errors);

          const snapshotIdValid = validateRequiredId(item.snapshotId, `${path}.snapshotId`, errors);
          const unionIdValid = validateRequiredId(item.unionId, `${path}.unionId`, errors);
          const serverIdValid = validateRequiredId(item.serverId, `${path}.serverId`, errors);
          const seasonIdValid = validateRequiredId(item.seasonId, `${path}.seasonId`, errors);
          const fullConfirmationAt = validateRequiredTimestamp(item.fullConfirmationAt, `${path}.fullConfirmationAt`, errors);
          const countValid = validateNonNegativeInteger(item.ownedTerritoryCount, `${path}.ownedTerritoryCount`, errors);

          if (snapshotIdValid) {
            if (seenQualifyingSnapshotIds.has(item.snapshotId)) {
              pushError(errors, "invalid_input", `${path}.snapshotId`, `Duplicate snapshotId '${item.snapshotId}'.`);
            } else {
              seenQualifyingSnapshotIds.add(item.snapshotId);
            }
          }

          if (
            identityMeta
            && unionIdValid
            && serverIdValid
            && seasonIdValid
            && (
              item.unionId !== identityMeta.unionId
              || item.serverId !== identityMeta.serverId
              || item.seasonId !== identityMeta.seasonId
            )
          ) {
            pushError(errors, "invalid_input", path, `${path} must match identity unionId, serverId, and seasonId.`);
          }

          qualifyingItems.push({
            snapshotId: snapshotIdValid ? item.snapshotId : null,
            time: fullConfirmationAt,
            ownedTerritoryCount: countValid ? item.ownedTerritoryCount : null,
            path
          });
        }
      }

      if (errors.length > 0) {
        return createResult(errors, null);
      }

      const snapshotRepresentations = new Map();
      const positiveEventsBySnapshot = new Map();
      const zeroEvents = [];

      function registerSnapshot(snapshotId, time, meaning, path) {
        const existing = snapshotRepresentations.get(snapshotId);
        if (!existing) {
          snapshotRepresentations.set(snapshotId, { time, meaning, path });
          return true;
        }

        if (existing.time !== time || existing.meaning !== meaning) {
          pushError(errors, "invalid_fact_set", path, `${path} contradicts another fact for snapshotId '${snapshotId}'.`);
          return false;
        }

        return true;
      }

      for (let index = 0; index < presenceItems.length; index += 1) {
        const item = presenceItems[index];
        if (!registerSnapshot(item.snapshotId, item.time, "positive", `${item.path}.snapshotId`)) {
          continue;
        }

        if (!positiveEventsBySnapshot.has(item.snapshotId)) {
          positiveEventsBySnapshot.set(item.snapshotId, {
            id: item.snapshotId,
            time: item.time
          });
        }
      }

      for (let index = 0; index < qualifyingItems.length; index += 1) {
        const item = qualifyingItems[index];
        const meaning = item.ownedTerritoryCount > 0 ? "positive" : "zero";
        if (!registerSnapshot(item.snapshotId, item.time, meaning, `${item.path}.snapshotId`)) {
          continue;
        }

        if (meaning === "positive") {
          if (!positiveEventsBySnapshot.has(item.snapshotId)) {
            positiveEventsBySnapshot.set(item.snapshotId, {
              id: item.snapshotId,
              time: item.time
            });
          }
        } else {
          zeroEvents.push({
            id: item.snapshotId,
            time: item.time
          });
        }
      }

      if (errors.length > 0) {
        return createResult(errors, null);
      }

      const positiveEvents = Array.from(positiveEventsBySnapshot.values()).sort(sortByTimeThenId);
      zeroEvents.sort(sortByTimeThenId);

      if (positiveEvents.length > 0 && zeroEvents.length > 0) {
        const positiveByTime = new Map();
        for (let index = 0; index < positiveEvents.length; index += 1) {
          const event = positiveEvents[index];
          if (!positiveByTime.has(event.time)) {
            positiveByTime.set(event.time, event.id);
          }
        }

        for (let index = 0; index < zeroEvents.length; index += 1) {
          const zeroEvent = zeroEvents[index];
          const positiveSnapshotId = positiveByTime.get(zeroEvent.time);
          if (positiveSnapshotId !== undefined) {
            pushError(
              errors,
              "invalid_fact_set",
              `input.qualifyingFullMapConfirmations[${qualifyingItems.findIndex((item) => item.snapshotId === zeroEvent.id)}].fullConfirmationAt`,
              `Positive-presence and zero-territory facts cannot exist at the same parsed instant ('${normalizeTimestamp(zeroEvent.time)}').`
            );
            break;
          }
        }
      }

      if (errors.length > 0) {
        return createResult(errors, null);
      }

      let derived = null;
      let verificationHealth = null;
      let replacementEffectiveFrom = null;
      let countedConfirmationIds = [];
      let ignoredConfirmationIds = [];
      let windowRestartCount = 0;

      if (positiveEvents.length === 0) {
        replacementEffectiveFrom = identityMeta.evaluatedAt;
        derived = {
          statusId: identityMeta.statusId,
          unionId: identityMeta.unionId,
          serverId: identityMeta.serverId,
          seasonId: identityMeta.seasonId,
          activityState: "inactive",
          reviewState: "confirmed",
          derivedFrom: "known_relation_without_confirmed_ownership",
          firstConfirmedPresenceAt: null,
          mostRecentConfirmedPresenceAt: null,
          zeroTerritorySince: null,
          verificationWindowStartedAt: null,
          verificationThrough: null,
          verificationSnapshotIds: [],
          effectiveFrom: normalizeTimestamp(identityMeta.evaluatedAt),
          effectiveTo: null,
          supersededBy: null
        };
        verificationHealth = "unverified";
      } else {
        const firstPositive = positiveEvents[0];
        const latestPositiveTime = positiveEvents[positiveEvents.length - 1].time;
        const latestPositiveSnapshotIds = positiveEvents
          .filter((event) => event.time === latestPositiveTime)
          .map((event) => event.id)
          .sort();

        const zeroCandidates = zeroEvents.filter((event) => event.time > latestPositiveTime);

        if (zeroCandidates.length === 0) {
          replacementEffectiveFrom = latestPositiveTime;
          derived = {
            statusId: identityMeta.statusId,
            unionId: identityMeta.unionId,
            serverId: identityMeta.serverId,
            seasonId: identityMeta.seasonId,
            activityState: "active",
            reviewState: "confirmed",
            derivedFrom: "confirmed_ownership",
            firstConfirmedPresenceAt: normalizeTimestamp(firstPositive.time),
            mostRecentConfirmedPresenceAt: normalizeTimestamp(latestPositiveTime),
            zeroTerritorySince: null,
            verificationWindowStartedAt: null,
            verificationThrough: normalizeTimestamp(latestPositiveTime),
            verificationSnapshotIds: latestPositiveSnapshotIds.slice(),
            effectiveFrom: normalizeTimestamp(latestPositiveTime),
            effectiveTo: null,
            supersededBy: null
          };
        } else {
          const originalZeroTerritorySince = zeroCandidates[0].time;
          let windowStartEvent = zeroCandidates[0];
          let lastCountedEvent = zeroCandidates[0];
          let countedEvents = [zeroCandidates[0]];
          let ignoredEvents = [];
          let latestSupportingTime = zeroCandidates[0].time;

          for (let index = 1; index < zeroCandidates.length; index += 1) {
            const currentEvent = zeroCandidates[index];
            const gap = currentEvent.time - lastCountedEvent.time;

            if (gap < DAY_MS) {
              ignoredEvents.push(currentEvent);
              latestSupportingTime = currentEvent.time;
              continue;
            }

            if (gap > FIVE_DAYS_MS) {
              windowRestartCount += 1;
              windowStartEvent = currentEvent;
              lastCountedEvent = currentEvent;
              countedEvents = [currentEvent];
              ignoredEvents = [];
              latestSupportingTime = currentEvent.time;
              continue;
            }

            countedEvents.push(currentEvent);
            lastCountedEvent = currentEvent;
            latestSupportingTime = currentEvent.time;
          }

          countedConfirmationIds = countedEvents.slice().sort(sortByTimeThenId).map((event) => event.id);
          ignoredConfirmationIds = ignoredEvents.slice().sort(sortByTimeThenId).map((event) => event.id);

          const completed = countedEvents.length >= 5 && (countedEvents[countedEvents.length - 1].time - windowStartEvent.time) >= FOURTEEN_DAYS_MS;
          replacementEffectiveFrom = completed ? countedEvents[countedEvents.length - 1].time : windowStartEvent.time;

          derived = {
            statusId: identityMeta.statusId,
            unionId: identityMeta.unionId,
            serverId: identityMeta.serverId,
            seasonId: identityMeta.seasonId,
            activityState: completed ? "inactive" : "active",
            reviewState: "confirmed",
            derivedFrom: "verified_zero_territory_period",
            firstConfirmedPresenceAt: normalizeTimestamp(firstPositive.time),
            mostRecentConfirmedPresenceAt: normalizeTimestamp(latestPositiveTime),
            zeroTerritorySince: normalizeTimestamp(originalZeroTerritorySince),
            verificationWindowStartedAt: normalizeTimestamp(windowStartEvent.time),
            verificationThrough: normalizeTimestamp(latestSupportingTime),
            verificationSnapshotIds: countedConfirmationIds.slice(),
            effectiveFrom: normalizeTimestamp(replacementEffectiveFrom),
            effectiveTo: null,
            supersededBy: null
          };
        }

        if (verificationHealth === null) {
          const verificationThroughTime = parseUtcTimestamp(derived.verificationThrough);
          if (identityMeta.evaluatedAt < verificationThroughTime) {
            pushError(errors, "invalid_input", "input.identity.evaluatedAt", "evaluatedAt cannot precede verificationThrough.");
            return createResult(errors, null);
          }

          if ((identityMeta.evaluatedAt - verificationThroughTime) > FIVE_DAYS_MS) {
            verificationHealth = "stale";
          } else if (derived.activityState === "active" && derived.derivedFrom === "verified_zero_territory_period") {
            verificationHealth = "monitoring";
          } else {
            verificationHealth = "current";
          }
        }
      }

      if (currentStatus !== null && factualStateEquals(derived, currentStatus)) {
        return createResult([], {
          canonicalStatus: deepClone(currentStatus),
          verificationHealth,
          requiresReplacement: false,
          replacementEffectiveFrom: null,
          countedConfirmationIds: deepClone(countedConfirmationIds),
          ignoredConfirmationIds: deepClone(ignoredConfirmationIds),
          windowRestartCount
        });
      }

      if (currentStatus !== null && currentStatusMeta && replacementEffectiveFrom < currentStatusMeta.effectiveFrom) {
        pushError(errors, "invalid_fact_set", "input.currentStatus.effectiveFrom", "State-changing late evidence requires retroactive history repair outside this evaluator.");
        return createResult(errors, null);
      }

      if (currentStatus !== null && currentStatusMeta) {
        const retroactiveField = findRetroactiveChangedTimestampField(derived, currentStatus, currentStatusMeta.effectiveFrom);
        if (retroactiveField !== null) {
          pushError(
            errors,
            "invalid_fact_set",
            `input.currentStatus.${retroactiveField}`,
            "State-changing late evidence requires retroactive history repair outside this evaluator."
          );
          return createResult(errors, null);
        }
      }

      if (errors.length > 0) {
        return createResult(errors, null);
      }

      let validatorResult = null;
      try {
        validatorResult = validateActiveUnionStatus(derived);
      } catch (error) {
        validatorResult = null;
      }

      if (!isRecordObject(validatorResult) || typeof validatorResult.valid !== "boolean" || !Array.isArray(validatorResult.errors)) {
        pushError(errors, "invalid_output", "evaluation.canonicalStatus", "Generated canonical status validator returned an invalid result.");
        return createResult(errors, null);
      }

      if (!validatorResult.valid) {
        pushError(errors, "invalid_output", "evaluation.canonicalStatus", "Generated canonical status is not valid under ActiveUnionStatus validation rules.");
        return createResult(errors, null);
      }

      return createResult([], {
        canonicalStatus: deepClone(derived),
        verificationHealth,
        requiresReplacement: true,
        replacementEffectiveFrom: normalizeTimestamp(replacementEffectiveFrom),
        countedConfirmationIds: deepClone(countedConfirmationIds),
        ignoredConfirmationIds: deepClone(ignoredConfirmationIds),
        windowRestartCount
      });
    }

    return {
      evaluate
    };
  }

  function createActiveUnionStatusEvaluator(options) {
    if (!isRecordObject(options)) {
      throw createFactoryError("Active Union Status Evaluator options must be a plain object.");
    }

    const keys = Object.keys(options).sort();
    if (keys.length !== 1 || keys[0] !== "validateActiveUnionStatus") {
      const unknownKey = keys.find((key) => key !== "validateActiveUnionStatus");
      if (unknownKey) {
        throw createFactoryError(`Active Union Status Evaluator does not recognize option '${unknownKey}'.`);
      }
      throw createFactoryError("Active Union Status Evaluator requires options.validateActiveUnionStatus.");
    }

    const validateActiveUnionStatus = createCallableValidator(options, options.validateActiveUnionStatus);
    return evaluateFactory(validateActiveUnionStatus);
  }

  const exportsObject = {
    createActiveUnionStatusEvaluator,
    ActiveUnionStatusEvaluatorError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));