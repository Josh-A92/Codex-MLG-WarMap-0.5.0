(function initializeUnionServerSeasonIntelligenceViewServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "unionServerSeasonViewService",
    "activeStatusProjectionService"
  ]);
  const LIST_FIELDS = new Set(["seasonId", "serverId", "evaluatedAt"]);

  class UnionServerSeasonIntelligenceViewServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionServerSeasonIntelligenceViewServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new UnionServerSeasonIntelligenceViewServiceError(code, message);
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map(deepClone);
    }
    if (!isRecordObject(value)) {
      return value;
    }
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
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

  function requireRecord(value, path) {
    if (!isRecordObject(value)) {
      fail("invalid_input", `Union Server Season Intelligence View Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Union Server Season Intelligence View Service requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireFields(record, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail("invalid_input", `Union Server Season Intelligence View Service requires ${path}.${field}.`);
      }
    });
    const unknown = Object.keys(record).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Union Server Season Intelligence View Service does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function bindInterface(value, fieldName, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Union Server Season Intelligence View Service requires options.${fieldName} to be an object.`);
    }
    const bound = {};
    methods.forEach((method) => {
      if (typeof value[method] !== "function") {
        fail(
          "invalid_factory",
          `Union Server Season Intelligence View Service requires options.${fieldName}.${method} to be a function.`
        );
      }
      bound[method] = value[method].bind(value);
    });
    return bound;
  }

  function createUnionServerSeasonIntelligenceViewService(options) {
    const input = requireRecord(options, "options");
    requireFields(input, FACTORY_FIELDS, "options");
    const baseViews = bindInterface(
      input.unionServerSeasonViewService,
      "unionServerSeasonViewService",
      ["getView", "listViews"]
    );
    const activity = bindInterface(
      input.activeStatusProjectionService,
      "activeStatusProjectionService",
      ["getProjection"]
    );

    function compose(baseView, evaluatedAt) {
      if (
        !isRecordObject(baseView)
        || !isRecordObject(baseView.relation)
        || !isRecordObject(baseView.unionIdentity)
        || (
          baseView.currentNativeAssignment !== null
          && !isRecordObject(baseView.currentNativeAssignment)
        )
        || typeof baseView.relation.seasonId !== "string"
        || typeof baseView.relation.serverId !== "string"
        || typeof baseView.relation.unionId !== "string"
      ) {
        fail("invalid_dependency", "Union Server Season Intelligence View Service received an invalid base view.");
      }
      const projectionResult = activity.getProjection({
        seasonId: baseView.relation.seasonId,
        serverId: baseView.relation.serverId,
        unionId: baseView.relation.unionId,
        evaluatedAt
      });
      if (
        !isRecordObject(projectionResult)
        || typeof projectionResult.valid !== "boolean"
        || !Array.isArray(projectionResult.errors)
        || (projectionResult.valid && !isRecordObject(projectionResult.projection))
      ) {
        fail("invalid_dependency", "Union Server Season Intelligence View Service received an invalid activity projection.");
      }
      return {
        valid: projectionResult.valid,
        errors: deepClone(projectionResult.errors),
        warnings: [],
        view: projectionResult.valid
          ? {
              relation: deepClone(baseView.relation),
              unionIdentity: deepClone(baseView.unionIdentity),
              currentNativeAssignment: deepClone(baseView.currentNativeAssignment),
              activity: deepClone(projectionResult.projection)
            }
          : null
      };
    }

    function getView(seasonId, serverId, unionId, evaluatedAt) {
      [seasonId, serverId, unionId, evaluatedAt].forEach((value, index) => {
        requireString(value, ["seasonId", "serverId", "unionId", "evaluatedAt"][index]);
      });
      const baseView = baseViews.getView(seasonId, serverId, unionId);
      if (baseView !== null && !isRecordObject(baseView)) {
        fail("invalid_dependency", "Union Server Season Intelligence View Service received an invalid base view.");
      }
      return baseView === null ? null : compose(baseView, evaluatedAt);
    }

    function listViews(value) {
      const request = requireRecord(value, "input");
      requireFields(request, LIST_FIELDS, "input");
      LIST_FIELDS.forEach((field) => requireString(request[field], `input.${field}`));
      const listedViews = baseViews.listViews({
        seasonId: request.seasonId,
        serverId: request.serverId
      });
      if (!Array.isArray(listedViews)) {
        fail("invalid_dependency", "Union Server Season Intelligence View Service received an invalid base view list.");
      }
      return listedViews.map((baseView) => compose(baseView, request.evaluatedAt));
    }

    return { getView, listViews };
  }

  const exportsObject = {
    createUnionServerSeasonIntelligenceViewService,
    UnionServerSeasonIntelligenceViewServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
