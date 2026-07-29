(function initializeUnionServerSeasonRelationServiceFactory(globalScope) {
  const CANONICAL_FIELDS = new Set([
    "unionId",
    "serverId",
    "seasonId",
    "currentNativeStatusId",
    "currentActiveStatusId",
    "firstConfirmedPresenceAt",
    "mostRecentConfirmedPresenceAt",
    "evidenceIds",
    "manualOverride"
  ]);

  const ADD_KNOWN_UNION_FIELDS = new Set([
    "seasonId",
    "serverId",
    "unionId"
  ]);

  class UnionServerSeasonRelationServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionServerSeasonRelationServiceError";
      this.code = code;
    }
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      const clone = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        clone[index] = deepClone(value[index]);
      }

      return clone;
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const prototype = Object.getPrototypeOf(value);
    const clone = prototype === null ? Object.create(null) : {};

    Object.keys(value).forEach((key) => {
      Object.defineProperty(clone, key, {
        value: deepClone(value[key]),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });

    return clone;
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function createServiceError(code, message) {
    return new UnionServerSeasonRelationServiceError(code, message);
  }

  function throwInvalidInput(message) {
    throw createServiceError("invalid_input", message);
  }

  function throwDuplicateRelation(seasonId, serverId, unionId) {
    throw createServiceError(
      "duplicate_relation",
      `Union Server Season Relation Service requires relation '${seasonId} / ${serverId} / ${unionId}' to be unique.`
    );
  }

  function throwUnknownRelation(seasonId, serverId, unionId) {
    throw createServiceError(
      "unknown_relation",
      `Union Server Season Relation Service could not find relation '${seasonId} / ${serverId} / ${unionId}'.`
    );
  }

  function requirePlainObject(value, fieldName) {
    if (!isPlainObject(value)) {
      throwInvalidInput(`Union Server Season Relation Service requires ${fieldName} to be a plain object.`);
    }

    return value;
  }

  function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
      throwInvalidInput(`Union Server Season Relation Service requires ${fieldName} to be an array.`);
    }

    return value;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
      throwInvalidInput(`Union Server Season Relation Service requires ${fieldName} to be a non-empty string.`);
    }

    return value;
  }

  function requireNonEmptyStringOrNull(value, fieldName) {
    if (value === null) {
      return null;
    }

    return requireNonEmptyString(value, fieldName);
  }

  function requireUtcTimestampOrNull(value, fieldName) {
    if (value === null) {
      return null;
    }

    const timestamp = requireNonEmptyString(value, fieldName);
    const parsed = Date.parse(timestamp);

    if (!Number.isFinite(parsed)) {
      throwInvalidInput(`Union Server Season Relation Service requires ${fieldName} to be a valid UTC ISO-8601 string.`);
    }

    const normalized = new Date(parsed).toISOString();
    if (timestamp !== normalized && timestamp !== normalized.replace(".000Z", "Z")) {
      throwInvalidInput(`Union Server Season Relation Service requires ${fieldName} to be a valid UTC ISO-8601 string.`);
    }

    return timestamp;
  }

  function requireUniqueEvidenceIds(value, fieldName) {
    const evidenceIds = requireArray(value, fieldName);
    const seen = new Set();

    evidenceIds.forEach((evidenceId, index) => {
      const normalizedEvidenceId = requireNonEmptyString(evidenceId, `${fieldName}[${index}]`);
      const evidenceKey = normalizedEvidenceId;

      if (seen.has(evidenceKey)) {
        throwInvalidInput(`Union Server Season Relation Service requires ${fieldName} entries to be unique.`);
      }

      seen.add(evidenceKey);
    });

    return evidenceIds.slice();
  }

  function validateFieldNames(source, allowedFields, entityName) {
    Object.keys(source).forEach((fieldName) => {
      if (!allowedFields.has(fieldName)) {
        throwInvalidInput(`Union Server Season Relation Service does not recognize ${entityName} field '${fieldName}'.`);
      }
    });
  }

  function composeRelationKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  function normalizeCanonicalRelation(relation, entityName) {
    requirePlainObject(relation, entityName);
    validateFieldNames(relation, CANONICAL_FIELDS, entityName);

    const prototype = Object.getPrototypeOf(relation);
    const normalizedRelation = prototype === null ? Object.create(null) : {};

    defineOwnDataProperty(normalizedRelation, "seasonId", requireNonEmptyString(relation.seasonId, `${entityName}.seasonId`));
    defineOwnDataProperty(normalizedRelation, "serverId", requireNonEmptyString(relation.serverId, `${entityName}.serverId`));
    defineOwnDataProperty(normalizedRelation, "unionId", requireNonEmptyString(relation.unionId, `${entityName}.unionId`));
    defineOwnDataProperty(
      normalizedRelation,
      "currentNativeStatusId",
      requireNonEmptyStringOrNull(relation.currentNativeStatusId, `${entityName}.currentNativeStatusId`)
    );
    defineOwnDataProperty(
      normalizedRelation,
      "currentActiveStatusId",
      requireNonEmptyStringOrNull(relation.currentActiveStatusId, `${entityName}.currentActiveStatusId`)
    );
    defineOwnDataProperty(
      normalizedRelation,
      "firstConfirmedPresenceAt",
      requireUtcTimestampOrNull(relation.firstConfirmedPresenceAt, `${entityName}.firstConfirmedPresenceAt`)
    );
    defineOwnDataProperty(
      normalizedRelation,
      "mostRecentConfirmedPresenceAt",
      requireUtcTimestampOrNull(relation.mostRecentConfirmedPresenceAt, `${entityName}.mostRecentConfirmedPresenceAt`)
    );
    defineOwnDataProperty(
      normalizedRelation,
      "evidenceIds",
      requireUniqueEvidenceIds(relation.evidenceIds, `${entityName}.evidenceIds`)
    );
    defineOwnDataProperty(normalizedRelation, "manualOverride", relation.manualOverride);

    if (normalizedRelation.manualOverride !== null) {
      throwInvalidInput(`Union Server Season Relation Service requires ${entityName}.manualOverride to be null.`);
    }

    if (normalizedRelation.firstConfirmedPresenceAt !== null
        && normalizedRelation.mostRecentConfirmedPresenceAt !== null
        && Date.parse(normalizedRelation.firstConfirmedPresenceAt) > Date.parse(normalizedRelation.mostRecentConfirmedPresenceAt)) {
      throwInvalidInput(
        `Union Server Season Relation Service requires ${entityName}.firstConfirmedPresenceAt to be earlier than or equal to ${entityName}.mostRecentConfirmedPresenceAt.`
      );
    }

    return normalizedRelation;
  }

  function normalizeRelationFilter(filter) {
    if (filter === undefined) {
      return null;
    }

    requirePlainObject(filter, "filter");
    validateFieldNames(filter, ADD_KNOWN_UNION_FIELDS, "filter");

    return {
      seasonId: Object.prototype.hasOwnProperty.call(filter, "seasonId") ? requireNonEmptyString(filter.seasonId, "filter.seasonId") : null,
      serverId: Object.prototype.hasOwnProperty.call(filter, "serverId") ? requireNonEmptyString(filter.serverId, "filter.serverId") : null,
      unionId: Object.prototype.hasOwnProperty.call(filter, "unionId") ? requireNonEmptyString(filter.unionId, "filter.unionId") : null
    };
  }

  function createUnionServerSeasonRelationService(initialRelations) {
    requireArray(initialRelations, "initialRelations");

    const state = {
      relations: [],
      relationsByKey: new Map()
    };

    initialRelations.forEach((relation, index) => {
      const canonicalRelation = normalizeCanonicalRelation(relation, `initialRelations[${index}]`);
      const relationKey = composeRelationKey(canonicalRelation.seasonId, canonicalRelation.serverId, canonicalRelation.unionId);

      if (state.relationsByKey.has(relationKey)) {
        throwDuplicateRelation(canonicalRelation.seasonId, canonicalRelation.serverId, canonicalRelation.unionId);
      }

      const storedRelation = deepClone(canonicalRelation);
      state.relations.push(storedRelation);
      state.relationsByKey.set(relationKey, storedRelation);
    });

    function requireRelationIdentity(seasonId, serverId, unionId) {
      return {
        seasonId: requireNonEmptyString(seasonId, "seasonId"),
        serverId: requireNonEmptyString(serverId, "serverId"),
        unionId: requireNonEmptyString(unionId, "unionId")
      };
    }

    function requireExistingRelation(seasonId, serverId, unionId) {
      const normalizedIdentity = requireRelationIdentity(seasonId, serverId, unionId);
      const relationKey = composeRelationKey(normalizedIdentity.seasonId, normalizedIdentity.serverId, normalizedIdentity.unionId);

      if (!state.relationsByKey.has(relationKey)) {
        throwUnknownRelation(normalizedIdentity.seasonId, normalizedIdentity.serverId, normalizedIdentity.unionId);
      }

      return state.relationsByKey.get(relationKey);
    }

    function listRelations(filter) {
      const normalizedFilter = normalizeRelationFilter(filter);
      const relations = normalizedFilter === null
        ? state.relations
        : state.relations.filter((relation) => {
            if (normalizedFilter.seasonId !== null && relation.seasonId !== normalizedFilter.seasonId) {
              return false;
            }

            if (normalizedFilter.serverId !== null && relation.serverId !== normalizedFilter.serverId) {
              return false;
            }

            if (normalizedFilter.unionId !== null && relation.unionId !== normalizedFilter.unionId) {
              return false;
            }

            return true;
          });

      return relations.map((relation) => deepClone(relation));
    }

    function getRelation(seasonId, serverId, unionId) {
      const normalizedIdentity = requireRelationIdentity(seasonId, serverId, unionId);
      const relationKey = composeRelationKey(normalizedIdentity.seasonId, normalizedIdentity.serverId, normalizedIdentity.unionId);

      if (!state.relationsByKey.has(relationKey)) {
        return null;
      }

      return deepClone(state.relationsByKey.get(relationKey));
    }

    function hasRelation(seasonId, serverId, unionId) {
      const normalizedIdentity = requireRelationIdentity(seasonId, serverId, unionId);
      const relationKey = composeRelationKey(normalizedIdentity.seasonId, normalizedIdentity.serverId, normalizedIdentity.unionId);
      return state.relationsByKey.has(relationKey);
    }

    function addKnownUnion(input) {
      requirePlainObject(input, "input");
      validateFieldNames(input, ADD_KNOWN_UNION_FIELDS, "input");

      const prototype = Object.getPrototypeOf(input);
      const canonicalRelation = prototype === null ? Object.create(null) : {};

      defineOwnDataProperty(canonicalRelation, "seasonId", requireNonEmptyString(input.seasonId, "input.seasonId"));
      defineOwnDataProperty(canonicalRelation, "serverId", requireNonEmptyString(input.serverId, "input.serverId"));
      defineOwnDataProperty(canonicalRelation, "unionId", requireNonEmptyString(input.unionId, "input.unionId"));
      defineOwnDataProperty(canonicalRelation, "currentNativeStatusId", null);
      defineOwnDataProperty(canonicalRelation, "currentActiveStatusId", null);
      defineOwnDataProperty(canonicalRelation, "firstConfirmedPresenceAt", null);
      defineOwnDataProperty(canonicalRelation, "mostRecentConfirmedPresenceAt", null);
      defineOwnDataProperty(canonicalRelation, "evidenceIds", []);
      defineOwnDataProperty(canonicalRelation, "manualOverride", null);

      const relationKey = composeRelationKey(canonicalRelation.seasonId, canonicalRelation.serverId, canonicalRelation.unionId);

      if (state.relationsByKey.has(relationKey)) {
        throwDuplicateRelation(canonicalRelation.seasonId, canonicalRelation.serverId, canonicalRelation.unionId);
      }

      const storedRelation = deepClone(canonicalRelation);
      state.relations.push(storedRelation);
      state.relationsByKey.set(relationKey, storedRelation);

      return deepClone(storedRelation);
    }

    return {
      listRelations,
      getRelation,
      hasRelation,
      addKnownUnion
    };
  }

  globalScope.createUnionServerSeasonRelationService = createUnionServerSeasonRelationService;
  globalScope.UnionServerSeasonRelationServiceError = UnionServerSeasonRelationServiceError;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createUnionServerSeasonRelationService,
      UnionServerSeasonRelationServiceError
    };
  }
})(typeof window !== "undefined" ? window : globalThis);