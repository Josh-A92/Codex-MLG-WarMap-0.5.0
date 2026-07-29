(function initializeUnionRegistryServiceFactory(globalScope) {
  const ALLOWED_REGISTRY_STATUS = new Set(["current", "archived"]);
  const CANONICAL_FIELDS = new Set([
    "unionId",
    "displayName",
    "tag",
    "aliases",
    "defaultColor",
    "presentationMetadata",
    "registryStatus"
  ]);
  const UPDATE_FIELDS = new Set([
    "displayName",
    "tag",
    "aliases",
    "defaultColor",
    "presentationMetadata"
  ]);

  class UnionRegistryServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionRegistryServiceError";
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
      return value.map((item) => deepClone(item));
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

  function getValueType(value) {
    if (value === null) {
      return "null";
    }

    if (Array.isArray(value)) {
      return "array";
    }

    return typeof value;
  }

  function formatMetadataPath(parentPath, segment) {
    if (!parentPath) {
      return segment;
    }

    return segment.startsWith("[") ? `${parentPath}${segment}` : `${parentPath}.${segment}`;
  }

  function validateAndCloneStructuredMetadata(value, fieldPath, seen) {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received non-finite number.`);
      }

      return value;
    }

    if (typeof value === "undefined") {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received undefined.`);
    }

    if (typeof value === "bigint") {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received bigint.`);
    }

    if (typeof value === "symbol") {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received symbol.`);
    }

    if (typeof value === "function") {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received function.`);
    }

    if (value instanceof Date) {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received Date.`);
    }

    if (value instanceof Map) {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received Map.`);
    }

    if (value instanceof Set) {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received Set.`);
    }

    if (!isPlainObject(value) && !Array.isArray(value)) {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received ${getValueType(value)}.`);
    }

    if (seen.has(value)) {
      throwInvalidInput(`Union Registry Service requires ${fieldPath} to be JSON-compatible; received cyclic reference.`);
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const clone = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        clone[index] = validateAndCloneStructuredMetadata(value[index], formatMetadataPath(fieldPath, `[${index}]`), seen);
      }

      seen.delete(value);
      return clone;
    }

    const prototype = Object.getPrototypeOf(value);
    const clone = prototype === null ? Object.create(null) : {};

    Object.keys(value).forEach((key) => {
      defineOwnDataProperty(
        clone,
        key,
        validateAndCloneStructuredMetadata(value[key], formatMetadataPath(fieldPath, key), seen)
      );
    });

    seen.delete(value);
    return clone;
  }

  function createServiceError(code, message) {
    return new UnionRegistryServiceError(code, message);
  }

  function throwInvalidInput(message) {
    throw createServiceError("invalid_input", message);
  }

  function throwDuplicateUnionId(unionId) {
    throw createServiceError("duplicate_union_id", `Union Registry Service requires unionId '${unionId}' to be unique.`);
  }

  function throwImmutableFieldChange(fieldName) {
    throw createServiceError("immutable_field_change", `Union Registry Service does not allow ${fieldName} to be changed.`);
  }

  function throwUnknownUnion(unionId) {
    throw createServiceError("unknown_union", `Union Registry Service could not find union '${unionId}'.`);
  }

  function requirePlainObject(value, fieldName) {
    if (!isPlainObject(value)) {
      throwInvalidInput(`Union Registry Service requires ${fieldName} to be a plain object.`);
    }

    return value;
  }

  function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
      throwInvalidInput(`Union Registry Service requires ${fieldName} to be an array.`);
    }

    return value;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
      throwInvalidInput(`Union Registry Service requires ${fieldName} to be a non-empty string.`);
    }

    return value;
  }

  function requireColor(value, fieldName) {
    const color = requireNonEmptyString(value, fieldName);

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throwInvalidInput(`Union Registry Service requires ${fieldName} to be a #RRGGBB string.`);
    }

    return color;
  }

  function requireAliases(value, fieldName) {
    const aliases = requireArray(value, fieldName);
    const seen = new Set();

    aliases.forEach((alias, index) => {
      const normalizedAlias = requireNonEmptyString(alias, `${fieldName}[${index}]`);
      const aliasKey = normalizedAlias.toLowerCase();

      if (seen.has(aliasKey)) {
        throwInvalidInput(`Union Registry Service requires ${fieldName} entries to be unique case-insensitively.`);
      }

      seen.add(aliasKey);
    });

    return aliases.slice();
  }

  function validateFieldNames(source, allowedFields, entityName) {
    Object.keys(source).forEach((fieldName) => {
      if (!allowedFields.has(fieldName)) {
        throwInvalidInput(`Union Registry Service does not recognize ${entityName} field '${fieldName}'.`);
      }
    });
  }

  function normalizeCanonicalIdentity(identity, entityName) {
    requirePlainObject(identity, entityName);
    validateFieldNames(identity, CANONICAL_FIELDS, entityName);

    const registryStatus = Object.prototype.hasOwnProperty.call(identity, "registryStatus")
      ? requireNonEmptyString(identity.registryStatus, `${entityName}.registryStatus`)
      : "current";

    if (!ALLOWED_REGISTRY_STATUS.has(registryStatus)) {
      throwInvalidInput(`Union Registry Service requires ${entityName}.registryStatus to be current or archived.`);
    }

    return {
      unionId: requireNonEmptyString(identity.unionId, `${entityName}.unionId`),
      displayName: requireNonEmptyString(identity.displayName, `${entityName}.displayName`),
      tag: requireNonEmptyString(identity.tag, `${entityName}.tag`),
      aliases: requireAliases(identity.aliases, `${entityName}.aliases`),
      defaultColor: requireColor(identity.defaultColor, `${entityName}.defaultColor`),
      presentationMetadata: validateAndCloneStructuredMetadata(
        requirePlainObject(identity.presentationMetadata, `${entityName}.presentationMetadata`),
        `${entityName}.presentationMetadata`,
        new Set()
      ),
      registryStatus
    };
  }

  function createUnionRegistryService(initialIdentities) {
    requireArray(initialIdentities, "initialIdentities");

    const state = {
      identities: [],
      identitiesById: new Map()
    };

    initialIdentities.forEach((identity, index) => {
      const canonicalIdentity = normalizeCanonicalIdentity(identity, `initialIdentities[${index}]`);

      if (state.identitiesById.has(canonicalIdentity.unionId)) {
        throwDuplicateUnionId(canonicalIdentity.unionId);
      }

      const storedIdentity = deepClone(canonicalIdentity);
      state.identities.push(storedIdentity);
      state.identitiesById.set(storedIdentity.unionId, storedIdentity);
    });

    function requireUnionId(unionId) {
      return requireNonEmptyString(unionId, "unionId");
    }

    function requireStoredIdentity(unionId) {
      const normalizedUnionId = requireUnionId(unionId);

      if (!state.identitiesById.has(normalizedUnionId)) {
        throwUnknownUnion(normalizedUnionId);
      }

      return state.identitiesById.get(normalizedUnionId);
    }

    function normalizeListOptions(options) {
      if (options === undefined) {
        return { includeArchived: false };
      }

      requirePlainObject(options, "options");
      validateFieldNames(options, new Set(["includeArchived"]), "options");

      if (Object.prototype.hasOwnProperty.call(options, "includeArchived") && typeof options.includeArchived !== "boolean") {
        throwInvalidInput("Union Registry Service requires options.includeArchived to be a boolean.");
      }

      return {
        includeArchived: options.includeArchived === true
      };
    }

    function listUnionIdentities(options) {
      const normalizedOptions = normalizeListOptions(options);
      const identities = normalizedOptions.includeArchived
        ? state.identities
        : state.identities.filter((identity) => identity.registryStatus === "current");

      return identities.map((identity) => deepClone(identity));
    }

    function getUnionIdentity(unionId) {
      const normalizedUnionId = requireUnionId(unionId);

      if (!state.identitiesById.has(normalizedUnionId)) {
        return null;
      }

      return deepClone(state.identitiesById.get(normalizedUnionId));
    }

    function hasUnionIdentity(unionId) {
      const normalizedUnionId = requireUnionId(unionId);
      return state.identitiesById.has(normalizedUnionId);
    }

    function createUnionIdentity(identity) {
      const canonicalIdentity = normalizeCanonicalIdentity(identity, "identity");

      if (state.identitiesById.has(canonicalIdentity.unionId)) {
        throwDuplicateUnionId(canonicalIdentity.unionId);
      }

      const storedIdentity = deepClone(canonicalIdentity);
      state.identities.push(storedIdentity);
      state.identitiesById.set(storedIdentity.unionId, storedIdentity);

      return deepClone(storedIdentity);
    }

    function normalizeUpdateChanges(changes) {
      requirePlainObject(changes, "changes");

      if (Object.prototype.hasOwnProperty.call(changes, "unionId")) {
        throwImmutableFieldChange("unionId");
      }

      if (Object.prototype.hasOwnProperty.call(changes, "registryStatus")) {
        throwImmutableFieldChange("registryStatus");
      }

      validateFieldNames(changes, UPDATE_FIELDS, "changes");
      return changes;
    }

    function replaceStoredIdentity(unionId, replacementIdentity) {
      const existingIdentity = state.identitiesById.get(unionId);
      const index = state.identities.indexOf(existingIdentity);

      if (index === -1) {
        throwUnknownUnion(unionId);
      }

      const storedIdentity = deepClone(replacementIdentity);
      state.identities[index] = storedIdentity;
      state.identitiesById.set(unionId, storedIdentity);

      return deepClone(storedIdentity);
    }

    function updateUnionIdentity(unionId, changes) {
      const existingIdentity = requireStoredIdentity(unionId);
      const normalizedChanges = normalizeUpdateChanges(changes);
      const nextIdentity = deepClone(existingIdentity);

      Object.keys(normalizedChanges).forEach((fieldName) => {
        nextIdentity[fieldName] = deepClone(normalizedChanges[fieldName]);
      });

      const canonicalNextIdentity = normalizeCanonicalIdentity(nextIdentity, "identity");

      if (canonicalNextIdentity.unionId !== existingIdentity.unionId) {
        throwImmutableFieldChange("unionId");
      }

      return replaceStoredIdentity(existingIdentity.unionId, canonicalNextIdentity);
    }

    function setRegistryStatus(unionId, nextStatus) {
      const existingIdentity = requireStoredIdentity(unionId);

      if (existingIdentity.registryStatus === nextStatus) {
        return deepClone(existingIdentity);
      }

      const replacementIdentity = deepClone(existingIdentity);
      replacementIdentity.registryStatus = nextStatus;

      const canonicalReplacement = normalizeCanonicalIdentity(replacementIdentity, "identity");
      return replaceStoredIdentity(existingIdentity.unionId, canonicalReplacement);
    }

    function archiveUnionIdentity(unionId) {
      return setRegistryStatus(unionId, "archived");
    }

    function restoreUnionIdentity(unionId) {
      return setRegistryStatus(unionId, "current");
    }

    return {
      listUnionIdentities,
      getUnionIdentity,
      hasUnionIdentity,
      createUnionIdentity,
      updateUnionIdentity,
      archiveUnionIdentity,
      restoreUnionIdentity
    };
  }

  globalScope.createUnionRegistryService = createUnionRegistryService;
  globalScope.UnionRegistryServiceError = UnionRegistryServiceError;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createUnionRegistryService,
      UnionRegistryServiceError
    };
  }
})(typeof window !== "undefined" ? window : globalThis);