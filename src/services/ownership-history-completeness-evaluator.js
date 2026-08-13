(function initializeOwnershipHistoryCompletenessEvaluator(globalScope) {
  const FACTORY_FIELDS = new Set(["targetCatalog", "ownershipHistoryResolver", "ownershipProjectionComparator"]);
  const INPUT_FIELDS = new Set(["territoryRecords", "structureRecords", "seasonId", "serverId", "persistedProjection"]);

  class OwnershipHistoryCompletenessEvaluatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipHistoryCompletenessEvaluatorError";
      this.code = code;
    }
  }

  function fail(code, message) { throw new OwnershipHistoryCompletenessEvaluatorError(code, message); }
  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }
  function requireArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`);
    return value;
  }
  function requireInterface(value, path, methods) {
    if (!isPlainObject(value)) fail("invalid_factory", `${path} must be an object.`);
    const bound = {};
    methods.forEach((method) => {
      if (typeof value[method] !== "function") fail("invalid_factory", `${path}.${method} must be a function.`);
      bound[method] = value[method].bind(value);
    });
    return bound;
  }
  function compareStrings(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isPlainObject(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true }));
    return output;
  }
  function targetKey(point) { return `${point.row}-${point.col}`; }
  function validatePoint(value, path) {
    if (!isPlainObject(value) || Object.keys(value).some((field) => !["row", "col"].includes(field))) fail("invalid_input", `${path} is invalid.`);
    if (!Number.isInteger(value.row) || value.row < 1 || !Number.isInteger(value.col) || value.col < 1) fail("invalid_input", `${path} is invalid.`);
    return { row: value.row, col: value.col };
  }
  function normalizeCatalog(value) {
    if (!isPlainObject(value) || !Array.isArray(value.territoryKeys) || !Array.isArray(value.structures)) fail("invalid_input", "targetCatalog is invalid.");
    const territoryKeys = new Set();
    value.territoryKeys.forEach((point, index) => {
      const normalized = validatePoint(point, `targetCatalog.territoryKeys[${index}]`);
      const key = targetKey(normalized);
      if (territoryKeys.has(key)) fail("invalid_input", `targetCatalog contains duplicate territory '${key}'.`);
      territoryKeys.add(key);
    });
    const structures = new Map();
    value.structures.forEach((structure, index) => {
      if (!isPlainObject(structure) || typeof structure.structureId !== "string" || !Array.isArray(structure.footprint)) fail("invalid_input", `targetCatalog.structures[${index}] is invalid.`);
      if (structures.has(structure.structureId)) fail("invalid_input", `targetCatalog contains duplicate structure '${structure.structureId}'.`);
      const footprint = structure.footprint.map((point, pointIndex) => validatePoint(point, `targetCatalog.structures[${index}].footprint[${pointIndex}]`));
      structures.set(structure.structureId, { structureId: structure.structureId, footprint });
    });
    return { territoryKeys: Array.from(territoryKeys).sort(), structures: Array.from(structures.values()).sort((left, right) => compareStrings(left.structureId, right.structureId)) };
  }
  function diagnostic(code, targetKeyValue, details = {}) { return { ...details, code, targetKey: targetKeyValue }; }
  function stateResult(classification, targetKeys, extra = {}) { return { classification, targetKeys: targetKeys.slice().sort(compareStrings), ...extra }; }

  function createOwnershipHistoryCompletenessEvaluator(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    const catalog = normalizeCatalog(options.targetCatalog);
    const resolver = requireInterface(options.ownershipHistoryResolver, "options.ownershipHistoryResolver", ["resolve"]);
    const comparator = requireInterface(options.ownershipProjectionComparator, "options.ownershipProjectionComparator", ["compare"]);

    function evaluate(input) {
      if (!isPlainObject(input)) fail("invalid_input", "input must be a plain object.");
      const unknownInput = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
      if (unknownInput.length > 0) fail("invalid_input", `Unsupported input field '${unknownInput[0]}'.`);
      const seasonId = requireString(input.seasonId, "input.seasonId");
      const serverId = requireString(input.serverId, "input.serverId");
      const territoryRecords = requireArray(input.territoryRecords, "input.territoryRecords");
      const structureRecords = requireArray(input.structureRecords, "input.structureRecords");
      const territoryHistoryEmpty = territoryRecords.length === 0;
      const structureHistoryEmpty = structureRecords.length === 0;
      let resolved;
      try {
        resolved = resolver.resolve({ seasonId, serverId, territoryRecords, structureRecords });
      } catch (error) {
        const classification = error && error.code === "contradiction" ? "contradictory" : "malformed";
        return { seasonId, serverId, territoryCoverage: stateResult(classification, []), structureCoverage: stateResult(classification, []), projectionRelationship: stateResult(classification, []), safetyDiagnostics: [diagnostic(`ownership_history_${classification}`, null)] };
      }
      if (!isPlainObject(resolved) || !Array.isArray(resolved.territories) || !Array.isArray(resolved.structures) || !Array.isArray(resolved.uncertainty)) fail("invalid_result", "ownershipHistoryResolver returned an invalid result.");
      const territoryByKey = new Map(resolved.territories.map((record) => [targetKey(record.territoryRef), record]));
      const structureById = new Map(resolved.structures.map((record) => [record.structureId, record]));
      const territoryUncertainty = resolved.uncertainty.filter((entry) => entry.kind === "territory");
      const structureUncertainty = resolved.uncertainty.filter((entry) => entry.kind === "structure");
      const territoryUncertainKeys = territoryUncertainty.map((entry) => targetKey(entry.target));
      const structureUncertainKeys = structureUncertainty.map((entry) => entry.target);
      const territoryCovered = catalog.territoryKeys.filter((key) => territoryByKey.has(key) && territoryByKey.get(key).ownershipState !== "unknown");
      const structureCovered = catalog.structures.map((structure) => structure.structureId).filter((id) => structureById.has(id) && structureById.get(id).ownershipState !== "unknown");
      const territoryMissing = catalog.territoryKeys.filter((key) => !territoryByKey.has(key));
      const structureMissing = catalog.structures.map((structure) => structure.structureId).filter((id) => !structureById.has(id));
      const territoryUnknownState = catalog.territoryKeys.filter((key) => territoryByKey.has(key) && territoryByKey.get(key).ownershipState === "unknown");
      const structureUnknownState = catalog.structures.map((structure) => structure.structureId).filter((id) => structureById.has(id) && structureById.get(id).ownershipState === "unknown");
      const projectionEmpty = !isPlainObject(input.persistedProjection) ? false : Array.isArray(input.persistedProjection.servers) ? input.persistedProjection.servers.some((server) => server && server.id === serverId && isPlainObject(server.ownership) && Object.keys(server.ownership).length === 0) : false;
      const territoryClassification = territoryHistoryEmpty ? (projectionEmpty ? "structurally_empty" : "projection_only") : territoryUncertainKeys.length || territoryUnknownState.length ? "uncertain" : territoryCovered.length === catalog.territoryKeys.length ? "complete" : "partial";
      const structureClassification = structureUncertainty.length || structureUnknownState.length ? "uncertain" : structureCovered.length === catalog.structures.length ? "complete" : structureHistoryEmpty ? "structurally_empty" : "partial";
      let comparison;
      try {
        comparison = comparator.compare({ resolverResult: { ...resolved, territories: resolved.territories, structures: [], uncertainty: territoryUncertainty, excludedRecords: [], consistencyDiagnostics: [] }, persistedProjection: input.persistedProjection });
      } catch (error) {
        return { seasonId, serverId, territoryCoverage: stateResult("malformed", territoryCovered), structureCoverage: stateResult(structureClassification, structureCovered), projectionRelationship: stateResult("malformed", []), safetyDiagnostics: [diagnostic("persisted_projection_invalid", null, { causeCode: error.code || "invalid_input" })] };
      }
      const projectionKeys = comparison.differences.map((difference) => difference.territoryKey);
      let projectionClassification;
      if (territoryHistoryEmpty && projectionEmpty) projectionClassification = "structurally_empty";
      else if (territoryHistoryEmpty) projectionClassification = "projection_only";
      else if (territoryClassification === "uncertain") projectionClassification = "uncertain";
      else if (territoryClassification === "partial") projectionClassification = "partial";
      else projectionClassification = "complete";
      const safetyDiagnostics = [];
      territoryMissing.forEach((key) => safetyDiagnostics.push(diagnostic("missing_territory_target", key)));
      structureMissing.forEach((key) => safetyDiagnostics.push(diagnostic("missing_structure_target", key)));
      territoryUncertainKeys.forEach((key) => safetyDiagnostics.push(diagnostic("uncertain_territory_target", key)));
      structureUncertainKeys.forEach((key) => safetyDiagnostics.push(diagnostic("uncertain_structure_target", key)));
      territoryUnknownState.forEach((key) => safetyDiagnostics.push(diagnostic("unknown_territory_state", key)));
      structureUnknownState.forEach((key) => safetyDiagnostics.push(diagnostic("unknown_structure_state", key)));
      (resolved.consistencyDiagnostics || []).forEach((entry) => safetyDiagnostics.push(diagnostic("structure_footprint_disagreement", entry.territoryKey || null, clone(entry))));
      safetyDiagnostics.sort((left, right) => compareStrings(left.targetKey || "", right.targetKey || "") || compareStrings(left.code, right.code));
      return { seasonId, serverId, territoryCoverage: stateResult(territoryClassification, territoryCovered, { missingTargetKeys: territoryMissing.sort(compareStrings), uncertainTargetKeys: territoryUncertainKeys.concat(territoryUnknownState).sort(compareStrings) }), structureCoverage: stateResult(structureClassification, structureCovered, { missingTargetKeys: structureMissing.sort(compareStrings), uncertainTargetKeys: structureUncertainKeys.concat(structureUnknownState).sort(compareStrings) }), projectionRelationship: stateResult(projectionClassification, projectionKeys, { status: comparison.status, differences: clone(comparison.differences) }), safetyDiagnostics };
    }

    return Object.freeze({ evaluate });
  }

  const exportsObject = { createOwnershipHistoryCompletenessEvaluator, OwnershipHistoryCompletenessEvaluatorError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));