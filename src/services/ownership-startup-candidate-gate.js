(function initializeOwnershipStartupCandidateGate(globalScope) {
  const FACTORY_FIELDS = new Set(["createContextDecisionService"]);
  const INPUT_FIELDS = new Set(["activeSeason", "provenanceState", "territoryRecords", "structureRecords", "targetCatalog", "persistedProjection"]);
  const ACTIVE_FIELDS = new Set(["seasonId", "baseMapId", "serverIds"]);
  const DECISIONS = new Set(["ready", "ready_empty", "repair_eligible", "recovery_required"]);

  class OwnershipStartupCandidateGateError extends Error {
    constructor(code, message) { super(message); this.name = "OwnershipStartupCandidateGateError"; this.code = code; }
  }
  function fail(code, message) { throw new OwnershipStartupCandidateGateError(code, message); }
  function isPlainObject(value) { if (value === null || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
  function requireString(value, path) { if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`); return value; }
  function requireArray(value, path) { if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`); return value; }
  function rejectUnknown(value, fields, path) { if (!isPlainObject(value)) fail("invalid_input", `${path} must be a plain object.`); const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort(); if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`); }
  function compareStrings(left, right) { if (left < right) return -1; if (left > right) return 1; return 0; }
  function clone(value) { if (Array.isArray(value)) return value.map(clone); if (!isPlainObject(value)) return value; const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {}; Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true })); return output; }
  function requireDecisionService(value) { if (!isPlainObject(value) || typeof value.decide !== "function") fail("invalid_factory", "createContextDecisionService must return a decision service."); return value.decide.bind(value); }
  function recoveryDecision(serverId, reason) { return { decision: "recovery_required", serverId, reason, diagnostics: [reason] }; }

  function createOwnershipStartupCandidateGate(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort(); if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    if (typeof options.createContextDecisionService !== "function") fail("invalid_factory", "createContextDecisionService must be a function.");

    function evaluate(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      const territoryRecords = requireArray(input.territoryRecords, "input.territoryRecords"); const structureRecords = requireArray(input.structureRecords, "input.structureRecords");
      if (!isPlainObject(input.targetCatalog) || !isPlainObject(input.persistedProjection) || !isPlainObject(input.provenanceState)) fail("invalid_input", "candidate state objects are required.");
      if (input.activeSeason === null || input.activeSeason === undefined) return { decision: "ready_setup", serverDecisions: [], repairServers: [], recoveryServers: [], diagnostics: [] };
      rejectUnknown(input.activeSeason, ACTIVE_FIELDS, "input.activeSeason");
      const seasonId = requireString(input.activeSeason.seasonId, "input.activeSeason.seasonId"); const baseMapId = requireString(input.activeSeason.baseMapId, "input.activeSeason.baseMapId"); const serverIds = requireArray(input.activeSeason.serverIds, "input.activeSeason.serverIds").map((serverId, index) => requireString(serverId, `input.activeSeason.serverIds[${index}]`));
      if (serverIds.length === 0) fail("invalid_input", "input.activeSeason.serverIds must not be empty.");
      if (new Set(serverIds).size !== serverIds.length) fail("invalid_input", "input.activeSeason.serverIds contains duplicates.");
      const decide = requireDecisionService(options.createContextDecisionService());
      const serverDecisions = serverIds.map((serverId) => {
        try { return { serverId, ...clone(decide({ seasonId, serverId, baseMapId, provenanceState: input.provenanceState, territoryRecords, structureRecords, targetCatalog: input.targetCatalog, persistedProjection: input.persistedProjection })) }; }
        catch (error) { return recoveryDecision(serverId, error && error.code ? error.code : "decision_failed"); }
      });
      serverDecisions.forEach((entry) => { if (!DECISIONS.has(entry.decision)) { entry.decision = "recovery_required"; entry.reason = "invalid_decision"; entry.diagnostics = ["invalid_decision"]; } });
      serverDecisions.sort((left, right) => compareStrings(left.serverId, right.serverId));
      const recoveryServers = serverDecisions.filter((entry) => entry.decision === "recovery_required").map((entry) => ({ serverId: entry.serverId, reason: entry.reason, diagnostics: Array.isArray(entry.diagnostics) ? entry.diagnostics.slice().sort(compareStrings) : [] }));
      const repairServers = serverDecisions.filter((entry) => entry.decision === "repair_eligible").map((entry) => ({ serverId: entry.serverId, comparison: clone(entry.repair || entry.projectionRelationship || null) }));
      const diagnostics = Array.from(new Set(serverDecisions.flatMap((entry) => Array.isArray(entry.diagnostics) ? entry.diagnostics : []).concat(recoveryServers.flatMap((entry) => entry.diagnostics)))).sort(compareStrings);
      if (recoveryServers.length > 0) return { decision: "recovery_required", seasonId, baseMapId, serverDecisions, repairServers: [], recoveryServers, diagnostics };
      if (repairServers.length > 0) return { decision: "repair_required", seasonId, baseMapId, serverDecisions, repairServers, recoveryServers: [], diagnostics };
      return { decision: "ready", seasonId, baseMapId, serverDecisions, repairServers: [], recoveryServers: [], diagnostics };
    }
    return Object.freeze({ evaluate });
  }
  const exportsObject = { createOwnershipStartupCandidateGate, OwnershipStartupCandidateGateError }; Object.keys(exportsObject).forEach((key) => { globalThis[key] = exportsObject[key]; }); if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));