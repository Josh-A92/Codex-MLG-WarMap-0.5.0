(function initializeOwnershipConflictAnalysisService(globalScope) {
  const FACTORY_FIELDS = new Set(["ownershipHistoryResolver"]);
  const INPUT_FIELDS = new Set(["seasonId", "serverId", "territoryRecords", "structureRecords", "retractionRecords"]);

  class OwnershipConflictAnalysisError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "OwnershipConflictAnalysisError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new OwnershipConflictAnalysisError(code, message, cause);
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
        value: clone(value[key]), enumerable: true, configurable: true, writable: true
      });
    });
    return output;
  }

  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`);
    return value;
  }

  function targetKey(record, kind) {
    if (!isRecord(record)) return null;
    if (kind === "structure") {
      return typeof record.structureId === "string" && record.structureId.trim() !== ""
        ? JSON.stringify(["logical_structure", record.structureId])
        : null;
    }
    const ref = record.territoryRef;
    if (!isRecord(ref)) return null;
    return ref.type === "strategic_node"
      ? (typeof ref.nodeId === "string" && ref.nodeId.trim() !== "" ? JSON.stringify(["strategic_node", ref.nodeId]) : null)
      : ref.type === "normal_map_cell" && Number.isInteger(ref.row) && Number.isInteger(ref.col)
        ? JSON.stringify(["normal_map_cell", ref.row, ref.col])
        : null;
  }

  function recordId(record, kind) {
    return kind === "structure" ? record.structureOwnershipId : record.ownershipRecordId;
  }

  function exactTerminal(record) {
    return !Object.prototype.hasOwnProperty.call(record, "eventAt")
      || (isRecord(record.eventAt) && record.eventAt.precision === "exact");
  }

  function normalizeDiagnostics(details) {
    if (!isRecord(details)) fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics must be an object.");
    const allowed = new Set(["kind", "targetKey", "recordIds"]);
    const unknown = Object.keys(details).filter((field) => !allowed.has(field)).sort();
    if (unknown.length > 0) fail("invalid_authoritative_history", `Ownership resolver contradiction diagnostics contain unsupported field '${unknown[0]}'.`);
    if (details.kind !== "territory" && details.kind !== "structure") fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics contain an unsupported kind.");
    if (typeof details.targetKey !== "string" || details.targetKey.trim() === "") fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics require targetKey.");
    if (!Array.isArray(details.recordIds) || details.recordIds.length < 2) fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics require at least two record IDs.");
    const recordIds = details.recordIds.map((recordId, index) => requireString(recordId, `diagnostics.recordIds[${index}]`));
    if (new Set(recordIds).size !== recordIds.length) fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics contain duplicate record IDs.");
    return { kind: details.kind, targetKey: details.targetKey, recordIds };
  }

  function createOwnershipConflictAnalysisService(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    if (!isRecord(options.ownershipHistoryResolver) || typeof options.ownershipHistoryResolver.resolve !== "function") {
      fail("invalid_factory", "options.ownershipHistoryResolver.resolve must be a function.");
    }
    const resolve = options.ownershipHistoryResolver.resolve.bind(options.ownershipHistoryResolver);

    function inspect(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      const seasonId = requireString(input.seasonId, "input.seasonId");
      const serverId = requireString(input.serverId, "input.serverId");
      const territoryRecords = requireArray(input.territoryRecords, "input.territoryRecords");
      const structureRecords = requireArray(input.structureRecords, "input.structureRecords");
      const retractionRecords = requireArray(input.retractionRecords, "input.retractionRecords");
      const resolverInput = {
        seasonId,
        serverId,
        territoryRecords: clone(territoryRecords),
        structureRecords: clone(structureRecords),
        retractionRecords: clone(retractionRecords)
      };

      try {
        resolve(resolverInput);
        return null;
      } catch (error) {
        if (!error || error.code !== "contradiction") {
          fail("invalid_authoritative_history", `Ownership conflict analysis could not resolve history: ${error && error.message ? error.message : "unknown resolver failure"}`, error);
        }
        const diagnostics = normalizeDiagnostics(error.details);
        const records = diagnostics.kind === "territory" ? territoryRecords : structureRecords;
        const idField = diagnostics.kind === "territory" ? "ownershipRecordId" : "structureOwnershipId";
        const recordById = new Map(records.map((record) => [record && record[idField], record]));
        const retractedIds = new Set(retractionRecords.map((record) => record && record.retractedRecordId));
        const ids = new Set(diagnostics.recordIds);
        records.forEach((record) => {
          if (!isRecord(record)
              || record.seasonId !== seasonId
              || record.serverId !== serverId
              || record.reviewState !== "confirmed"
              || record.supersededBy !== null
              || retractedIds.has(record[idField])
              || targetKey(record, diagnostics.kind) !== diagnostics.targetKey) return;
          ids.add(record[idField]);
        });
        const sortedRecordIds = Array.from(ids).sort();
        const conflictingRecords = sortedRecordIds.map((id) => recordById.get(id));
        if (conflictingRecords.length < 2 || conflictingRecords.some((record) => !isRecord(record))) {
          fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics reference missing records.");
        }
        if (conflictingRecords.some((record) => record.seasonId !== seasonId
            || record.serverId !== serverId
          || targetKey(record, diagnostics.kind) !== diagnostics.targetKey
            || !exactTerminal(record))) {
          fail("invalid_authoritative_history", "Ownership resolver contradiction diagnostics are not a narrow exact-terminal conflict.");
        }
        return clone({
          seasonId,
          serverId,
          kind: diagnostics.kind,
          targetKey: diagnostics.targetKey,
          recordIds: sortedRecordIds,
          records: conflictingRecords
        });
      }
    }

    return Object.freeze({ inspect });
  }

  const exportsObject = { createOwnershipConflictAnalysisService, OwnershipConflictAnalysisError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
