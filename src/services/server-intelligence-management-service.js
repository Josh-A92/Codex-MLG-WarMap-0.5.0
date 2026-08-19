(function initializeServerIntelligenceManagementServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "authorizationPolicyService",
    "unionRegistryService",
    "relationService",
    "nativeAssignmentService",
    "combatStrengthObservationService",
    "serverObservationService",
    "ownershipRecordService",
    "clock",
    "createId"
  ]);
  const KNOWN_UNION_FIELDS = new Set(["seasonId", "serverId", "unionId"]);
  const NATIVE_FIELDS = new Set([
    "seasonId", "serverId", "unionId", "nativeState", "observedAt", "evidenceId"
  ]);
  const COMBAT_FIELDS = new Set([
    "seasonId", "serverId", "unionId", "value", "unit", "displayFormat", "observedAt", "evidenceId"
  ]);
  const OBSERVATION_FIELDS = new Set([
    "seasonId", "serverId", "text", "observedAt", "evidenceIds"
  ]);
  const TERRITORY_FIELDS = new Set([
    "seasonId", "serverId", "territoryRef", "ownerUnionId", "ownershipState",
    "effectiveAt", "eventAt", "evidenceIds"
  ]);
  const STRUCTURE_FIELDS = new Set([
    "seasonId", "serverId", "structureId", "ownerUnionId", "ownershipState",
    "effectiveAt", "eventAt", "evidenceIds"
  ]);

  class ServerIntelligenceManagementServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ServerIntelligenceManagementServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ServerIntelligenceManagementServiceError(code, message);
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

  function requireRecord(value, path) {
    if (!isRecord(value)) fail("invalid_input", `Server Intelligence Management Service requires ${path}.`);
    return value;
  }

  function requireFields(value, allowed, required, path) {
    const unknown = Object.keys(value).filter((field) => !allowed.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Server Intelligence Management Service does not recognize ${path}.${unknown[0]}.`);
    }
    required.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_input", `Server Intelligence Management Service requires ${path}.${field}.`);
      }
    });
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Server Intelligence Management Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function requireOptionalString(value, path) {
    if (value === undefined || value === null) return null;
    return requireString(value, path);
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Server Intelligence Management Service requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Server Intelligence Management Service requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function createServerIntelligenceManagementService(options) {
    if (!isRecord(options)) fail("invalid_factory", "Server Intelligence Management Service requires options.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Server Intelligence Management Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Server Intelligence Management Service requires options.${field}.`);
      }
    });
    if (typeof options.clock !== "function") {
      fail("invalid_factory", "Server Intelligence Management Service requires options.clock.");
    }
    if (typeof options.createId !== "function") {
      fail("invalid_factory", "Server Intelligence Management Service requires options.createId.");
    }

    const authorization = bindInterface(
      options.authorizationPolicyService,
      "options.authorizationPolicyService",
      ["requireAuthorized"]
    );
    const registry = bindInterface(
      options.unionRegistryService,
      "options.unionRegistryService",
      ["getUnionIdentity"]
    );
    const relations = bindInterface(
      options.relationService,
      "options.relationService",
      ["hasRelation", "addKnownUnion"]
    );
    const nativeAssignments = bindInterface(
      options.nativeAssignmentService,
      "options.nativeAssignmentService",
      ["addConfirmedManualAssignment"]
    );
    const combatStrength = bindInterface(
      options.combatStrengthObservationService,
      "options.combatStrengthObservationService",
      ["addObservation"]
    );
    const serverObservations = bindInterface(
      options.serverObservationService,
      "options.serverObservationService",
      ["addObservation"]
    );
    const ownership = bindInterface(
      options.ownershipRecordService,
      "options.ownershipRecordService",
      ["addConfirmedManualTerritoryRecord", "addConfirmedManualStructureRecord"]
    );
    const clock = options.clock.bind(options);
    const createId = options.createId.bind(options);

    function now() {
      const value = clock();
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
        fail("invalid_dependency", "Server Intelligence Management Service requires clock to return a timestamp.");
      }
      return value;
    }

    function nextId(kind) {
      return requireString(createId(kind), `createId('${kind}')`);
    }

    function normalizeScope(input, allowed, required) {
      const value = requireRecord(input, "input");
      requireFields(value, allowed, required, "input");
      return {
        value,
        seasonId: requireString(value.seasonId, "input.seasonId"),
        serverId: requireString(value.serverId, "input.serverId")
      };
    }

    function authorize(actor, seasonId, serverId) {
      return authorization.requireAuthorized(
        actor,
        "server_state.edit",
        { seasonId, serverId }
      );
    }

    function requireCurrentUnion(unionId) {
      const id = requireString(unionId, "input.unionId");
      const identity = registry.getUnionIdentity(id);
      if (!identity || identity.registryStatus !== "current") {
        fail("unknown_union", `Server Intelligence Management Service requires current union '${id}'.`);
      }
      return id;
    }

    function requireKnownUnion(seasonId, serverId, unionId) {
      const id = requireCurrentUnion(unionId);
      if (!relations.hasRelation(seasonId, serverId, id)) {
        fail(
          "unknown_relation",
          `Union '${id}' is not known on server '${serverId}' in season '${seasonId}'.`
        );
      }
      return id;
    }

    function evidenceIds(value) {
      if (value === undefined) return [];
      if (!Array.isArray(value)) {
        fail("invalid_input", "Server Intelligence Management Service requires input.evidenceIds to be an array.");
      }
      return clone(value);
    }

    function addKnownUnion(actor, input) {
      const scope = normalizeScope(input, KNOWN_UNION_FIELDS, KNOWN_UNION_FIELDS);
      authorize(actor, scope.seasonId, scope.serverId);
      const unionId = requireCurrentUnion(scope.value.unionId);
      return relations.addKnownUnion({
        seasonId: scope.seasonId,
        serverId: scope.serverId,
        unionId
      });
    }

    function recordManualNativeAssignment(actor, input) {
      const scope = normalizeScope(
        input,
        NATIVE_FIELDS,
        new Set(["seasonId", "serverId", "unionId", "nativeState"])
      );
      const decision = authorize(actor, scope.seasonId, scope.serverId);
      const unionId = requireKnownUnion(scope.seasonId, scope.serverId, scope.value.unionId);
      const recordedAt = now();
      const observedAt = requireOptionalString(scope.value.observedAt, "input.observedAt") || recordedAt;
      return nativeAssignments.addConfirmedManualAssignment({
        assignmentId: nextId("native_assignment"),
        unionId,
        serverId: scope.serverId,
        seasonId: scope.seasonId,
        nativeState: scope.value.nativeState,
        evidenceId: requireOptionalString(scope.value.evidenceId, "input.evidenceId"),
        observedAt,
        effectiveFrom: observedAt,
        reviewer: decision.actorId,
        reviewedAt: recordedAt
      });
    }

    function recordManualCombatStrength(actor, input) {
      const scope = normalizeScope(
        input,
        COMBAT_FIELDS,
        new Set(["seasonId", "serverId", "unionId", "value", "unit", "displayFormat"])
      );
      const decision = authorize(actor, scope.seasonId, scope.serverId);
      const unionId = requireKnownUnion(scope.seasonId, scope.serverId, scope.value.unionId);
      const recordedAt = now();
      const observedAt = requireOptionalString(scope.value.observedAt, "input.observedAt") || recordedAt;
      return combatStrength.addObservation({
        observationId: nextId("combat_strength_observation"),
        unionId,
        serverId: scope.serverId,
        seasonId: scope.seasonId,
        value: scope.value.value,
        unit: scope.value.unit,
        displayFormat: scope.value.displayFormat,
        observedAt,
        sourceType: "manual_entry",
        evidenceId: requireOptionalString(scope.value.evidenceId, "input.evidenceId"),
        extractionMethod: null,
        rawExtractedValue: null,
        normalizedValue: scope.value.value,
        confidence: null,
        reviewState: "confirmed",
        actorId: decision.actorId,
        reviewerId: decision.actorId,
        reviewedAt: recordedAt,
        supersededBy: null
      });
    }

    function recordManualServerObservation(actor, input) {
      const scope = normalizeScope(
        input,
        OBSERVATION_FIELDS,
        new Set(["seasonId", "serverId", "text"])
      );
      const decision = authorize(actor, scope.seasonId, scope.serverId);
      const recordedAt = now();
      return serverObservations.addObservation({
        observationId: nextId("server_observation"),
        serverId: scope.serverId,
        seasonId: scope.seasonId,
        text: scope.value.text,
        observedAt: requireOptionalString(scope.value.observedAt, "input.observedAt") || recordedAt,
        sourceType: "manual_entry",
        evidenceIds: evidenceIds(scope.value.evidenceIds),
        actorId: decision.actorId,
        reviewState: "confirmed",
        reviewerId: decision.actorId,
        reviewedAt: recordedAt,
        supersededBy: null
      });
    }

    function buildManualOwnership(actor, input, kind) {
      const fields = kind === "territory" ? TERRITORY_FIELDS : STRUCTURE_FIELDS;
      const targetField = kind === "territory" ? "territoryRef" : "structureId";
      const scope = normalizeScope(
        input,
        fields,
        new Set(["seasonId", "serverId", targetField, "ownerUnionId", "ownershipState"])
      );
      const decision = authorize(actor, scope.seasonId, scope.serverId);
      if (scope.value.ownershipState === "owned") {
        requireKnownUnion(scope.seasonId, scope.serverId, scope.value.ownerUnionId);
      }
      const recordedAt = now();
      const base = {
        serverId: scope.serverId,
        seasonId: scope.seasonId,
        ownerUnionId: scope.value.ownerUnionId,
        ownershipState: scope.value.ownershipState,
        evidenceIds: evidenceIds(scope.value.evidenceIds),
        actorId: decision.actorId,
        reviewerId: decision.actorId,
        reviewedAt: recordedAt
      };
      const effectiveAt = requireOptionalString(scope.value.effectiveAt, "input.effectiveAt");
      if (effectiveAt !== null) {
        base.effectiveAt = effectiveAt;
      }
      if (scope.value.eventAt !== undefined) {
        base.eventAt = clone(scope.value.eventAt);
      } else {
        base.eventAt = {
          precision: "exact",
          at: effectiveAt || recordedAt
        };
      }
      if (kind === "territory") {
        return ownership.addConfirmedManualTerritoryRecord({
          ownershipRecordId: nextId("territory_ownership"),
          ...base,
          territoryRef: clone(scope.value.territoryRef)
        });
      }
      return ownership.addConfirmedManualStructureRecord({
        structureOwnershipId: nextId("structure_ownership"),
        ...base,
        structureId: scope.value.structureId
      });
    }

    function recordManualTerritoryOwnership(actor, input) {
      return buildManualOwnership(actor, input, "territory");
    }

    function recordManualStructureOwnership(actor, input) {
      return buildManualOwnership(actor, input, "structure");
    }

    return Object.freeze({
      addKnownUnion,
      recordManualNativeAssignment,
      recordManualCombatStrength,
      recordManualServerObservation,
      recordManualTerritoryOwnership,
      recordManualStructureOwnership
    });
  }

  const exportsObject = {
    createServerIntelligenceManagementService,
    ServerIntelligenceManagementServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
