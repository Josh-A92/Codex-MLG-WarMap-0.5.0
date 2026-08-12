(function initializeLegacyStateClassifierFactory(globalScope) {
  const REQUIRED_FIELDS = [
    "deserializeDataManagementEnvelope",
    "deserializeServerStateEnvelope"
  ];

  class LegacyStateClassifierError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "LegacyStateClassifierError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new LegacyStateClassifierError(code, message, cause);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return structuredClone(value);
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `${path} must be a non-empty string.`);
    }
    return value;
  }

  function canonical(value) {
    return JSON.stringify(value, Object.keys(value).sort());
  }

  function compareUnionCopies(envelopes) {
    if (!Array.isArray(envelopes) || envelopes.length < 2) return false;
    const normalized = envelopes.map((envelope) => canonical(envelope.identities || []));
    return normalized.some((value) => value !== normalized[0]);
  }

  function currentOwnershipRecords(strategicState, seasonId, serverId) {
    const records = Array.isArray(strategicState.territoryOwnershipRecords)
      ? strategicState.territoryOwnershipRecords
      : [];
    const current = new Map();
    records.forEach((record) => {
      if (!isRecord(record)
          || record.seasonId !== seasonId
          || record.serverId !== serverId
          || !isRecord(record.territoryRef)
          || record.territoryRef.type !== "normal_map_cell"
          || record.reviewState !== "confirmed"
          || record.supersededBy !== null) {
        return;
      }
      const key = `${record.territoryRef.row}-${record.territoryRef.col}`;
      if (current.has(key)) current.delete(key);
      current.set(key, record.ownerUnionId === null ? null : record.ownerUnionId);
    });
    return current;
  }

  function deriveProjection(strategicState, seasonId, serverId) {
    const current = currentOwnershipRecords(strategicState, seasonId, serverId);
    const projection = {};
    current.forEach((owner, key) => { projection[key] = owner; });
    return { current, projection };
  }

  function projectionsEqual(left, right) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every((key) => left[key] === right[key]);
  }

  function classify(options) {
    if (!isRecord(options)) fail("invalid_input", "options must be a plain object.");
    REQUIRED_FIELDS.forEach((field) => {
      if (typeof options[field] !== "function") fail("invalid_input", `options.${field} must be a function.`);
    });
    const seasonId = requireString(options.seasonId, "options.seasonId");
    const baseMapId = requireString(options.baseMapId, "options.baseMapId");
    const dataManagement = options.dataManagementEnvelope;
    const serverState = options.serverStateEnvelope;
    if (dataManagement == null && serverState == null) return { status: "first_run" };
    if (dataManagement == null || serverState == null) {
      return { status: "recovery_required", reason: "partial_legacy_state" };
    }

    let data;
    let projection;
    try {
      data = options.deserializeDataManagementEnvelope(dataManagement);
      projection = options.deserializeServerStateEnvelope(serverState);
    } catch (error) {
      return { status: "corrupt", reason: "legacy_validation_failed", error: error.message };
    }
    if (!isRecord(data) || !isRecord(projection)
        || data.seasonId !== seasonId
        || projection.seasonId !== seasonId
        || projection.baseMapId !== baseMapId) {
      return { status: "corrupt", reason: "legacy_scope_mismatch" };
    }
    if (compareUnionCopies(options.unionRegistryEnvelopes)) {
      return { status: "recovery_required", reason: "conflicting_union_registry_copies" };
    }

    const strategicEnvelope = data.strategicDomain;
    if (!isRecord(strategicEnvelope) || strategicEnvelope.seasonId !== seasonId) {
      return { status: "corrupt", reason: "strategic_scope_mismatch" };
    }
    const state = strategicEnvelope.state;
    const servers = Array.isArray(projection.servers) ? projection.servers : [];
    const serverIds = servers.map((server) => server.id);
    const mismatches = [];
    let canRebuildAll = true;
    const rebuild = {};
    servers.forEach((server) => {
      const derived = deriveProjection(state, seasonId, server.id);
      rebuild[server.id] = derived.projection;
      const storedOwnership = isRecord(server.ownership) ? server.ownership : null;
      if (storedOwnership === null) {
        canRebuildAll = false;
        mismatches.push(server.id);
        return;
      }
      const complete = Object.keys(storedOwnership).every((key) => Object.prototype.hasOwnProperty.call(derived.projection, key));
      if (!complete || !projectionsEqual(storedOwnership, derived.projection)) {
        if (!complete) canRebuildAll = false;
        mismatches.push(server.id);
      }
    });
    if (mismatches.length === 0) return { status: "aligned", seasonId, baseMapId, serverIds };
    if (canRebuildAll && mismatches.length > 0) {
      return { status: "rebuildable_projection", seasonId, baseMapId, serverIds, projection: clone(rebuild) };
    }
    return { status: "recovery_required", reason: "ownership_projection_mismatch", serverIds: mismatches };
  }

  function createLegacyStateClassifier(options) {
    if (!isRecord(options)) fail("invalid_factory", "options must be a plain object.");
    return Object.freeze({ classify: (input) => classify({ ...options, ...input }) });
  }

  const exportsObject = { createLegacyStateClassifier, LegacyStateClassifierError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
