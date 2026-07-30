(function initializeConfirmedServerSnapshotCoordinatorFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "ownershipRecordService",
    "targetVerificationService",
    "confirmedSnapshotService"
  ]);

  const INPUT_FIELDS = new Set([
    "snapshotId",
    "serverId",
    "seasonId",
    "createdAt",
    "requiredTargetRefs",
    "unionStatusRecordIds",
    "evidenceIds",
    "creatorId",
    "reviewerId",
    "completenessRecordIds"
  ]);

  const OWNERSHIP_METHODS = [
    "listTerritoryRecords",
    "listStructureRecords"
  ];

  const VERIFICATION_METHODS = [
    "listVerifications",
    "getCurrentVerification"
  ];

  const SNAPSHOT_METHODS = [
    "getCurrentSnapshot",
    "evaluateSnapshot",
    "addConfirmedSnapshot"
  ];

  class ConfirmedServerSnapshotCoordinatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ConfirmedServerSnapshotCoordinatorError";
      this.code = code;
    }
  }

  function throwCoordinatorError(code, message) {
    throw new ConfirmedServerSnapshotCoordinatorError(code, message);
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

  function requireRecordObject(value, path) {
    if (!isRecordObject(value)) {
      throwCoordinatorError("invalid_input", `Confirmed Server Snapshot Coordinator requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireNonEmptyString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      throwCoordinatorError("invalid_input", `Confirmed Server Snapshot Coordinator requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) {
      throwCoordinatorError("invalid_input", `Confirmed Server Snapshot Coordinator requires ${path} to be an array.`);
    }
    return value;
  }

  function requireKnownFields(record, allowedFields, path) {
    const unknownFields = Object.keys(record).filter((key) => !allowedFields.has(key)).sort();
    if (unknownFields.length > 0) {
      throwCoordinatorError(
        "invalid_input",
        `Confirmed Server Snapshot Coordinator does not recognize ${path} field '${unknownFields[0]}'.`
      );
    }
  }

  function requireRequiredFields(record, requiredFields, path) {
    const fields = Array.from(requiredFields);
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throwCoordinatorError("invalid_input", `Confirmed Server Snapshot Coordinator requires ${path}.${field}.`);
      }
    }
  }

  function bindInterface(value, fieldName, methodNames) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throwCoordinatorError(
        "invalid_input",
        `Confirmed Server Snapshot Coordinator requires options.${fieldName} to be an object interface.`
      );
    }

    const output = {};
    for (let index = 0; index < methodNames.length; index += 1) {
      const methodName = methodNames[index];
      if (typeof value[methodName] !== "function") {
        throwCoordinatorError(
          "invalid_input",
          `Confirmed Server Snapshot Coordinator requires options.${fieldName}.${methodName} to be a function.`
        );
      }
      defineOwnDataProperty(output, methodName, value[methodName].bind(value));
    }
    return output;
  }

  function requireTargetRef(value, path) {
    const targetRef = requireRecordObject(value, path);
    requireNonEmptyString(targetRef.type, `${path}.type`);

    if (targetRef.type === "normal_map_cell") {
      requireKnownFields(targetRef, new Set(["type", "row", "col"]), path);
      requireRequiredFields(targetRef, new Set(["type", "row", "col"]), path);
      if (!Number.isInteger(targetRef.row) || targetRef.row < 1 || !Number.isInteger(targetRef.col) || targetRef.col < 1) {
        throwCoordinatorError("invalid_input", `Confirmed Server Snapshot Coordinator requires ${path} row and col to be positive integers.`);
      }
      return targetRef;
    }

    if (targetRef.type === "logical_structure") {
      requireKnownFields(targetRef, new Set(["type", "structureId"]), path);
      requireRequiredFields(targetRef, new Set(["type", "structureId"]), path);
      requireNonEmptyString(targetRef.structureId, `${path}.structureId`);
      return targetRef;
    }

    throwCoordinatorError(
      "invalid_input",
      `Confirmed Server Snapshot Coordinator does not support ${path}.type '${targetRef.type}'.`
    );
  }

  function requireIdArray(value, path) {
    const array = requireArray(value, path);
    const seen = new Set();
    for (let index = 0; index < array.length; index += 1) {
      const id = requireNonEmptyString(array[index], `${path}[${index}]`);
      if (seen.has(id)) {
        throwCoordinatorError("invalid_input", `Confirmed Server Snapshot Coordinator requires ${path} to contain unique IDs.`);
      }
      seen.add(id);
    }
    return array;
  }

  function targetKey(targetRef) {
    return targetRef.type === "normal_map_cell"
      ? JSON.stringify([targetRef.type, targetRef.row, targetRef.col])
      : JSON.stringify([targetRef.type, targetRef.structureId]);
  }

  function requireDependencyArray(value, methodName) {
    if (!Array.isArray(value)) {
      throwCoordinatorError(
        "inconsistent_state",
        `Confirmed Server Snapshot Coordinator requires ${methodName} to return an array.`
      );
    }
    return value;
  }

  function requireCurrentVerification(value) {
    if (!isRecordObject(value)) {
      throwCoordinatorError(
        "inconsistent_state",
        "Confirmed Server Snapshot Coordinator requires current verification results to be plain objects or null."
      );
    }
    requireNonEmptyString(value.verificationId, "currentVerification.verificationId");
    const ownershipRef = requireRecordObject(value.verifiedOwnershipRef, "currentVerification.verifiedOwnershipRef");
    requireNonEmptyString(ownershipRef.type, "currentVerification.verifiedOwnershipRef.type");
    requireNonEmptyString(ownershipRef.recordId, "currentVerification.verifiedOwnershipRef.recordId");
    return value;
  }

  function createConfirmedServerSnapshotCoordinator(options) {
    const input = requireRecordObject(options, "options");
    requireKnownFields(input, FACTORY_FIELDS, "options");
    requireRequiredFields(input, FACTORY_FIELDS, "options");

    const ownership = bindInterface(input.ownershipRecordService, "ownershipRecordService", OWNERSHIP_METHODS);
    const verification = bindInterface(input.targetVerificationService, "targetVerificationService", VERIFICATION_METHODS);
    const snapshots = bindInterface(input.confirmedSnapshotService, "confirmedSnapshotService", SNAPSHOT_METHODS);

    function normalizeInput(value) {
      const request = requireRecordObject(value, "input");
      requireKnownFields(request, INPUT_FIELDS, "input");
      requireRequiredFields(request, INPUT_FIELDS, "input");

      requireNonEmptyString(request.snapshotId, "input.snapshotId");
      requireNonEmptyString(request.serverId, "input.serverId");
      requireNonEmptyString(request.seasonId, "input.seasonId");
      requireNonEmptyString(request.createdAt, "input.createdAt");
      requireNonEmptyString(request.creatorId, "input.creatorId");
      requireNonEmptyString(request.reviewerId, "input.reviewerId");
      requireIdArray(request.unionStatusRecordIds, "input.unionStatusRecordIds");
      requireIdArray(request.evidenceIds, "input.evidenceIds");
      requireIdArray(request.completenessRecordIds, "input.completenessRecordIds");

      const requiredTargetRefs = requireArray(request.requiredTargetRefs, "input.requiredTargetRefs");
      const requiredTargetKeys = new Set();
      for (let index = 0; index < requiredTargetRefs.length; index += 1) {
        const targetRef = requireTargetRef(requiredTargetRefs[index], `input.requiredTargetRefs[${index}]`);
        const key = targetKey(targetRef);
        if (requiredTargetKeys.has(key)) {
          throwCoordinatorError(
            "invalid_input",
            "Confirmed Server Snapshot Coordinator requires input.requiredTargetRefs to contain unique targets."
          );
        }
        requiredTargetKeys.add(key);
      }

      return request;
    }

    function assembleEvaluationInput(value) {
      const request = normalizeInput(value);
      const scope = {
        serverId: request.serverId,
        seasonId: request.seasonId
      };

      const territoryOwnershipRecords = requireDependencyArray(
        ownership.listTerritoryRecords(scope),
        "ownershipRecordService.listTerritoryRecords"
      );
      const structureOwnershipRecords = requireDependencyArray(
        ownership.listStructureRecords(scope),
        "ownershipRecordService.listStructureRecords"
      );
      const verificationRecords = requireDependencyArray(
        verification.listVerifications(scope),
        "targetVerificationService.listVerifications"
      );
      const currentSnapshot = snapshots.getCurrentSnapshot(request.serverId, request.seasonId);
      if (currentSnapshot !== null && currentSnapshot !== undefined) {
        requireRecordObject(currentSnapshot, "currentSnapshot");
        requireNonEmptyString(currentSnapshot.snapshotId, "currentSnapshot.snapshotId");
      }

      const verificationRecordIds = [];
      const ownershipRecordIds = [];
      const structureOwnershipRecordIds = [];
      const seenVerificationIds = new Set();
      const seenTerritoryOwnershipIds = new Set();
      const seenStructureOwnershipIds = new Set();

      for (let index = 0; index < request.requiredTargetRefs.length; index += 1) {
        const targetRef = request.requiredTargetRefs[index];
        const currentVerification = verification.getCurrentVerification(
          request.serverId,
          request.seasonId,
          targetRef
        );

        if (!currentVerification) {
          continue;
        }

        const normalizedVerification = requireCurrentVerification(currentVerification);

        if (!seenVerificationIds.has(normalizedVerification.verificationId)) {
          seenVerificationIds.add(normalizedVerification.verificationId);
          verificationRecordIds.push(normalizedVerification.verificationId);
        }

        const ownershipRef = normalizedVerification.verifiedOwnershipRef;
        if (ownershipRef.type === "territory_ownership_record") {
          if (!seenTerritoryOwnershipIds.has(ownershipRef.recordId)) {
            seenTerritoryOwnershipIds.add(ownershipRef.recordId);
            ownershipRecordIds.push(ownershipRef.recordId);
          }
        } else if (ownershipRef.type === "structure_ownership_record") {
          if (!seenStructureOwnershipIds.has(ownershipRef.recordId)) {
            seenStructureOwnershipIds.add(ownershipRef.recordId);
            structureOwnershipRecordIds.push(ownershipRef.recordId);
          }
        } else {
          throwCoordinatorError(
            "inconsistent_state",
            `Confirmed Server Snapshot Coordinator found unsupported verified ownership type '${ownershipRef.type}'.`
          );
        }
      }

      return {
        snapshot: {
          snapshotId: request.snapshotId,
          serverId: request.serverId,
          seasonId: request.seasonId,
          createdAt: request.createdAt,
          ownershipRecordIds,
          structureOwnershipRecordIds,
          verificationRecordIds,
          unionStatusRecordIds: deepClone(request.unionStatusRecordIds),
          evidenceIds: deepClone(request.evidenceIds),
          creatorId: request.creatorId,
          reviewerId: request.reviewerId,
          completenessRecordIds: deepClone(request.completenessRecordIds),
          previousConfirmedSnapshotId: currentSnapshot ? currentSnapshot.snapshotId : null
        },
        territoryOwnershipRecords: deepClone(territoryOwnershipRecords),
        structureOwnershipRecords: deepClone(structureOwnershipRecords),
        verificationRecords: deepClone(verificationRecords),
        requiredTargetRefs: deepClone(request.requiredTargetRefs)
      };
    }

    function previewSnapshot(value) {
      return deepClone(snapshots.evaluateSnapshot(assembleEvaluationInput(value)));
    }

    function confirmSnapshot(value) {
      return deepClone(snapshots.addConfirmedSnapshot(assembleEvaluationInput(value)));
    }

    return {
      assembleEvaluationInput,
      previewSnapshot,
      confirmSnapshot
    };
  }

  const exportsObject = {
    createConfirmedServerSnapshotCoordinator,
    ConfirmedServerSnapshotCoordinatorError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
