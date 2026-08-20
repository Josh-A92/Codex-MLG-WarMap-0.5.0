(function initializeOwnershipProjectionMaterializer(globalScope) {
  const FACTORY_FIELDS = new Set(["ownershipHistoryResolver", "targetCatalog"]);
  const INPUT_FIELDS = new Set(["seasonId", "serverId", "territoryRecords", "structureRecords", "retractionRecords"]);

  class OwnershipProjectionMaterializerError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipProjectionMaterializerError";
      this.code = code;
    }
  }

  function fail(code, message) { throw new OwnershipProjectionMaterializerError(code, message); }
  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true }));
    return output;
  }
  function freeze(value) {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => freeze(value[key]));
    return Object.freeze(value);
  }
  function immutable(value) { return freeze(clone(value)); }
  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }
  function requiredString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }
  function positiveInteger(value, path) {
    if (!Number.isSafeInteger(value) || value < 1) fail("invalid_target_catalog", `${path} must be a positive integer.`);
    return value;
  }
  function territoryCatalogKey(ref) {
    return ref.type === "strategic_node"
      ? JSON.stringify(["strategic_node", ref.nodeId])
      : JSON.stringify(["normal_map_cell", ref.row, ref.col]);
  }
  function territoryProjectionKey(ref) {
    return ref.type === "strategic_node"
      ? JSON.stringify(["strategic_node", ref.nodeId])
      : `${ref.row}-${ref.col}`;
  }
  function normalizeCatalog(value) {
    rejectUnknown(value, new Set(["territoryKeys", "structures"]), "targetCatalog");
    if (!Array.isArray(value.territoryKeys) || !Array.isArray(value.structures)) fail("invalid_target_catalog", "targetCatalog requires territoryKeys and structures arrays.");
    const territoryKeys = new Set();
    value.territoryKeys.forEach((entry, index) => {
      if (!isRecord(entry)) fail("invalid_target_catalog", `targetCatalog.territoryKeys[${index}] must be an object.`);
      if (entry.type === "strategic_node") {
        rejectUnknown(entry, new Set(["type", "nodeId"]), `targetCatalog.territoryKeys[${index}]`);
        const key = JSON.stringify(["strategic_node", requiredString(entry.nodeId, `targetCatalog.territoryKeys[${index}].nodeId`)]);
        if (territoryKeys.has(key)) fail("invalid_target_catalog", `Duplicate territory key at index ${index}.`);
        territoryKeys.add(key);
      } else {
        rejectUnknown(entry, Object.prototype.hasOwnProperty.call(entry, "type") ? new Set(["type", "row", "col"]) : new Set(["row", "col"]), `targetCatalog.territoryKeys[${index}]`);
        if (Object.prototype.hasOwnProperty.call(entry, "type") && entry.type !== "normal_map_cell") fail("invalid_target_catalog", `targetCatalog.territoryKeys[${index}].type is invalid.`);
        const key = JSON.stringify(["normal_map_cell", positiveInteger(entry.row, `targetCatalog.territoryKeys[${index}].row`), positiveInteger(entry.col, `targetCatalog.territoryKeys[${index}].col`)]);
        if (territoryKeys.has(key)) fail("invalid_target_catalog", `Duplicate territory key at index ${index}.`);
        territoryKeys.add(key);
      }
    });
    const structureFootprints = new Map();
    value.structures.forEach((entry, index) => {
      rejectUnknown(entry, new Set(["structureId", "footprint"]), `targetCatalog.structures[${index}]`);
      const structureId = requiredString(entry.structureId, `targetCatalog.structures[${index}].structureId`);
      if (!Array.isArray(entry.footprint) || entry.footprint.length === 0 || structureFootprints.has(structureId)) fail("invalid_target_catalog", `targetCatalog.structures[${index}] is invalid.`);
      const footprint = entry.footprint.map((point, pointIndex) => {
        rejectUnknown(point, new Set(["row", "col"]), `targetCatalog.structures[${index}].footprint[${pointIndex}]`);
        const row = positiveInteger(point.row, `targetCatalog.structures[${index}].footprint[${pointIndex}].row`);
        const col = positiveInteger(point.col, `targetCatalog.structures[${index}].footprint[${pointIndex}].col`);
        if (!territoryKeys.has(JSON.stringify(["normal_map_cell", row, col]))) fail("invalid_target_catalog", `Structure '${structureId}' footprint is not a catalog territory.`);
        return { row, col, key: `${row}-${col}` };
      });
      if (new Set(footprint.map((point) => point.key)).size !== footprint.length) fail("invalid_target_catalog", `Structure '${structureId}' has duplicate footprint points.`);
      structureFootprints.set(structureId, footprint);
    });
    return { territoryKeys, structureFootprints };
  }

  function createOwnershipProjectionMaterializer(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    if (!isRecord(options.ownershipHistoryResolver) || typeof options.ownershipHistoryResolver.resolve !== "function") fail("invalid_factory", "options.ownershipHistoryResolver.resolve must be a function.");
    const resolver = options.ownershipHistoryResolver;
    const catalog = normalizeCatalog(options.targetCatalog);

    function materialize(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      requiredString(input.seasonId, "input.seasonId");
      requiredString(input.serverId, "input.serverId");
      ["territoryRecords", "structureRecords", "retractionRecords"].forEach((field) => {
        if (!Array.isArray(input[field])) fail("invalid_input", `input.${field} must be an array.`);
      });
      const resolved = resolver.resolve({ seasonId: input.seasonId, serverId: input.serverId, territoryRecords: input.territoryRecords, structureRecords: input.structureRecords, retractionRecords: input.retractionRecords });
      if (!isRecord(resolved) || !Array.isArray(resolved.territories) || !Array.isArray(resolved.structures)) fail("invalid_resolution", "Ownership resolver returned an invalid result.");
      const ownership = {};
      resolved.territories.forEach((record, index) => {
        if (!isRecord(record) || !isRecord(record.territoryRef)) fail("invalid_resolution", `Resolved territory ${index} is invalid.`);
        ownership[territoryProjectionKey(record.territoryRef)] = record.ownershipState === "owned" ? record.ownerUnionId : null;
      });
      resolved.structures.forEach((record, index) => {
        if (!isRecord(record) || typeof record.structureId !== "string" || !catalog.structureFootprints.has(record.structureId)) fail("invalid_resolution", `Resolved structure ${index} is invalid.`);
        catalog.structureFootprints.get(record.structureId).forEach((point) => {
          ownership[point.key] = record.ownershipState === "owned" ? record.ownerUnionId : null;
        });
      });
      return immutable(ownership);
    }

    function hasTerritory(territoryRef) { return isRecord(territoryRef) && catalog.territoryKeys.has(territoryCatalogKey(territoryRef)); }
    function hasStructure(structureId) { return typeof structureId === "string" && catalog.structureFootprints.has(structureId); }
    function projectionKeyForTerritory(territoryRef) { return territoryProjectionKey(territoryRef); }
    function projectionKeysForStructure(structureId) { return immutable((catalog.structureFootprints.get(structureId) || []).map((point) => point.key)); }

    return Object.freeze({ materialize, hasTerritory, hasStructure, projectionKeyForTerritory, projectionKeysForStructure });
  }

  const exportsObject = { createOwnershipProjectionMaterializer, OwnershipProjectionMaterializerError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));