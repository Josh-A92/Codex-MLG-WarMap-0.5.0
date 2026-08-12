(function initializeActivityFactHistoryServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "initialConfirmedPresenceFacts",
    "initialQualifyingFullMapConfirmations"
  ]);
  const FACT_SET_FIELDS = new Set([
    "confirmedPresenceFacts",
    "qualifyingFullMapConfirmations"
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
  const CONFIRMATION_FIELDS = new Set([
    "snapshotId",
    "unionId",
    "serverId",
    "seasonId",
    "fullConfirmationAt",
    "ownedTerritoryCount"
  ]);
  const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

  class ActivityFactHistoryServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ActivityFactHistoryServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ActivityFactHistoryServiceError(code, message);
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneRecord(record) {
    const clone = Object.getPrototypeOf(record) === null ? Object.create(null) : {};
    Object.keys(record).forEach((key) => defineOwnDataProperty(clone, key, record[key]));
    return clone;
  }

  function requireRecord(value, path) {
    if (!isRecordObject(value)) {
      fail("invalid_input", `Activity Fact History Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) {
      fail("invalid_input", `Activity Fact History Service requires ${path} to be an array.`);
    }
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Activity Fact History Service requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireTimestamp(value, path) {
    requireString(value, path);
    const match = UTC_TIMESTAMP_PATTERN.exec(value);
    const parsed = Date.parse(value);
    const canonicalInput = match
      ? value.replace(
          /(?:\.(\d{1,3}))?Z$/,
          (whole, fraction) => `.${(fraction || "").padEnd(3, "0")}Z`
        )
      : null;
    if (
      !match
      || Number.isNaN(parsed)
      || new Date(parsed).toISOString() !== canonicalInput
    ) {
      fail(
        "invalid_input",
        `Activity Fact History Service requires ${path} to be a valid UTC ISO-8601 timestamp ending in Z.`
      );
    }
    return value;
  }

  function requireFields(record, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail("invalid_input", `Activity Fact History Service requires ${path}.${field}.`);
      }
    });
    const unknown = Object.keys(record).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Activity Fact History Service does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function normalizePresenceFact(value, path) {
    const record = requireRecord(value, path);
    requireFields(record, PRESENCE_FIELDS, path);
    PRESENCE_FIELDS.forEach((field) => {
      if (field === "observedAt") {
        requireTimestamp(record[field], `${path}.${field}`);
      } else {
        requireString(record[field], `${path}.${field}`);
      }
    });
    return cloneRecord(record);
  }

  function normalizeConfirmation(value, path) {
    const record = requireRecord(value, path);
    requireFields(record, CONFIRMATION_FIELDS, path);
    ["snapshotId", "unionId", "serverId", "seasonId"].forEach((field) => {
      requireString(record[field], `${path}.${field}`);
    });
    requireTimestamp(record.fullConfirmationAt, `${path}.fullConfirmationAt`);
    if (!Number.isInteger(record.ownedTerritoryCount) || record.ownedTerritoryCount < 0) {
      fail(
        "invalid_input",
        `Activity Fact History Service requires ${path}.ownedTerritoryCount to be a non-negative integer.`
      );
    }
    return cloneRecord(record);
  }

  function scopeKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  function confirmationKey(record) {
    return JSON.stringify([record.seasonId, record.serverId, record.unionId, record.snapshotId]);
  }

  function createActivityFactHistoryService(options) {
    const factoryOptions = options === undefined ? {} : requireRecord(options, "options");
    const unknownOptions = Object.keys(factoryOptions).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknownOptions.length > 0) {
      fail("invalid_input", `Activity Fact History Service does not recognize options.${unknownOptions[0]}.`);
    }

    let presenceFacts = requireArray(
      Object.prototype.hasOwnProperty.call(factoryOptions, "initialConfirmedPresenceFacts")
        ? factoryOptions.initialConfirmedPresenceFacts
        : [],
      "options.initialConfirmedPresenceFacts"
    ).map((fact, index) => normalizePresenceFact(fact, `options.initialConfirmedPresenceFacts[${index}]`));
    let confirmations = requireArray(
      Object.prototype.hasOwnProperty.call(factoryOptions, "initialQualifyingFullMapConfirmations")
        ? factoryOptions.initialQualifyingFullMapConfirmations
        : [],
      "options.initialQualifyingFullMapConfirmations"
    ).map((fact, index) => normalizeConfirmation(fact, `options.initialQualifyingFullMapConfirmations[${index}]`));

    function validateUnique(candidatePresence, candidateConfirmations) {
      const factIds = new Set();
      candidatePresence.forEach((fact) => {
        if (factIds.has(fact.factId)) {
          fail("duplicate_fact", `Activity Fact History Service already contains factId '${fact.factId}'.`);
        }
        factIds.add(fact.factId);
      });

      const confirmationKeys = new Set();
      candidateConfirmations.forEach((confirmation) => {
        const key = confirmationKey(confirmation);
        if (confirmationKeys.has(key)) {
          fail(
            "duplicate_fact",
            `Activity Fact History Service already contains snapshot '${confirmation.snapshotId}' for this scope.`
          );
        }
        confirmationKeys.add(key);
      });
    }

    validateUnique(presenceFacts, confirmations);

    function normalizeFactSet(value) {
      const facts = requireRecord(value, "facts");
      requireFields(facts, FACT_SET_FIELDS, "facts");
      const newPresence = requireArray(
        facts.confirmedPresenceFacts,
        "facts.confirmedPresenceFacts"
      ).map((fact, index) => normalizePresenceFact(fact, `facts.confirmedPresenceFacts[${index}]`));
      const newConfirmations = requireArray(
        facts.qualifyingFullMapConfirmations,
        "facts.qualifyingFullMapConfirmations"
      ).map((fact, index) => normalizeConfirmation(fact, `facts.qualifyingFullMapConfirmations[${index}]`));

      const candidatePresence = presenceFacts.concat(newPresence);
      const candidateConfirmations = confirmations.concat(newConfirmations);
      validateUnique(candidatePresence, candidateConfirmations);
      return {
        newPresence,
        newConfirmations,
        candidatePresence,
        candidateConfirmations
      };
    }

    function validateResolvedFacts(value) {
      const normalized = normalizeFactSet(value);
      return {
        confirmedPresenceFacts: normalized.newPresence.map(cloneRecord),
        qualifyingFullMapConfirmations: normalized.newConfirmations.map(cloneRecord)
      };
    }

    function appendResolvedFacts(value) {
      const normalized = normalizeFactSet(value);
      const {
        newPresence,
        newConfirmations,
        candidatePresence,
        candidateConfirmations
      } = normalized;
      presenceFacts = candidatePresence;
      confirmations = candidateConfirmations;
      return {
        confirmedPresenceFacts: newPresence.map(cloneRecord),
        qualifyingFullMapConfirmations: newConfirmations.map(cloneRecord)
      };
    }

    function getFacts(seasonId, serverId, unionId) {
      [seasonId, serverId, unionId].forEach((value, index) => {
        requireString(value, ["seasonId", "serverId", "unionId"][index]);
      });
      const key = scopeKey(seasonId, serverId, unionId);
      return {
        confirmedPresenceFacts: presenceFacts
          .filter((fact) => scopeKey(fact.seasonId, fact.serverId, fact.unionId) === key)
          .map(cloneRecord),
        qualifyingFullMapConfirmations: confirmations
          .filter((fact) => scopeKey(fact.seasonId, fact.serverId, fact.unionId) === key)
          .map(cloneRecord)
      };
    }

    function getAllFacts() {
      return {
        confirmedPresenceFacts: presenceFacts.map(cloneRecord),
        qualifyingFullMapConfirmations: confirmations.map(cloneRecord)
      };
    }

    function captureTransactionState() {
      return {
        confirmedPresenceFacts: presenceFacts.map(cloneRecord),
        qualifyingFullMapConfirmations: confirmations.map(cloneRecord)
      };
    }

    function restoreTransactionState(snapshot) {
      const facts = requireRecord(snapshot, "snapshot");
      requireFields(facts, FACT_SET_FIELDS, "snapshot");
      const candidatePresence = requireArray(facts.confirmedPresenceFacts, "snapshot.confirmedPresenceFacts")
        .map((fact, index) => normalizePresenceFact(fact, `snapshot.confirmedPresenceFacts[${index}]`));
      const candidateConfirmations = requireArray(facts.qualifyingFullMapConfirmations, "snapshot.qualifyingFullMapConfirmations")
        .map((fact, index) => normalizeConfirmation(fact, `snapshot.qualifyingFullMapConfirmations[${index}]`));
      validateUnique(candidatePresence, candidateConfirmations);
      presenceFacts = candidatePresence.map(cloneRecord);
      confirmations = candidateConfirmations.map(cloneRecord);
    }

    return {
      validateResolvedFacts,
      appendResolvedFacts,
      getFacts,
      getAllFacts,
      captureTransactionState,
      restoreTransactionState
    };
  }

  const exportsObject = {
    createActivityFactHistoryService,
    ActivityFactHistoryServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
