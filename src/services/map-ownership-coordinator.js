(function initializeMapOwnershipCoordinatorFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "relationService",
    "serverIntelligenceManagementService",
    "targetVerificationService",
    "serverStateService",
    "executeAtomically",
    "createId"
  ]);
  const TERRITORY_FIELDS = new Set([
    "seasonId", "serverId", "row", "col", "ownerUnionId", "effectiveAt"
  ]);
  const STRUCTURE_FIELDS = new Set([
    "seasonId", "serverId", "structureId", "footprint", "ownerUnionId", "effectiveAt"
  ]);
  const FOOTPRINT_FIELDS = new Set(["row", "col"]);

  class MapOwnershipCoordinatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "MapOwnershipCoordinatorError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new MapOwnershipCoordinatorError(code, message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exact(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `Map Ownership Coordinator requires ${path}.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Map Ownership Coordinator does not recognize ${path}.${unknown[0]}.`);
    }
    return value;
  }

  function requiredString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Map Ownership Coordinator requires ${path} to be non-empty.`);
    }
    return value;
  }

  function positiveInteger(value, path) {
    if (!Number.isInteger(value) || value < 1) {
      fail("invalid_input", `Map Ownership Coordinator requires ${path} to be a positive integer.`);
    }
    return value;
  }

  function owner(value) {
    if (value === null) return null;
    return requiredString(value, "input.ownerUnionId");
  }

  function optionalTimestamp(value) {
    if (value === undefined) return undefined;
    return requiredString(value, "input.effectiveAt");
  }

  function requireFields(value, fields, required, path) {
    required.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_input", `Map Ownership Coordinator requires ${path}.${field}.`);
      }
    });
    return exact(value, fields, path);
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Map Ownership Coordinator requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Map Ownership Coordinator requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function tileKey(row, col) {
    return `${row}-${col}`;
  }

  function createMapOwnershipCoordinator(options) {
    const input = requireFields(options, FACTORY_FIELDS, FACTORY_FIELDS, "options");
    const relations = bindInterface(
      input.relationService,
      "options.relationService",
      ["hasRelation"]
    );
    const management = bindInterface(
      input.serverIntelligenceManagementService,
      "options.serverIntelligenceManagementService",
      [
        "addKnownUnion",
        "recordManualTerritoryOwnership",
        "recordManualStructureOwnership"
      ]
    );
    const verifications = bindInterface(
      input.targetVerificationService,
      "options.targetVerificationService",
      ["addConfirmedVerification"]
    );
    const projection = bindInterface(
      input.serverStateService,
      "options.serverStateService",
      ["getTerritoryOwner", "setTerritoryOwner"]
    );
    if (typeof input.executeAtomically !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires options.executeAtomically.");
    }
    if (typeof input.createId !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires options.createId.");
    }
    const executeAtomically = input.executeAtomically.bind(input);
    const createId = input.createId.bind(input);

    function ensureKnownUnion(actor, seasonId, serverId, ownerUnionId) {
      if (
        ownerUnionId !== null
        && !relations.hasRelation(seasonId, serverId, ownerUnionId)
      ) {
        management.addKnownUnion(actor, { seasonId, serverId, unionId: ownerUnionId });
      }
    }

    function ownershipInput(base, ownerUnionId) {
      const value = {
        seasonId: base.seasonId,
        serverId: base.serverId,
        ownerUnionId,
        ownershipState: ownerUnionId === null ? "unclaimed" : "owned"
      };
      if (base.effectiveAt !== undefined) value.effectiveAt = base.effectiveAt;
      return value;
    }

    function addVerification(record, targetRef, ownershipType, recordId) {
      return verifications.addConfirmedVerification({
        verificationId: requiredString(
          createId("target_verification"),
          "createId('target_verification')"
        ),
        serverId: record.serverId,
        seasonId: record.seasonId,
        targetRef,
        verifiedOwnershipRef: {
          type: ownershipType,
          recordId
        },
        observedAt: record.effectiveAt,
        confirmedAt: record.reviewedAt,
        sourceType: "manual_entry",
        evidenceIds: [],
        actorId: record.actorId,
        reviewerId: record.reviewerId,
        reviewState: "confirmed",
        supersededBy: null
      });
    }

    function setTerritoryOwnership(actor, value) {
      const inputValue = requireFields(
        value,
        TERRITORY_FIELDS,
        new Set(["seasonId", "serverId", "row", "col", "ownerUnionId"]),
        "input"
      );
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const row = positiveInteger(inputValue.row, "input.row");
      const col = positiveInteger(inputValue.col, "input.col");
      const ownerUnionId = owner(inputValue.ownerUnionId);
      const effectiveAt = optionalTimestamp(inputValue.effectiveAt);

      return executeAtomically(() => {
        ensureKnownUnion(actor, seasonId, serverId, ownerUnionId);
        const record = management.recordManualTerritoryOwnership(actor, {
          ...ownershipInput({ seasonId, serverId, effectiveAt }, ownerUnionId),
          territoryRef: { type: "normal_map_cell", row, col }
        });
        const verification = addVerification(
          record,
          { type: "normal_map_cell", row, col },
          "territory_ownership_record",
          record.ownershipRecordId
        );
        projection.setTerritoryOwner(serverId, tileKey(row, col), ownerUnionId);
        return {
          targetType: "normal_map_cell",
          record,
          verification,
          projectedTerritoryKeys: [tileKey(row, col)]
        };
      });
    }

    function normalizeFootprint(value) {
      if (!Array.isArray(value) || value.length === 0) {
        fail("invalid_input", "Map Ownership Coordinator requires input.footprint to be a non-empty array.");
      }
      const seen = new Set();
      return value.map((entry, index) => {
        const point = requireFields(
          entry,
          FOOTPRINT_FIELDS,
          FOOTPRINT_FIELDS,
          `input.footprint[${index}]`
        );
        const row = positiveInteger(point.row, `input.footprint[${index}].row`);
        const col = positiveInteger(point.col, `input.footprint[${index}].col`);
        const key = tileKey(row, col);
        if (seen.has(key)) {
          fail("invalid_input", `Map Ownership Coordinator requires unique footprint cell '${key}'.`);
        }
        seen.add(key);
        return { row, col, key };
      });
    }

    function setStructureOwnership(actor, value) {
      const inputValue = requireFields(
        value,
        STRUCTURE_FIELDS,
        new Set(["seasonId", "serverId", "structureId", "footprint", "ownerUnionId"]),
        "input"
      );
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const structureId = requiredString(inputValue.structureId, "input.structureId");
      const footprint = normalizeFootprint(inputValue.footprint);
      const ownerUnionId = owner(inputValue.ownerUnionId);
      const effectiveAt = optionalTimestamp(inputValue.effectiveAt);

      return executeAtomically(() => {
        ensureKnownUnion(actor, seasonId, serverId, ownerUnionId);
        const record = management.recordManualStructureOwnership(actor, {
          ...ownershipInput({ seasonId, serverId, effectiveAt }, ownerUnionId),
          structureId
        });
        const verification = addVerification(
          record,
          { type: "logical_structure", structureId },
          "structure_ownership_record",
          record.structureOwnershipId
        );
        footprint.forEach((point) => {
          projection.setTerritoryOwner(serverId, point.key, ownerUnionId);
        });
        return {
          targetType: "logical_structure",
          record,
          verification,
          projectedTerritoryKeys: footprint.map((point) => point.key)
        };
      });
    }

    return Object.freeze({ setTerritoryOwnership, setStructureOwnership });
  }

  const exportsObject = {
    createMapOwnershipCoordinator,
    MapOwnershipCoordinatorError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
