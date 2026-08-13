(function initializeOwnershipHistoryStartupDecisionService(globalScope) {
  const FACTORY_FIELDS = new Set(["createCompletenessEvaluator"]);
  const INPUT_FIELDS = new Set(["seasonId", "serverId", "baseMapId", "provenanceState", "territoryRecords", "structureRecords", "targetCatalog", "persistedProjection"]);
  const SOURCE_KINDS = new Set(["first_run", "existing_generation", "legacy_migration"]);
  const REPAIRABLE = new Set(["missing_projection_entry", "stale_projection_entry", "orphan_projection_entry"]);

  class OwnershipHistoryStartupDecisionServiceError extends Error { constructor(code, message) { super(message); this.name = "OwnershipHistoryStartupDecisionServiceError"; this.code = code; } }
  function fail(code, message) { throw new OwnershipHistoryStartupDecisionServiceError(code, message); }
  function isPlainObject(value) { if (value === null || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
  function requireString(value, path) { if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`); return value; }
  function requireArray(value, path) { if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`); return value; }
  function rejectUnknown(value, fields, path) { if (!isPlainObject(value)) fail("invalid_input", `${path} must be a plain object.`); const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort(); if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`); }
  function compareStrings(left, right) { if (left < right) return -1; if (left > right) return 1; return 0; }
  function clone(value) { if (Array.isArray(value)) return value.map(clone); if (!isPlainObject(value)) return value; const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {}; Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true })); return output; }
  function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (!isPlainObject(value)) return JSON.stringify(value); return `{${Object.keys(value).sort(compareStrings).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; }
  function recovery(reason, diagnostics = []) { return { decision: "recovery_required", reason, diagnostics: Array.from(new Set(diagnostics)).sort(compareStrings) }; }

  function createOwnershipHistoryStartupDecisionService(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort(); if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    if (typeof options.createCompletenessEvaluator !== "function") fail("invalid_factory", "createCompletenessEvaluator must be a function.");
    function decide(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      const seasonId = requireString(input.seasonId, "input.seasonId"); const serverId = requireString(input.serverId, "input.serverId"); const baseMapId = requireString(input.baseMapId, "input.baseMapId");
      if (!isPlainObject(input.provenanceState)) fail("invalid_input", "input.provenanceState must be a plain object.");
      const territoryRecords = requireArray(input.territoryRecords, "input.territoryRecords"); const structureRecords = requireArray(input.structureRecords, "input.structureRecords");
      if (!isPlainObject(input.targetCatalog) || !isPlainObject(input.persistedProjection)) fail("invalid_input", "targetCatalog and persistedProjection must be plain objects.");
      const provenance = input.provenanceState;
      if (provenance.status !== "present") return recovery("unknown_provenance", ["unknown_provenance"]);
      if (!isPlainObject(provenance.document) || !Array.isArray(provenance.document.records)) return recovery("malformed_provenance", ["malformed_provenance"]);
      const evidence = provenance.document.records.find((record) => isPlainObject(record) && record.serverId === serverId);
      if (!evidence) return recovery("missing_server_provenance", ["missing_server_provenance"]);
      if (evidence.seasonId !== seasonId || evidence.baseMapId !== baseMapId) return recovery("provenance_scope_mismatch", ["provenance_scope_mismatch"]);

      let evaluated;
      try {
        const evaluator = options.createCompletenessEvaluator({ targetCatalog: input.targetCatalog });
        if (!isPlainObject(evaluator) || typeof evaluator.evaluate !== "function") return recovery("evaluator_unavailable", ["evaluator_unavailable"]);
        evaluated = evaluator.evaluate({ seasonId, serverId, territoryRecords, structureRecords, persistedProjection: input.persistedProjection });
      } catch (error) {
        return recovery(error && error.code === "contradictory" ? "contradictory_history" : "malformed_history", [error && error.code ? error.code : "malformed_history"]);
      }
      if (!isPlainObject(evaluated)) return recovery("malformed_evaluator_result", ["malformed_evaluator_result"]);
      const derived = { territoryCoverage: evaluated.territoryCoverage, structureCoverage: evaluated.structureCoverage, projectionRelationship: evaluated.projectionRelationship, safetyDiagnosticCodes: Array.from(new Set((evaluated.safetyDiagnostics || []).map((entry) => entry.code))).sort(compareStrings) };
      const stored = { territoryCoverage: evidence.territoryCoverage, structureCoverage: evidence.structureCoverage, projectionRelationship: evidence.projectionRelationship, safetyDiagnosticCodes: evidence.safetyDiagnosticCodes };
      if (canonical(stored) !== canonical(derived)) return recovery("provenance_evidence_mismatch", ["provenance_evidence_mismatch"]);
      if (!SOURCE_KINDS.has(evidence.sourceKind)) return recovery("invalid_provenance_source", ["invalid_provenance_source"]);
      const territoryClass = derived.territoryCoverage && derived.territoryCoverage.classification;
      const projectionClass = derived.projectionRelationship && derived.projectionRelationship.classification;
      const differences = Array.isArray(derived.projectionRelationship && derived.projectionRelationship.differences) ? clone(derived.projectionRelationship.differences) : [];
      const diagnostics = Array.from(new Set(derived.safetyDiagnosticCodes)).sort(compareStrings);
      const scope = { seasonId, serverId, baseMapId, territoryCoverage: clone(derived.territoryCoverage), structureCoverage: clone(derived.structureCoverage), projectionRelationship: clone(derived.projectionRelationship), diagnostics };
      if (evidence.sourceKind === "first_run") {
        const empty = territoryRecords.length === 0 && structureRecords.length === 0 && territoryClass === "structurally_empty" && projectionClass === "structurally_empty";
        return empty ? { decision: "ready_empty", ...scope } : recovery("invalid_first_run_provenance", ["invalid_first_run_provenance"]);
      }
      if (territoryClass === "complete" && projectionClass === "complete") {
        if (derived.projectionRelationship.status === "matching_projection") return { decision: "ready", ...scope };
        if (differences.length > 0 && differences.every((difference) => REPAIRABLE.has(difference.classification))) return { decision: "repair_eligible", ...scope, repair: { differences } };
      }
      return recovery(territoryClass === "projection_only" ? "projection_only" : territoryClass === "partial" ? "partial_history" : territoryClass === "uncertain" ? "uncertain_history" : territoryClass === "contradictory" ? "contradictory_history" : territoryClass === "malformed" ? "malformed_history" : "unrepresentable_projection", diagnostics);
    }
    return Object.freeze({ decide });
  }
  const exportsObject = { createOwnershipHistoryStartupDecisionService, OwnershipHistoryStartupDecisionServiceError }; Object.keys(exportsObject).forEach((key) => { globalThis[key] = exportsObject[key]; }); if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));