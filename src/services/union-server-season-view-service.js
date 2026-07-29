(function initializeUnionServerSeasonViewServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "unionRegistryService",
    "relationService",
    "nativeAssignmentService"
  ]);

  class UnionServerSeasonViewServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionServerSeasonViewServiceError";
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

  function createServiceError(code, message) {
    return new UnionServerSeasonViewServiceError(code, message);
  }

  function throwInvalidInput(message) {
    throw createServiceError("invalid_input", message);
  }

  function throwInconsistentState(message) {
    throw createServiceError("inconsistent_state", message);
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
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });

    return clone;
  }

  function requireFactoryOptions(value) {
    if (!isPlainObject(value)) {
      throwInvalidInput("Union Server Season View Service requires input to be a plain object.");
    }

    const keys = Object.keys(value);
    const unknownFields = keys.filter((key) => !FACTORY_FIELDS.has(key)).sort();

    if (unknownFields.length > 0) {
      throwInvalidInput(`Union Server Season View Service does not recognize input field '${unknownFields[0]}'.`);
    }

    for (const fieldName of FACTORY_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, fieldName)) {
        throwInvalidInput(`Union Server Season View Service requires input.${fieldName}.`);
      }
    }

    return value;
  }

  function requireDependencyObject(value, fieldName) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throwInvalidInput(`Union Server Season View Service requires ${fieldName} to be an object.`);
    }

    return value;
  }

  function requireBoundMethod(owner, methodName, fieldName) {
    if (typeof owner[methodName] !== "function") {
      throwInvalidInput(`Union Server Season View Service requires ${fieldName}.${methodName} to be a function.`);
    }

    const method = owner[methodName];
    return function boundDependencyMethod() {
      return method.apply(owner, arguments);
    };
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
      throwInvalidInput(`Union Server Season View Service requires ${fieldName} to be a non-empty string.`);
    }

    return value;
  }

  function createView(relation, unionIdentity, currentNativeAssignment) {
    return {
      relation: deepClone(relation),
      unionIdentity: deepClone(unionIdentity),
      currentNativeAssignment: currentNativeAssignment === null ? null : deepClone(currentNativeAssignment)
    };
  }

  function createUnionServerSeasonViewService(input) {
    const options = requireFactoryOptions(input);

    const unionRegistryService = requireDependencyObject(options.unionRegistryService, "input.unionRegistryService");
    const relationService = requireDependencyObject(options.relationService, "input.relationService");
    const nativeAssignmentService = requireDependencyObject(options.nativeAssignmentService, "input.nativeAssignmentService");

    const getUnionIdentity = requireBoundMethod(unionRegistryService, "getUnionIdentity", "input.unionRegistryService");
    const getRelation = requireBoundMethod(relationService, "getRelation", "input.relationService");
    const listRelations = requireBoundMethod(relationService, "listRelations", "input.relationService");
    const getCurrentAssignment = requireBoundMethod(nativeAssignmentService, "getCurrentAssignment", "input.nativeAssignmentService");

    function resolveViewFromRelation(relation) {
      const unionIdentity = getUnionIdentity(relation.unionId);

      if (unionIdentity === null) {
        throwInconsistentState(
          `Union Server Season View Service found relationship '${relation.seasonId} / ${relation.serverId} / ${relation.unionId}' without a canonical union identity.`
        );
      }

      const currentNativeAssignment = getCurrentAssignment(relation.seasonId, relation.serverId, relation.unionId);
      return createView(relation, unionIdentity, currentNativeAssignment);
    }

    function getView(seasonId, serverId, unionId) {
      const normalizedSeasonId = requireNonEmptyString(seasonId, "seasonId");
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      const normalizedUnionId = requireNonEmptyString(unionId, "unionId");

      const relation = getRelation(normalizedSeasonId, normalizedServerId, normalizedUnionId);
      if (relation === null) {
        return null;
      }

      return resolveViewFromRelation(relation);
    }

    function listViews(filter) {
      const relations = listRelations(filter);
      return relations.map((relation) => resolveViewFromRelation(relation));
    }

    return {
      getView,
      listViews
    };
  }

  const exportsObject = {
    createUnionServerSeasonViewService,
    UnionServerSeasonViewServiceError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
