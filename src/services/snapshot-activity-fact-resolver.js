(function initializeSnapshotActivityFactResolverFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "evaluateConfirmedServerSnapshotReferences"
  ]);

  const INPUT_FIELDS = new Set([
    "unionId",
    "snapshot",
    "territoryOwnershipRecords",
    "structureOwnershipRecords",
    "verificationRecords",
    "requiredTargetRefs"
  ]);

  class SnapshotActivityFactResolverError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "SnapshotActivityFactResolverError";
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

  function pushError(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function createResult(errors, facts) {
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      facts: errors.length === 0 ? deepClone(facts) : null
    };
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function cloneDependencyErrors(result) {
    if (
      !isRecordObject(result)
      || typeof result.valid !== "boolean"
      || !Array.isArray(result.errors)
      || !isRecordObject(result.projection)
    ) {
      throw new SnapshotActivityFactResolverError(
        "invalid_dependency",
        "Snapshot Activity Fact Resolver received an invalid snapshot reference evaluation result."
      );
    }

    return result.errors.map((error) => ({
      code: isRecordObject(error) && typeof error.code === "string" ? error.code : "UNKNOWN",
      path: isRecordObject(error) && typeof error.path === "string" ? `input.${error.path}` : "input",
      message: isRecordObject(error) && typeof error.message === "string" ? error.message : ""
    }));
  }

  function bindValidator(owner, value, fieldName) {
    if (typeof value !== "function") {
      throw new SnapshotActivityFactResolverError(
        "invalid_factory",
        `Snapshot Activity Fact Resolver requires options.${fieldName} to be a function.`
      );
    }

    return function boundValidator() {
      return value.apply(owner, arguments);
    };
  }

  function createSnapshotActivityFactResolver(options) {
    if (!isRecordObject(options)) {
      throw new SnapshotActivityFactResolverError(
        "invalid_factory",
        "Snapshot Activity Fact Resolver options must be a plain object."
      );
    }

    const unknownFields = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknownFields.length > 0) {
      throw new SnapshotActivityFactResolverError(
        "invalid_factory",
        `Snapshot Activity Fact Resolver does not recognize option '${unknownFields[0]}'.`
      );
    }

    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        throw new SnapshotActivityFactResolverError(
          "invalid_factory",
          `Snapshot Activity Fact Resolver requires option '${field}'.`
        );
      }
    });

    const evaluateConfirmedServerSnapshotReferences = bindValidator(
      options,
      options.evaluateConfirmedServerSnapshotReferences,
      "evaluateConfirmedServerSnapshotReferences"
    );

    function resolve(input) {
      const errors = [];
      const emptyFacts = {
        confirmedPresenceFacts: [],
        qualifyingFullMapConfirmations: []
      };

      if (!isRecordObject(input)) {
        pushError(errors, "invalid_input", "input", "input must be a plain object.");
        return createResult(errors, emptyFacts);
      }

      const unknownInputFields = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
      unknownInputFields.forEach((field) => {
        pushError(errors, "invalid_input", `input.${field}`, `Unknown input field '${field}'.`);
      });
      INPUT_FIELDS.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(input, field)) {
          pushError(errors, "invalid_input", `input.${field}`, `input.${field} is required.`);
        }
      });

      if (!isNonEmptyString(input.unionId)) {
        pushError(errors, "invalid_input", "input.unionId", "input.unionId must be a non-empty string.");
      }
      if (!Array.isArray(input.territoryOwnershipRecords)) {
        pushError(
          errors,
          "invalid_input",
          "input.territoryOwnershipRecords",
          "input.territoryOwnershipRecords must be an array."
        );
      }
      if (!Array.isArray(input.structureOwnershipRecords)) {
        pushError(
          errors,
          "invalid_input",
          "input.structureOwnershipRecords",
          "input.structureOwnershipRecords must be an array."
        );
      }
      if (!Array.isArray(input.verificationRecords)) {
        pushError(errors, "invalid_input", "input.verificationRecords", "input.verificationRecords must be an array.");
      }
      if (!Array.isArray(input.requiredTargetRefs)) {
        pushError(errors, "invalid_input", "input.requiredTargetRefs", "input.requiredTargetRefs must be an array.");
      }
      if (errors.length > 0) {
        return createResult(errors, emptyFacts);
      }

      let evaluationResult;
      try {
        evaluationResult = evaluateConfirmedServerSnapshotReferences({
          snapshot: deepClone(input.snapshot),
          territoryOwnershipRecords: deepClone(input.territoryOwnershipRecords),
          structureOwnershipRecords: deepClone(input.structureOwnershipRecords),
          verificationRecords: deepClone(input.verificationRecords),
          requiredTargetRefs: deepClone(input.requiredTargetRefs)
        });
      } catch (error) {
        throw new SnapshotActivityFactResolverError(
          "invalid_dependency",
          "Snapshot Activity Fact Resolver snapshot reference evaluator threw."
        );
      }

      errors.push(...cloneDependencyErrors(evaluationResult));
      if (errors.length > 0) {
        return createResult(errors, emptyFacts);
      }

      const snapshot = input.snapshot;
      const projection = evaluationResult.projection;
      const ownershipById = new Map();
      input.territoryOwnershipRecords.forEach((record) => {
        ownershipById.set(record.ownershipRecordId, record);
      });
      const verificationById = new Map();
      input.verificationRecords.forEach((record) => {
        verificationById.set(record.verificationId, record);
      });

      const selectedVerificationsByOwnershipId = new Map();
      snapshot.verificationRecordIds.forEach((verificationId, index) => {
        const record = verificationById.get(verificationId);
        const path = `input.snapshot.verificationRecordIds[${index}]`;
        if (!record) {
          pushError(errors, "missing_reference", path, `${path} does not resolve to a verification record.`);
          return;
        }
        if (record.serverId !== snapshot.serverId || record.seasonId !== snapshot.seasonId) {
          pushError(errors, "scope_mismatch", path, `${path} must reference the snapshot server and season.`);
          return;
        }
        if (record.reviewState !== "confirmed" || record.supersededBy !== null) {
          pushError(errors, "invalid_record_state", path, `${path} must reference a current confirmed verification.`);
          return;
        }
        if (record.verifiedOwnershipRef.type !== "territory_ownership_record") {
          return;
        }
        const ownershipId = record.verifiedOwnershipRef.recordId;
        if (!selectedVerificationsByOwnershipId.has(ownershipId)) {
          selectedVerificationsByOwnershipId.set(ownershipId, []);
        }
        selectedVerificationsByOwnershipId.get(ownershipId).push(record);
      });

      const confirmedPresenceFacts = [];
      snapshot.ownershipRecordIds.forEach((ownershipRecordId, index) => {
        const record = ownershipById.get(ownershipRecordId);
        const path = `input.snapshot.ownershipRecordIds[${index}]`;
        if (!record) {
          pushError(errors, "missing_reference", path, `${path} does not resolve to a territory ownership record.`);
          return;
        }
        if (record.serverId !== snapshot.serverId || record.seasonId !== snapshot.seasonId) {
          pushError(errors, "scope_mismatch", path, `${path} must reference the snapshot server and season.`);
          return;
        }
        if (record.reviewState !== "confirmed" || record.supersededBy !== null) {
          pushError(errors, "invalid_record_state", path, `${path} must reference current confirmed ownership.`);
          return;
        }

        const matchingVerifications = selectedVerificationsByOwnershipId.get(ownershipRecordId) || [];
        if (matchingVerifications.length !== 1) {
          pushError(
            errors,
            "invalid_reference_set",
            path,
            `${path} must have exactly one selected verification for the same ownership record.`
          );
          return;
        }

        if (record.ownershipState === "owned" && record.ownerUnionId === input.unionId) {
          confirmedPresenceFacts.push({
            factId: JSON.stringify(["confirmed_presence", snapshot.snapshotId, ownershipRecordId]),
            unionId: input.unionId,
            serverId: snapshot.serverId,
            seasonId: snapshot.seasonId,
            observedAt: matchingVerifications[0].observedAt,
            ownershipRecordId,
            snapshotId: snapshot.snapshotId
          });
        }
      });

      if (errors.length > 0) {
        return createResult(errors, emptyFacts);
      }

      const qualifyingFullMapConfirmations = [];
      if (projection.qualifiesAsFullMapConfirmation) {
        qualifyingFullMapConfirmations.push({
          snapshotId: snapshot.snapshotId,
          unionId: input.unionId,
          serverId: snapshot.serverId,
          seasonId: snapshot.seasonId,
          fullConfirmationAt: projection.fullConfirmationAt,
          ownedTerritoryCount: confirmedPresenceFacts.length
        });
      }

      return createResult(errors, {
        confirmedPresenceFacts,
        qualifyingFullMapConfirmations
      });
    }

    return { resolve };
  }

  const exportsObject = {
    createSnapshotActivityFactResolver,
    SnapshotActivityFactResolverError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
