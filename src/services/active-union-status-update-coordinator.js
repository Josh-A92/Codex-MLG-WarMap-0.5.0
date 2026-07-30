(function initializeActiveUnionStatusUpdateCoordinatorFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "snapshotActivityFactResolver",
    "activeUnionStatusEvaluator",
    "activeUnionStatusService",
    "activityFactHistoryService",
    "relationService"
  ]);

  const INPUT_FIELDS = new Set([
    "identity",
    "snapshotFactInput"
  ]);

  class ActiveUnionStatusUpdateCoordinatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ActiveUnionStatusUpdateCoordinatorError";
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

  function isRecordObject(value) {
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
    if (!isRecordObject(value)) {
      return value;
    }
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });
    return clone;
  }

  function throwCoordinatorError(code, message) {
    throw new ActiveUnionStatusUpdateCoordinatorError(code, message);
  }

  function requireRecordObject(value, path) {
    if (!isRecordObject(value)) {
      throwCoordinatorError("invalid_input", `Active Union Status Update Coordinator requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) {
      throwCoordinatorError("invalid_input", `Active Union Status Update Coordinator requires ${path} to be an array.`);
    }
    return value;
  }

  function requireNonEmptyString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      throwCoordinatorError("invalid_input", `Active Union Status Update Coordinator requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireKnownFields(record, fields, path) {
    const unknown = Object.keys(record).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      throwCoordinatorError(
        "invalid_input",
        `Active Union Status Update Coordinator does not recognize ${path} field '${unknown[0]}'.`
      );
    }
  }

  function requireFields(record, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throwCoordinatorError("invalid_input", `Active Union Status Update Coordinator requires ${path}.${field}.`);
      }
    });
  }

  function bindInterface(value, fieldName, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throwCoordinatorError(
        "invalid_factory",
        `Active Union Status Update Coordinator requires options.${fieldName} to be an object interface.`
      );
    }
    const output = {};
    methods.forEach((method) => {
      if (typeof value[method] !== "function") {
        throwCoordinatorError(
          "invalid_factory",
          `Active Union Status Update Coordinator requires options.${fieldName}.${method} to be a function.`
        );
      }
      defineOwnDataProperty(output, method, value[method].bind(value));
    });
    return output;
  }

  function validateResult(result, fieldName, payloadField) {
    if (
      !isRecordObject(result)
      || typeof result.valid !== "boolean"
      || !Array.isArray(result.errors)
      || (result.valid && !isRecordObject(result[payloadField]))
    ) {
      throwCoordinatorError(
        "invalid_dependency",
        `Active Union Status Update Coordinator received an invalid ${fieldName} result.`
      );
    }
  }

  function prefixErrors(errors, prefix) {
    return errors.map((error) => ({
      code: isRecordObject(error) && typeof error.code === "string" ? error.code : "UNKNOWN",
      path: isRecordObject(error) && typeof error.path === "string" && error.path
        ? `${prefix}.${error.path}`
        : prefix,
      message: isRecordObject(error) && typeof error.message === "string" ? error.message : ""
    }));
  }

  function createActiveUnionStatusUpdateCoordinator(options) {
    const input = requireRecordObject(options, "options");
    requireKnownFields(input, FACTORY_FIELDS, "options");
    requireFields(input, FACTORY_FIELDS, "options");

    const resolver = bindInterface(
      input.snapshotActivityFactResolver,
      "snapshotActivityFactResolver",
      ["resolve"]
    );
    const evaluator = bindInterface(
      input.activeUnionStatusEvaluator,
      "activeUnionStatusEvaluator",
      ["evaluate"]
    );
    const statusService = bindInterface(
      input.activeUnionStatusService,
      "activeUnionStatusService",
      ["getCurrentStatus", "appendDerivedStatus"]
    );
    const factHistoryService = bindInterface(
      input.activityFactHistoryService,
      "activityFactHistoryService",
      ["getFacts", "validateResolvedFacts", "appendResolvedFacts"]
    );
    const relationService = bindInterface(
      input.relationService,
      "relationService",
      ["hasRelation", "validateActiveStatusProjection", "updateActiveStatusProjection"]
    );

    function processSnapshot(value) {
      const request = requireRecordObject(value, "input");
      requireKnownFields(request, INPUT_FIELDS, "input");
      requireFields(request, INPUT_FIELDS, "input");
      const identity = requireRecordObject(request.identity, "input.identity");
      ["statusId", "unionId", "serverId", "seasonId", "evaluatedAt"].forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(identity, field)) {
          throwCoordinatorError("invalid_input", `Active Union Status Update Coordinator requires input.identity.${field}.`);
        }
        requireNonEmptyString(identity[field], `input.identity.${field}`);
      });
      requireRecordObject(request.snapshotFactInput, "input.snapshotFactInput");

      const resolved = resolver.resolve(deepClone(request.snapshotFactInput));
      validateResult(resolved, "fact resolver", "facts");
      if (!resolved.valid) {
        return {
          valid: false,
          errors: prefixErrors(resolved.errors, "input.snapshotFactInput"),
          warnings: [],
          update: null
        };
      }

      let priorFacts;
      try {
        priorFacts = factHistoryService.getFacts(
          identity.seasonId,
          identity.serverId,
          identity.unionId
        );
        validateResult({ valid: true, errors: [], facts: priorFacts }, "fact history", "facts");
        factHistoryService.validateResolvedFacts(deepClone(resolved.facts));
      } catch (error) {
        throwCoordinatorError(
          "invalid_dependency",
          "Active Union Status Update Coordinator could not validate activity fact history."
        );
      }

      const currentStatus = statusService.getCurrentStatus(
        identity.seasonId,
        identity.serverId,
        identity.unionId
      );
      const evaluation = evaluator.evaluate({
        identity: deepClone(identity),
        currentStatus: deepClone(currentStatus),
        confirmedPresenceFacts: deepClone(priorFacts.confirmedPresenceFacts).concat(
          deepClone(resolved.facts.confirmedPresenceFacts)
        ),
        qualifyingFullMapConfirmations: deepClone(priorFacts.qualifyingFullMapConfirmations).concat(
          deepClone(resolved.facts.qualifyingFullMapConfirmations)
        )
      });
      validateResult(evaluation, "status evaluator", "evaluation");
      if (!evaluation.valid) {
        return {
          valid: false,
          errors: prefixErrors(evaluation.errors, "evaluation"),
          warnings: [],
          update: null
        };
      }

      let appendedStatus = null;
      if (evaluation.evaluation.requiresReplacement) {
        if (!relationService.hasRelation(identity.seasonId, identity.serverId, identity.unionId)) {
          throwCoordinatorError(
            "inconsistent_state",
            "Active Union Status Update Coordinator requires an existing union/server/season relation."
          );
        }
        const projectionInput = {
          statusId: evaluation.evaluation.canonicalStatus.statusId,
          unionId: evaluation.evaluation.canonicalStatus.unionId,
          serverId: evaluation.evaluation.canonicalStatus.serverId,
          seasonId: evaluation.evaluation.canonicalStatus.seasonId,
          reviewState: evaluation.evaluation.canonicalStatus.reviewState,
          effectiveTo: evaluation.evaluation.canonicalStatus.effectiveTo,
          supersededBy: evaluation.evaluation.canonicalStatus.supersededBy,
          firstConfirmedPresenceAt: evaluation.evaluation.canonicalStatus.firstConfirmedPresenceAt,
          mostRecentConfirmedPresenceAt: evaluation.evaluation.canonicalStatus.mostRecentConfirmedPresenceAt
        };
        relationService.validateActiveStatusProjection(deepClone(projectionInput));
        appendedStatus = statusService.appendDerivedStatus(
          deepClone(evaluation.evaluation.canonicalStatus)
        );
        relationService.updateActiveStatusProjection(deepClone(projectionInput));
      }
      factHistoryService.appendResolvedFacts(deepClone(resolved.facts));

      return {
        valid: true,
        errors: [],
        warnings: [],
        update: {
          requiresReplacement: evaluation.evaluation.requiresReplacement,
          appendedStatus: deepClone(appendedStatus),
          canonicalStatus: deepClone(evaluation.evaluation.canonicalStatus),
          verificationHealth: evaluation.evaluation.verificationHealth,
          countedConfirmationIds: deepClone(evaluation.evaluation.countedConfirmationIds),
          ignoredConfirmationIds: deepClone(evaluation.evaluation.ignoredConfirmationIds),
          windowRestartCount: evaluation.evaluation.windowRestartCount,
          resolvedFacts: deepClone(resolved.facts)
        }
      };
    }

    return { processSnapshot };
  }

  const exportsObject = {
    createActiveUnionStatusUpdateCoordinator,
    ActiveUnionStatusUpdateCoordinatorError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
