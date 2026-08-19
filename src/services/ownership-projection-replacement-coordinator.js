(function initializeOwnershipProjectionReplacementCoordinator(globalScope) {
  const FACTORY_FIELDS = new Set(["ownershipHistoryResolver", "ownershipProjectionComparator", "ownershipRecordService", "serverStateService", "mutationCoordinator"]);
  const INPUT_FIELDS = new Set(["seasonId", "serverId", "persistedProjection"]);

  class OwnershipProjectionReplacementCoordinatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipProjectionReplacementCoordinatorError";
      this.code = code;
    }
  }

  function fail(code, message) { throw new OwnershipProjectionReplacementCoordinatorError(code, message); }
  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }
  function requireInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid_factory", `${path} must be an object.`);
    const bound = {};
    methods.forEach((method) => {
      if (typeof value[method] !== "function") fail("invalid_factory", `${path}.${method} must be a function.`);
      bound[method] = value[method].bind(value);
    });
    return bound;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isPlainObject(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true }));
    return output;
  }
  function recovery(reason, causeCode) {
    const result = { status: "recovery_required", reason };
    if (causeCode) result.causeCode = causeCode;
    return result;
  }

  function createOwnershipProjectionReplacementCoordinator(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    const resolver = requireInterface(options.ownershipHistoryResolver, "options.ownershipHistoryResolver", ["resolve"]);
    const comparator = requireInterface(options.ownershipProjectionComparator, "options.ownershipProjectionComparator", ["compare"]);
    const ownership = requireInterface(options.ownershipRecordService, "options.ownershipRecordService", ["listTerritoryRecords", "listStructureRecords", "listRetractions"]);
    const serverState = requireInterface(options.serverStateService, "options.serverStateService", ["getSeasonId", "captureTransactionState", "replaceTerritoryOwnership"]);
    const mutation = requireInterface(options.mutationCoordinator, "options.mutationCoordinator", ["execute"]);

    async function replace(input, durableCommit) {
      if (!isPlainObject(input)) return recovery("invalid_input");
      const unknownInput = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
      if (unknownInput.length > 0) return recovery("invalid_input");
      const seasonId = requireString(input.seasonId, "input.seasonId");
      const serverId = requireString(input.serverId, "input.serverId");
      if (serverState.getSeasonId() !== seasonId) return recovery("context_mismatch");

      let resolved;
      let comparison;
      try {
        resolved = await resolver.resolve({ seasonId, serverId, territoryRecords: await ownership.listTerritoryRecords(), structureRecords: await ownership.listStructureRecords(), retractionRecords: await ownership.listRetractions() });
        comparison = comparator.compare({ resolverResult: resolved, persistedProjection: input.persistedProjection });
      } catch (error) {
        const causeCode = error && error.code ? error.code : "invalid_input";
        const reason = causeCode === "contradiction" ? "contradictory_authoritative_history" : causeCode === "scope_mismatch" ? "context_mismatch" : "invalid_authoritative_or_persisted_state";
        return recovery(reason, causeCode);
      }

      if (!isPlainObject(resolved) || !Array.isArray(resolved.territories) || !Array.isArray(resolved.uncertainty)) return recovery("invalid_authoritative_history", "invalid_result");
      if (resolved.uncertainty.length > 0) return recovery("uncertain_authoritative_history");
      if (resolved.territories.some((record) => record.ownershipState === "unknown")) return recovery("unrepresentable_ownership_state", "unknown");
      if (!isPlainObject(comparison) || !Array.isArray(comparison.differences)) return recovery("invalid_comparison", "invalid_result");
      const rebuiltOwnership = {};
      resolved.territories.forEach((record) => {
        if (record.ownershipState !== "owned" && record.ownershipState !== "unclaimed") fail("unrepresentable_ownership_state", `Cannot project ownership state '${record.ownershipState}'.`);
        const ref = record.territoryRef;
          const key = ref.type === "strategic_node" ? JSON.stringify(["strategic_node", ref.nodeId]) : `${ref.row}-${ref.col}`;
          rebuiltOwnership[key] = record.ownershipState === "owned" ? record.ownerUnionId : null;
      });
      if (comparison.status === "matching_projection") return { status: "unchanged", comparison, rebuiltProjection: { seasonId, serverId, ownership: clone(rebuiltOwnership) } };

      const repairable = new Set(["missing_projection_entry", "stale_projection_entry", "orphan_projection_entry"]);
      if (comparison.differences.some((difference) => !repairable.has(difference.classification))) return recovery("unrepresentable_projection_state");
      if (typeof durableCommit !== "function") return recovery("durable_commit_required");

      let currentProjection;
      try { currentProjection = await serverState.captureTransactionState(); } catch (_error) { return recovery("projection_snapshot_failed"); }
      if (!isPlainObject(currentProjection)) return recovery("projection_snapshot_invalid");
      if (!Object.prototype.hasOwnProperty.call(currentProjection, serverId) || !isPlainObject(currentProjection[serverId])) return recovery("context_mismatch");
      const replacementProjection = clone(currentProjection);
      replacementProjection[serverId] = rebuiltOwnership;
      const rebuiltProjection = { seasonId, serverId, ownership: clone(rebuiltOwnership) };
      const result = { status: "repaired", comparison, rebuiltProjection };

      return mutation.execute(
        () => { serverState.replaceTerritoryOwnership(replacementProjection); return result; },
        () => durableCommit(result)
      );
    }

    return Object.freeze({ replace });
  }

  const exportsObject = { createOwnershipProjectionReplacementCoordinator, OwnershipProjectionReplacementCoordinatorError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));