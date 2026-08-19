(function initializeOwnershipProjectionComparator(globalScope) {
  const INPUT_FIELDS = new Set(["resolverResult", "persistedProjection"]);
  const RESULT_FIELDS = new Set(["seasonId", "serverId", "territories", "structures", "uncertainty", "excludedRecords", "consistencyDiagnostics"]);
  const TERRITORY_FIELDS = new Set(["territoryRef", "targetKey", "ownershipState", "ownerUnionId", "recordId", "eventAt"]);
  const UNCERTAINTY_FIELDS = new Set(["kind", "recordId", "targetKey", "target", "precision", "eventAt"]);
  const OWNERSHIP_STATES = new Set(["owned", "unclaimed", "unknown"]);
  const PERSISTED_FIELDS = new Set(["schemaVersion", "seasonId", "baseMapId", "savedAt", "servers"]);
  const SERVER_FIELDS = new Set(["id", "label", "ownership"]);

  class OwnershipProjectionComparatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipProjectionComparatorError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new OwnershipProjectionComparatorError(code, message);
  }

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

  function requireExactFields(value, fields, path) {
    if (!isPlainObject(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function compareStrings(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function validateTerritoryRef(value, path) {
    const fields = value && value.type === "strategic_node" ? new Set(["type", "nodeId"]) : new Set(["type", "row", "col"]);
    requireExactFields(value, fields, path);
    if (value.type === "strategic_node") {
      requireString(value.nodeId, `${path}.nodeId`);
      return;
    }
    if (value.type !== "normal_map_cell"
        || !Number.isInteger(value.row) || value.row < 1
        || !Number.isInteger(value.col) || value.col < 1) {
      fail("invalid_input", `${path} must identify a positive normal_map_cell.`);
    }
  }

  function persistedTerritoryKey(ref) {
    return ref.type === "strategic_node" ? JSON.stringify(["strategic_node", ref.nodeId]) : `${ref.row}-${ref.col}`;
  }

  function validateCanonicalTimestamp(value, path) {
    if (typeof value !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      fail("invalid_input", `${path} must be a canonical UTC timestamp.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      fail("invalid_input", `${path} must be a real canonical UTC timestamp.`);
    }
  }

  function resolverTerritoryKey(record, path) {
    validateTerritoryRef(record.territoryRef, `${path}.territoryRef`);
    return persistedTerritoryKey(record.territoryRef);
  }

  function validateOwner(record, path) {
    if (!OWNERSHIP_STATES.has(record.ownershipState)) fail("invalid_input", `${path}.ownershipState is invalid.`);
    if (record.ownershipState === "owned") {
      requireString(record.ownerUnionId, `${path}.ownerUnionId`);
    } else if (record.ownerUnionId !== null) {
      fail("invalid_input", `${path}.ownerUnionId must be null for ${record.ownershipState}.`);
    }
  }

  function validateResolverResult(result) {
    requireExactFields(result, RESULT_FIELDS, "resolverResult");
    const seasonId = requireString(result.seasonId, "resolverResult.seasonId");
    const serverId = requireString(result.serverId, "resolverResult.serverId");
    const territories = requireArray(result.territories, "resolverResult.territories");
    requireArray(result.structures, "resolverResult.structures");
    const uncertainty = requireArray(result.uncertainty, "resolverResult.uncertainty");
    requireArray(result.excludedRecords, "resolverResult.excludedRecords");
    requireArray(result.consistencyDiagnostics, "resolverResult.consistencyDiagnostics");
    const exactByKey = new Map();
    territories.forEach((record, index) => {
      requireExactFields(record, TERRITORY_FIELDS, `resolverResult.territories[${index}]`);
      validateOwner(record, `resolverResult.territories[${index}]`);
      const key = resolverTerritoryKey(record, `resolverResult.territories[${index}]`);
      if (exactByKey.has(key)) fail("invalid_input", `resolverResult.territories contains duplicate target '${key}'.`);
      exactByKey.set(key, record);
    });
    const uncertaintyByKey = new Map();
    uncertainty.forEach((entry, index) => {
      requireExactFields(entry, UNCERTAINTY_FIELDS, `resolverResult.uncertainty[${index}]`);
      if (entry.kind !== "territory" || !["bounded", "unknown"].includes(entry.precision)) fail("invalid_input", `resolverResult.uncertainty[${index}] is not a territory time uncertainty.`);
      requireString(entry.recordId, `resolverResult.uncertainty[${index}].recordId`);
      requireString(entry.targetKey, `resolverResult.uncertainty[${index}].targetKey`);
      validateTerritoryRef(entry.target, `resolverResult.uncertainty[${index}].target`);
      const key = persistedTerritoryKey(entry.target);
      const expectedTargetKey = entry.target.type === "strategic_node"
        ? JSON.stringify(["strategic_node", entry.target.nodeId])
        : JSON.stringify(["normal_map_cell", entry.target.row, entry.target.col]);
      if (entry.targetKey !== expectedTargetKey) fail("invalid_input", `resolverResult.uncertainty[${index}].targetKey does not match target.`);
      if (uncertaintyByKey.has(key)) uncertaintyByKey.get(key).push(entry);
      else uncertaintyByKey.set(key, [entry]);
    });
    return { seasonId, serverId, territories, exactByKey, uncertaintyByKey };
  }

  function validatePersistedProjection(value, seasonId, serverId) {
    requireExactFields(value, PERSISTED_FIELDS, "persistedProjection");
    if (value.schemaVersion !== 1) fail("invalid_input", "persistedProjection.schemaVersion must be 1.");
    if (value.seasonId !== seasonId) fail("scope_mismatch", "persistedProjection.seasonId does not match resolverResult.seasonId.");
    requireString(value.baseMapId, "persistedProjection.baseMapId");
    validateCanonicalTimestamp(value.savedAt, "persistedProjection.savedAt");
    const servers = requireArray(value.servers, "persistedProjection.servers");
    const serverRecords = new Map();
    servers.forEach((server, index) => {
      requireExactFields(server, SERVER_FIELDS, `persistedProjection.servers[${index}]`);
      const id = requireString(server.id, `persistedProjection.servers[${index}].id`);
      if (serverRecords.has(id)) fail("invalid_input", `persistedProjection.servers contains duplicate server '${id}'.`);
      if (Object.prototype.hasOwnProperty.call(server, "label")) requireString(server.label, `persistedProjection.servers[${index}].label`);
      if (!isPlainObject(server.ownership)) fail("invalid_input", `persistedProjection.servers[${index}].ownership must be a plain object.`);
      const ownership = new Map();
      Object.keys(server.ownership).forEach((key) => {
        const strategicKey = (() => {
          try {
            const parsed = JSON.parse(key);
            return Array.isArray(parsed) && parsed.length === 2 && parsed[0] === "strategic_node" && typeof parsed[1] === "string" && parsed[1].trim() !== "";
          } catch (_error) {
            return false;
          }
        })();
        if (!/^([1-9]\d*)-([1-9]\d*)$/.test(key) && !strategicKey) fail("invalid_input", `persistedProjection.servers[${index}].ownership key '${key}' is invalid.`);
        const valueAtKey = server.ownership[key];
        if (valueAtKey !== null && (typeof valueAtKey !== "string" || valueAtKey.trim() === "")) fail("invalid_input", `persistedProjection.servers[${index}].ownership['${key}'] is invalid.`);
        ownership.set(key, valueAtKey);
      });
      serverRecords.set(id, ownership);
    });
    if (!serverRecords.has(serverId)) fail("scope_mismatch", `persistedProjection does not contain server '${serverId}'.`);
    return serverRecords.get(serverId);
  }

  function createDifference(classification, territoryKey, authoritative, persisted, uncertainty) {
    const result = { classification, territoryKey, authoritative, persisted };
    if (uncertainty) result.uncertainty = uncertainty;
    return result;
  }

  function createOwnershipProjectionComparator() {
    function compare(input) {
      requireExactFields(input, INPUT_FIELDS, "input");
      const resolved = validateResolverResult(input.resolverResult);
      const persisted = validatePersistedProjection(input.persistedProjection, resolved.seasonId, resolved.serverId);
      const differences = [];
      const handledKeys = new Set();
      const exactEntries = Array.from(resolved.exactByKey.entries()).sort((left, right) => compareStrings(left[0], right[0]));

      exactEntries.forEach(([key, record]) => {
        handledKeys.add(key);
        const uncertainty = resolved.uncertaintyByKey.get(key);
        const authoritative = { ownershipState: record.ownershipState, ownerUnionId: record.ownerUnionId };
        const persistedEntry = persisted.has(key) ? { present: true, ownerUnionId: persisted.get(key) } : { present: false, ownerUnionId: null };
        if (uncertainty || record.ownershipState === "unknown") {
          const orderedUncertainty = (uncertainty || []).slice().sort((left, right) => compareStrings(left.recordId, right.recordId));
          differences.push(createDifference("uncertainty_not_projectable", key, authoritative, persistedEntry, orderedUncertainty));
          return;
        }
        const expectedOwner = record.ownershipState === "owned" ? record.ownerUnionId : null;
        if (!persisted.has(key)) differences.push(createDifference("missing_projection_entry", key, authoritative, persistedEntry));
        else if (persisted.get(key) !== expectedOwner) differences.push(createDifference("stale_projection_entry", key, authoritative, persistedEntry));
      });

      Array.from(resolved.uncertaintyByKey.keys()).sort().forEach((key) => {
        if (handledKeys.has(key)) return;
        const entries = resolved.uncertaintyByKey.get(key).slice().sort((left, right) => compareStrings(left.recordId, right.recordId));
        differences.push(createDifference("uncertainty_not_projectable", key, null, persisted.has(key) ? { present: true, ownerUnionId: persisted.get(key) } : { present: false, ownerUnionId: null }, entries));
        handledKeys.add(key);
      });

      Array.from(persisted.keys()).sort().forEach((key) => {
        if (handledKeys.has(key)) return;
        differences.push(createDifference("orphan_projection_entry", key, null, { present: true, ownerUnionId: persisted.get(key) }));
      });

      differences.sort((left, right) => compareStrings(left.territoryKey, right.territoryKey) || compareStrings(left.classification, right.classification));
      return { seasonId: resolved.seasonId, serverId: resolved.serverId, status: differences.length === 0 ? "matching_projection" : "reconciliation_required", differences };
    }

    return Object.freeze({ compare });
  }

  const exportsObject = { createOwnershipProjectionComparator, OwnershipProjectionComparatorError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));