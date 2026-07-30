(function initializeActiveUnionStatusProjectionServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "activeUnionStatusEvaluator",
    "activeUnionStatusService",
    "activityFactHistoryService"
  ]);
  const INPUT_FIELDS = new Set(["seasonId", "serverId", "unionId", "evaluatedAt"]);

  class ActiveUnionStatusProjectionServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ActiveUnionStatusProjectionServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ActiveUnionStatusProjectionServiceError(code, message);
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

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map(deepClone);
    }
    if (!isRecordObject(value)) {
      return value;
    }
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwnDataProperty(clone, key, deepClone(value[key])));
    return clone;
  }

  function requireRecord(value, path) {
    if (!isRecordObject(value)) {
      fail("invalid_input", `Active Union Status Projection Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Active Union Status Projection Service requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireFields(record, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail("invalid_input", `Active Union Status Projection Service requires ${path}.${field}.`);
      }
    });
    const unknown = Object.keys(record).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Active Union Status Projection Service does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function bindInterface(value, fieldName, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Active Union Status Projection Service requires options.${fieldName} to be an object.`);
    }
    const bound = {};
    methods.forEach((method) => {
      if (typeof value[method] !== "function") {
        fail(
          "invalid_factory",
          `Active Union Status Projection Service requires options.${fieldName}.${method} to be a function.`
        );
      }
      defineOwnDataProperty(bound, method, value[method].bind(value));
    });
    return bound;
  }

  function createActiveUnionStatusProjectionService(options) {
    const input = requireRecord(options, "options");
    requireFields(input, FACTORY_FIELDS, "options");
    const evaluator = bindInterface(input.activeUnionStatusEvaluator, "activeUnionStatusEvaluator", ["evaluate"]);
    const statusService = bindInterface(input.activeUnionStatusService, "activeUnionStatusService", ["getCurrentStatus"]);
    const factHistory = bindInterface(input.activityFactHistoryService, "activityFactHistoryService", ["getFacts"]);

    function getProjection(value) {
      const request = requireRecord(value, "input");
      requireFields(request, INPUT_FIELDS, "input");
      INPUT_FIELDS.forEach((field) => requireString(request[field], `input.${field}`));
      const currentStatus = statusService.getCurrentStatus(
        request.seasonId,
        request.serverId,
        request.unionId
      );
      const facts = factHistory.getFacts(request.seasonId, request.serverId, request.unionId);
      if (
        !isRecordObject(facts)
        || !Array.isArray(facts.confirmedPresenceFacts)
        || !Array.isArray(facts.qualifyingFullMapConfirmations)
      ) {
        fail("invalid_dependency", "Active Union Status Projection Service received invalid activity facts.");
      }

      const result = evaluator.evaluate({
        identity: {
          statusId: JSON.stringify([
            "activity_projection",
            request.seasonId,
            request.serverId,
            request.unionId,
            request.evaluatedAt
          ]),
          seasonId: request.seasonId,
          serverId: request.serverId,
          unionId: request.unionId,
          evaluatedAt: request.evaluatedAt
        },
        currentStatus: deepClone(currentStatus),
        confirmedPresenceFacts: deepClone(facts.confirmedPresenceFacts),
        qualifyingFullMapConfirmations: deepClone(facts.qualifyingFullMapConfirmations)
      });
      if (
        !isRecordObject(result)
        || typeof result.valid !== "boolean"
        || !Array.isArray(result.errors)
        || (result.valid && !isRecordObject(result.evaluation))
      ) {
        fail("invalid_dependency", "Active Union Status Projection Service received an invalid evaluator result.");
      }
      if (!result.valid) {
        return {
          valid: false,
          errors: deepClone(result.errors),
          warnings: [],
          projection: null
        };
      }

      return {
        valid: true,
        errors: [],
        warnings: [],
        projection: {
          currentStatus: deepClone(currentStatus),
          canonicalStatus: deepClone(result.evaluation.canonicalStatus),
          requiresReplacement: result.evaluation.requiresReplacement,
          verificationHealth: result.evaluation.verificationHealth,
          countedConfirmationIds: deepClone(result.evaluation.countedConfirmationIds),
          ignoredConfirmationIds: deepClone(result.evaluation.ignoredConfirmationIds),
          windowRestartCount: result.evaluation.windowRestartCount,
          evaluatedAt: request.evaluatedAt
        }
      };
    }

    return { getProjection };
  }

  const exportsObject = {
    createActiveUnionStatusProjectionService,
    ActiveUnionStatusProjectionServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
