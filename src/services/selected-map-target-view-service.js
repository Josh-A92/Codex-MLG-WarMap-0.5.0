(function initializeSelectedMapTargetViewServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "ownershipRecordService",
    "targetVerificationService",
    "unionRegistryService",
    "gameRulesEngine"
  ]);
  const TERRITORY_FIELDS = new Set(["seasonId", "serverId", "row", "col", "territoryRef"]);
  const STRUCTURE_FIELDS = new Set([
    "seasonId", "serverId", "structureId", "structureCode"
  ]);

  class SelectedMapTargetViewServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "SelectedMapTargetViewServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new SelectedMapTargetViewServiceError(code, message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(output, key, {
        value: clone(value[key]),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });
    return output;
  }

  function exact(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `Selected Map Target View Service requires ${path}.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Selected Map Target View Service does not recognize ${path}.${unknown[0]}.`);
    }
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_input", `Selected Map Target View Service requires ${path}.${field}.`);
      }
    });
    return value;
  }

  function requiredString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Selected Map Target View Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function positiveInteger(value, path) {
    if (!Number.isInteger(value) || value < 1) {
      fail("invalid_input", `Selected Map Target View Service requires ${path} to be a positive integer.`);
    }
    return value;
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Selected Map Target View Service requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Selected Map Target View Service requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function createSelectedMapTargetViewService(options) {
    const input = exact(options, FACTORY_FIELDS, "options");
    const ownership = bindInterface(
      input.ownershipRecordService,
      "options.ownershipRecordService",
      ["getCurrentTerritoryRecord", "getCurrentStructureRecord"]
    );
    const verification = bindInterface(
      input.targetVerificationService,
      "options.targetVerificationService",
      ["getCurrentVerification"]
    );
    const registry = bindInterface(
      input.unionRegistryService,
      "options.unionRegistryService",
      ["getUnionIdentity"]
    );
    const rules = bindInterface(
      input.gameRulesEngine,
      "options.gameRulesEngine",
      ["getStructureCatalog", "getStructureResourceProfile"]
    );

    function buildView(targetRef, currentOwnershipRecord, structureCode) {
      const currentVerification = verification.getCurrentVerification(
        currentOwnershipRecord ? currentOwnershipRecord.serverId : targetRef.serverId,
        currentOwnershipRecord ? currentOwnershipRecord.seasonId : targetRef.seasonId,
        targetRef.value
      );
      const ownerUnionId = currentOwnershipRecord
        && currentOwnershipRecord.ownershipState === "owned"
        ? currentOwnershipRecord.ownerUnionId
        : null;
      const unionIdentity = ownerUnionId === null
        ? null
        : registry.getUnionIdentity(ownerUnionId);
      let structureMetadata = null;
      let seasonDefinedValues = null;
      if (structureCode !== null) {
        structureMetadata = rules.getStructureCatalog().find((entry) => (
          entry && (entry.code === structureCode || entry.type === structureCode)
        )) || null;
        seasonDefinedValues = rules.getStructureResourceProfile(structureCode);
      }

      return {
        target: clone(targetRef.value),
        structureMetadata: clone(structureMetadata),
        currentOwnershipRecord: clone(currentOwnershipRecord),
        currentUnionIdentity: clone(unionIdentity),
        lastConfirmedAt: currentVerification ? currentVerification.observedAt : null,
        lastOwnershipChangeAt: currentOwnershipRecord
          ? currentOwnershipRecord.effectiveAt
          : null,
        confirmationState: currentVerification
          ? "confirmed"
          : (currentOwnershipRecord ? "unverified" : "unknown"),
        seasonDefinedValues: clone(seasonDefinedValues)
      };
    }

    function getTerritoryView(request) {
      if (!isRecord(request)) {
        fail("invalid_input", "Selected Map Target View Service requires request.");
      }
      const unknown = Object.keys(request).filter((field) => !TERRITORY_FIELDS.has(field)).sort();
      if (unknown.length > 0) {
        fail("invalid_input", `Selected Map Target View Service does not recognize request.${unknown[0]}.`);
      }
      const value = request;
      const seasonId = requiredString(value.seasonId, "request.seasonId");
      const serverId = requiredString(value.serverId, "request.serverId");
      let target;
      if (Object.prototype.hasOwnProperty.call(value, "territoryRef")) {
        if (Object.prototype.hasOwnProperty.call(value, "row")
            || Object.prototype.hasOwnProperty.call(value, "col")) {
          fail("invalid_input", "Selected Map Target View Service does not allow request.row or request.col with request.territoryRef.");
        }
        if (!isRecord(value.territoryRef)) {
          fail("invalid_input", "Selected Map Target View Service requires request.territoryRef.");
        }
        if (value.territoryRef.type === "strategic_node") {
          exact(value.territoryRef, new Set(["type", "nodeId"]), "request.territoryRef");
          target = {
            type: "strategic_node",
            nodeId: requiredString(value.territoryRef.nodeId, "request.territoryRef.nodeId")
          };
        } else {
          exact(value.territoryRef, new Set(["type", "row", "col"]), "request.territoryRef");
          if (value.territoryRef.type !== "normal_map_cell") {
            fail("invalid_input", "Selected Map Target View Service requires request.territoryRef.type to be normal_map_cell or strategic_node.");
          }
          target = {
            type: "normal_map_cell",
            row: positiveInteger(value.territoryRef.row, "request.territoryRef.row"),
            col: positiveInteger(value.territoryRef.col, "request.territoryRef.col")
          };
        }
      } else {
        const row = positiveInteger(value.row, "request.row");
        const col = positiveInteger(value.col, "request.col");
        target = { type: "normal_map_cell", row, col };
      }
      const record = ownership.getCurrentTerritoryRecord(
        serverId,
        seasonId,
        target
      );
      return buildView(
        { seasonId, serverId, value: target },
        record,
        null
      );
    }

    function getStructureView(request) {
      const value = exact(request, STRUCTURE_FIELDS, "request");
      const seasonId = requiredString(value.seasonId, "request.seasonId");
      const serverId = requiredString(value.serverId, "request.serverId");
      const structureId = requiredString(value.structureId, "request.structureId");
      const structureCode = requiredString(value.structureCode, "request.structureCode");
      const target = { type: "logical_structure", structureId };
      const record = ownership.getCurrentStructureRecord(
        serverId,
        seasonId,
        structureId
      );
      return buildView(
        { seasonId, serverId, value: target },
        record,
        structureCode
      );
    }

    return Object.freeze({ getTerritoryView, getStructureView });
  }

  const exportsObject = {
    createSelectedMapTargetViewService,
    SelectedMapTargetViewServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
