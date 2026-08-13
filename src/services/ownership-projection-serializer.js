(function initializeOwnershipProjectionSerializer(globalScope) {
  const SUPPORTED_SCHEMA_VERSION = 1;
  const FACTORY_FIELDS = new Set(["hashSha256"]);
  const RESULT_FIELDS = new Set(["seasonId", "serverId", "territories", "structures", "uncertainty", "excludedRecords", "consistencyDiagnostics"]);
  const TERRITORY_FIELDS = new Set(["territoryRef", "targetKey", "ownershipState", "ownerUnionId", "recordId", "eventAt"]);
  const STRUCTURE_FIELDS = new Set(["structureId", "targetKey", "ownershipState", "ownerUnionId", "recordId", "eventAt"]);
  const OWNERSHIP_STATES = new Set(["owned", "unclaimed", "unknown"]);

  class OwnershipProjectionSerializerError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipProjectionSerializerError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new OwnershipProjectionSerializerError(code, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_result", `${path} must be a non-empty string.`);
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_result", `${path} must be an array.`);
    return value;
  }

  function requireExactFields(value, fields, path) {
    if (!isPlainObject(value)) fail("invalid_result", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_result", `${path}.${unknown[0]} is not supported.`);
  }

  function validateOwner(record, path) {
    if (!OWNERSHIP_STATES.has(record.ownershipState)) fail("invalid_result", `${path}.ownershipState is invalid.`);
    if (record.ownershipState === "owned") {
      requireString(record.ownerUnionId, `${path}.ownerUnionId`);
    } else if (record.ownerUnionId !== null) {
      fail("invalid_result", `${path}.ownerUnionId must be null for ${record.ownershipState}.`);
    }
  }

  function validateTerritoryRef(value, path) {
    requireExactFields(value, new Set(["type", "row", "col"]), path);
    if (value.type !== "normal_map_cell") fail("invalid_result", `${path}.type is invalid.`);
    if (!Number.isInteger(value.row) || value.row < 1) fail("invalid_result", `${path}.row is invalid.`);
    if (!Number.isInteger(value.col) || value.col < 1) fail("invalid_result", `${path}.col is invalid.`);
  }

  function territorySortKey(record) {
    return JSON.stringify([record.territoryRef.type, record.territoryRef.row, record.territoryRef.col]);
  }

  function compareStrings(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function validateAndProjectTerritories(records) {
    const keys = new Set();
    return records.map((record, index) => {
      requireExactFields(record, TERRITORY_FIELDS, `territories[${index}]`);
      validateTerritoryRef(record.territoryRef, `territories[${index}].territoryRef`);
      validateOwner(record, `territories[${index}]`);
      const key = territorySortKey(record);
      if (keys.has(key)) fail("invalid_result", `territories contains duplicate target '${key}'.`);
      keys.add(key);
      return {
        target: { type: record.territoryRef.type, row: record.territoryRef.row, col: record.territoryRef.col },
        ownershipState: record.ownershipState,
        ownerUnionId: record.ownerUnionId
      };
    }).sort((left, right) => compareStrings(JSON.stringify(left.target), JSON.stringify(right.target)));
  }

  function validateAndProjectStructures(records) {
    const keys = new Set();
    return records.map((record, index) => {
      requireExactFields(record, STRUCTURE_FIELDS, `structures[${index}]`);
      const structureId = requireString(record.structureId, `structures[${index}].structureId`);
      validateOwner(record, `structures[${index}]`);
      if (keys.has(structureId)) fail("invalid_result", `structures contains duplicate target '${structureId}'.`);
      keys.add(structureId);
      return { structureId, ownershipState: record.ownershipState, ownerUnionId: record.ownerUnionId };
    }).sort((left, right) => compareStrings(left.structureId, right.structureId));
  }

  function encodeUtf8(value) {
    if (typeof TextEncoder !== "function") fail("invalid_environment", "TextEncoder is unavailable.");
    return new TextEncoder().encode(value);
  }

  function validateHash(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) fail("invalid_hash", "hashSha256 must return a lowercase 64-character hexadecimal SHA-256 fingerprint.");
    return value;
  }

  function createOwnershipProjectionSerializer(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    if (typeof options.hashSha256 !== "function") fail("invalid_factory", "hashSha256 must be a function.");
    const hashSha256 = options.hashSha256;

    function createPayload(result) {
      requireExactFields(result, RESULT_FIELDS, "resolverResult");
      const seasonId = requireString(result.seasonId, "resolverResult.seasonId");
      const serverId = requireString(result.serverId, "resolverResult.serverId");
      requireArray(result.territories, "resolverResult.territories");
      requireArray(result.structures, "resolverResult.structures");
      requireArray(result.uncertainty, "resolverResult.uncertainty");
      requireArray(result.excludedRecords, "resolverResult.excludedRecords");
      requireArray(result.consistencyDiagnostics, "resolverResult.consistencyDiagnostics");
      return {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        seasonId,
        serverId,
        territories: validateAndProjectTerritories(result.territories),
        structures: validateAndProjectStructures(result.structures)
      };
    }

    function serialize(result) {
      const payload = createPayload(result);
      const json = JSON.stringify(payload);
      return { payload, json, bytes: encodeUtf8(json) };
    }

    function fingerprint(result) {
      const serialized = serialize(result);
      let hash;
      try {
        hash = hashSha256(serialized.bytes);
      } catch (_error) {
        fail("hash_failed", "hashSha256 failed.");
      }
      return { ...serialized, fingerprint: validateHash(hash) };
    }

    return Object.freeze({ serialize, fingerprint });
  }

  const exportsObject = { createOwnershipProjectionSerializer, OwnershipProjectionSerializerError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));