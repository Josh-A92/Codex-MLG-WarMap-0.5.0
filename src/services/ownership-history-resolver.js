(function initializeOwnershipHistoryResolver(globalScope) {
  const validatorExports = globalScope.validateTerritoryOwnershipRecord
    ? globalScope
    : (typeof require === "function" ? require("./ownership-record-validator.js") : {});
  const FACTORY_FIELDS = new Set(["targetCatalog"]);
  const INPUT_FIELDS = new Set(["territoryRecords", "structureRecords", "retractionRecords", "seasonId", "serverId"]);
  const OWNERSHIP_STATES = new Set(["owned", "unclaimed", "unknown"]);
  const REVIEW_STATES = new Set(["proposed", "confirmed", "rejected", "superseded"]);
  const RETRACTION_TARGET_KINDS = new Set(["territory_ownership_record", "structure_ownership_record"]);

  class OwnershipHistoryResolverError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "OwnershipHistoryResolverError";
      this.code = code;
      if (details !== undefined) this.details = details;
    }
  }

  function fail(code, message, details) {
    throw new OwnershipHistoryResolverError(code, message, details);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (!isPlainObject(value)) return value;
    const clone = Object.create(Object.getPrototypeOf(value));
    Object.keys(value).forEach((key) => Object.defineProperty(clone, key, {
      value: deepClone(value[key]), enumerable: true, configurable: true, writable: true
    }));
    return clone;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`);
    return value;
  }

  function exactObject(value, fields, path) {
    if (!isPlainObject(value)) fail("invalid_target_catalog", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_target_catalog", `${path}.${unknown[0]} is not supported.`);
  }

  function targetKey(ref) {
    return ref.type === "strategic_node"
      ? JSON.stringify(["strategic_node", ref.nodeId])
      : JSON.stringify(["normal_map_cell", ref.row, ref.col]);
  }

  function structureKey(structureId) {
    return JSON.stringify(["logical_structure", structureId]);
  }

  function validatePoint(value, path) {
    exactObject(value, new Set(["row", "col"]), path);
    if (!Number.isInteger(value.row) || value.row < 1) fail("invalid_target_catalog", `${path}.row must be positive.`);
    if (!Number.isInteger(value.col) || value.col < 1) fail("invalid_target_catalog", `${path}.col must be positive.`);
    return { row: value.row, col: value.col };
  }

  function validateTargetRef(value, path) {
    if (!isPlainObject(value)) fail("invalid_target_catalog", `${path} must be a target reference.`);
    if (value.type === "strategic_node") {
      exactObject(value, new Set(["type", "nodeId"]), path);
      return { type: "strategic_node", nodeId: requireString(value.nodeId, `${path}.nodeId`) };
    }
    if (Object.prototype.hasOwnProperty.call(value, "type")) {
      exactObject(value, new Set(["type", "row", "col"]), path);
      if (value.type !== "normal_map_cell") fail("invalid_target_catalog", `${path}.type is invalid.`);
      return { type: "normal_map_cell", ...validatePoint({ row: value.row, col: value.col }, path) };
    }
    return { type: "normal_map_cell", ...validatePoint(value, path) };
  }

  function createCatalog(value) {
    exactObject(value, new Set(["territoryKeys", "structures"]), "targetCatalog");
    requireArray(value.territoryKeys, "targetCatalog.territoryKeys");
    requireArray(value.structures, "targetCatalog.structures");
    const territoryKeys = new Set();
    value.territoryKeys.forEach((point, index) => {
      const normalized = validateTargetRef(point, `targetCatalog.territoryKeys[${index}]`);
      const key = targetKey(normalized);
      if (territoryKeys.has(key)) fail("invalid_target_catalog", `Duplicate territory key at index ${index}.`);
      territoryKeys.add(key);
    });
    const structures = new Map();
    value.structures.forEach((structure, index) => {
      exactObject(structure, new Set(["structureId", "footprint"]), `targetCatalog.structures[${index}]`);
      const id = requireString(structure.structureId, `targetCatalog.structures[${index}].structureId`);
      const footprint = requireArray(structure.footprint, `targetCatalog.structures[${index}].footprint`)
        .map((point, pointIndex) => validateTargetRef(point, `targetCatalog.structures[${index}].footprint[${pointIndex}]`));
      if (footprint.length === 0) fail("invalid_target_catalog", `Structure '${id}' must have a footprint.`);
      if (structures.has(id)) fail("invalid_target_catalog", `Duplicate structure ID '${id}'.`);
      if (territoryKeys.has(structureKey(id))) fail("invalid_target_catalog", `Structure '${id}' collides with a territory target.`);
      const footprintKeys = new Set(footprint.map(targetKey));
      if (footprintKeys.size !== footprint.length) fail("invalid_target_catalog", `Structure '${id}' has a duplicate footprint point.`);
      footprint.forEach((point) => {
        if (!territoryKeys.has(targetKey(point))) fail("invalid_target_catalog", `Structure '${id}' footprint is not a catalog territory.`);
      });
      structures.set(id, { structureId: id, footprint });
    });
    return {
      territoryKeys: Array.from(territoryKeys).sort(),
      structures: Array.from(structures.values()).sort((left, right) => left.structureId.localeCompare(right.structureId))
    };
  }

  function validateRecord(record, validator, kind, index) {
    let result;
    try { result = validator(record); } catch (_error) { fail("invalid_history", `${kind} record ${index} validator threw.`); }
    if (!isPlainObject(result) || result.valid !== true || !Array.isArray(result.errors)) {
      fail("invalid_history", `${kind} record ${index} validation failed.`, result && result.errors);
    }
  }

  function eventPrecision(record) {
    return Object.prototype.hasOwnProperty.call(record, "eventAt") ? record.eventAt && record.eventAt.precision : "exact";
  }

  function exactEventTime(record) {
    if (eventPrecision(record) !== "exact") return null;
    const value = record.eventAt ? record.eventAt.at : record.effectiveAt;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function reviewTime(record) {
    const parsed = Date.parse(record.reviewedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function canonicalTarget(record, kind) {
    return kind === "territory" ? targetKey(record.territoryRef) : structureKey(record.structureId);
  }

  function recordId(record, kind) {
    return kind === "territory" ? record.ownershipRecordId : record.structureOwnershipId;
  }

  function targetDescription(record, kind) {
    return kind === "territory" ? deepClone(record.territoryRef) : record.structureId;
  }

  function validateChain(records, idMap, kind) {
    const predecessorByReplacementId = new Map();
    records.forEach((record) => {
      if (record.reviewState !== "superseded") return;
      const sourceId = recordId(record, kind);
      const chainSeen = new Set();
      let current = record;
      while (current.reviewState === "superseded") {
        const currentId = recordId(current, kind);
        if (chainSeen.has(currentId)) fail("invalid_history", `Supersession cycle includes '${currentId}'.`);
        chainSeen.add(currentId);
        const replacement = idMap.get(current.supersededBy);
        if (!replacement) fail("invalid_history", `Supersession for '${currentId}' references a missing record.`);
        const replacementId = recordId(replacement, kind);
        if (replacementId === currentId) fail("invalid_history", `Record '${currentId}' supersedes itself.`);
        if (replacement.seasonId !== current.seasonId || replacement.serverId !== current.serverId) fail("invalid_history", `Supersession for '${currentId}' crosses scope.`);
        if (canonicalTarget(replacement, kind) !== canonicalTarget(current, kind)) fail("invalid_history", `Supersession for '${currentId}' crosses target.`);
        if (replacement.reviewState !== "confirmed" && replacement.reviewState !== "superseded") fail("invalid_history", `Supersession for '${currentId}' does not terminate in confirmed history.`);
        const predecessor = predecessorByReplacementId.get(replacementId);
        if (predecessor && predecessor !== currentId) {
          fail("invalid_history", `Supersession for '${replacementId}' has multiple predecessors.`);
        }
        predecessorByReplacementId.set(replacementId, currentId);
        const currentEventTime = exactEventTime(current);
        const replacementEventTime = exactEventTime(replacement);
        if (currentEventTime !== null && replacementEventTime !== null && replacementEventTime < currentEventTime) fail("invalid_history", `Supersession for '${currentId}' moves the fact earlier.`);
        const currentReviewTime = reviewTime(current);
        const replacementReviewTime = reviewTime(replacement);
        if (currentReviewTime !== null && replacementReviewTime !== null && replacementReviewTime < currentReviewTime) fail("invalid_history", `Supersession for '${currentId}' moves review earlier.`);
        current = replacement;
      }
      if (current.reviewState !== "confirmed") fail("invalid_history", `Supersession for '${sourceId}' has an invalid terminal state.`);
    });
  }

  function validateRetractionRecord(record, index) {
    if (!isPlainObject(record)) fail("invalid_history", `Retraction record ${index} must be a plain object.`);
    const required = [
      "retractionId",
      "seasonId",
      "serverId",
      "targetKind",
      "retractedRecordId",
      "actorId",
      "reason",
      "recordedAt",
      "transactionId",
      "sourceType"
    ];
    const allowed = new Set(required);
    required.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail("invalid_history", `Retraction record ${index} is missing '${field}'.`);
      }
    });
    const unknown = Object.keys(record).filter((field) => !allowed.has(field)).sort();
    if (unknown.length > 0) fail("invalid_history", `Retraction record ${index} has unsupported field '${unknown[0]}'.`);
    ["retractionId", "seasonId", "serverId", "retractedRecordId", "actorId", "reason", "recordedAt", "transactionId"].forEach((field) => {
      if (typeof record[field] !== "string" || record[field].trim() === "") {
        fail("invalid_history", `Retraction record ${index}.${field} must be a non-empty string.`);
      }
    });
    if (!RETRACTION_TARGET_KINDS.has(record.targetKind)) {
      fail("invalid_history", `Retraction record ${index}.targetKind is unsupported.`);
    }
    if (record.sourceType !== "manual_retraction") {
      fail("invalid_history", `Retraction record ${index}.sourceType must be 'manual_retraction'.`);
    }
  }

  function sortByTarget(left, right) {
    return left.targetKey.localeCompare(right.targetKey) || left.recordId.localeCompare(right.recordId);
  }

  function createOwnershipHistoryResolver(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    if (!Object.prototype.hasOwnProperty.call(options, "targetCatalog")) fail("invalid_factory", "targetCatalog is required.");
    const catalog = createCatalog(options.targetCatalog);
    const territoryValidator = validatorExports.validateTerritoryOwnershipRecord;
    const structureValidator = validatorExports.validateStructureOwnershipRecord;
    if (typeof territoryValidator !== "function" || typeof structureValidator !== "function") fail("invalid_factory", "Ownership record validators are unavailable.");
    const territoryCatalog = new Set(catalog.territoryKeys);
    const structureCatalog = new Map(catalog.structures.map((structure) => [structure.structureId, structure]));

    function resolve(input) {
      if (!isPlainObject(input)) fail("invalid_input", "resolve input must be a plain object.");
      const unknown = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
      if (unknown.length > 0) fail("invalid_input", `Unsupported input field '${unknown[0]}'.`);
      const seasonId = requireString(input.seasonId, "seasonId");
      const serverId = requireString(input.serverId, "serverId");
      const territoryRecords = requireArray(input.territoryRecords, "territoryRecords");
      const structureRecords = requireArray(input.structureRecords, "structureRecords");
      const retractionRecords = requireArray(input.retractionRecords || [], "retractionRecords");
      const territoryIds = new Map();
      const structureIds = new Map();
      territoryRecords.forEach((record, index) => {
        validateRecord(record, territoryValidator, "territory", index);
        const id = record.ownershipRecordId;
        if (territoryIds.has(id)) fail("invalid_history", `Duplicate territory record ID '${id}'.`);
        territoryIds.set(id, record);
        if (!REVIEW_STATES.has(record.reviewState) || !OWNERSHIP_STATES.has(record.ownershipState)) fail("invalid_history", `Territory record '${id}' has an invalid lifecycle state.`);
      });
      structureRecords.forEach((record, index) => {
        validateRecord(record, structureValidator, "structure", index);
        const id = record.structureOwnershipId;
        if (structureIds.has(id)) fail("invalid_history", `Duplicate structure record ID '${id}'.`);
        structureIds.set(id, record);
        if (!REVIEW_STATES.has(record.reviewState) || !OWNERSHIP_STATES.has(record.ownershipState)) fail("invalid_history", `Structure record '${id}' has an invalid lifecycle state.`);
      });
      validateChain(territoryRecords, territoryIds, "territory");
      validateChain(structureRecords, structureIds, "structure");

      const territories = [];
      const structures = [];
      const uncertainty = [];
      const excludedRecords = [];
      const consistencyDiagnostics = [];
      const terminalByTarget = new Map();
      const predecessorByKind = {
        territory: new Map(),
        structure: new Map()
      };
      const scopedRecordByKind = {
        territory: new Map(),
        structure: new Map()
      };

      function indexScope(records, kind, idField) {
        records.forEach((record) => {
          const id = record[idField];
          if (record.seasonId !== seasonId || record.serverId !== serverId) return;
          scopedRecordByKind[kind].set(id, record);
          if (record.reviewState === "superseded") {
            const replacementId = record.supersededBy;
            if (predecessorByKind[kind].has(replacementId)) {
              fail("invalid_history", `Supersession for '${replacementId}' has multiple predecessors.`);
            }
            predecessorByKind[kind].set(replacementId, id);
          }
        });
      }

      indexScope(territoryRecords, "territory", "ownershipRecordId");
      indexScope(structureRecords, "structure", "structureOwnershipId");

      const retractedByKind = {
        territory: new Set(),
        structure: new Set()
      };
      const retractedRecordIds = new Set();

      retractionRecords.forEach((record, index) => {
        validateRetractionRecord(record, index);
        if (record.seasonId !== seasonId || record.serverId !== serverId) return;
        if (retractedRecordIds.has(record.retractedRecordId)) {
          fail("invalid_history", `Duplicate retraction references '${record.retractedRecordId}'.`);
        }
        retractedRecordIds.add(record.retractedRecordId);
        const territoryRecord = scopedRecordByKind.territory.get(record.retractedRecordId);
        const structureRecord = scopedRecordByKind.structure.get(record.retractedRecordId);
        if (record.targetKind === "territory_ownership_record") {
          if (!territoryRecord || structureRecord) {
            fail("invalid_history", `Retraction '${record.retractionId}' references missing or wrong-kind territory record '${record.retractedRecordId}'.`);
          }
          retractedByKind.territory.add(record.retractedRecordId);
          return;
        }
        if (!structureRecord || territoryRecord) {
          fail("invalid_history", `Retraction '${record.retractionId}' references missing or wrong-kind structure record '${record.retractedRecordId}'.`);
        }
        retractedByKind.structure.add(record.retractedRecordId);
      });

      function resolveEffectiveTerminal(terminalRecord, kind, idField) {
        if (!terminalRecord) return null;
        let current = terminalRecord;
        const visited = new Set();
        while (current && retractedByKind[kind].has(current[idField])) {
          const currentId = current[idField];
          if (visited.has(currentId)) {
            fail("invalid_history", `Retraction walk found a cycle at '${currentId}'.`);
          }
          visited.add(currentId);
          const predecessorId = predecessorByKind[kind].get(currentId);
          if (!predecessorId) return null;
          current = scopedRecordByKind[kind].get(predecessorId) || null;
        }
        return current;
      }

      function collect(records, kind, idField) {
        records.forEach((record) => {
          const id = record[idField];
          if (record.seasonId !== seasonId || record.serverId !== serverId) return;
          const key = canonicalTarget(record, kind);
          if (kind === "territory" && !territoryCatalog.has(key)) fail("invalid_history", `Territory record '${id}' targets an unknown catalog cell.`);
          if (kind === "structure" && !structureCatalog.has(record.structureId)) fail("invalid_history", `Structure record '${id}' targets an unknown catalog structure.`);
          if (record.reviewState === "proposed" || record.reviewState === "rejected") {
            excludedRecords.push({ kind, recordId: id, targetKey: key, reason: record.reviewState });
            return;
          }
          if (record.reviewState !== "confirmed" || record.supersededBy !== null) return;
          const effective = resolveEffectiveTerminal(record, kind, idField);
          if (!effective) return;
          const terminalKey = `${kind}:${key}`;
          const existing = terminalByTarget.get(terminalKey);
          if (existing) {
            fail("contradiction", `Multiple terminal ${kind} records affect target '${key}'.`, { kind, targetKey: key, recordIds: [existing[idField], effective[idField]].sort() });
          }
          terminalByTarget.set(terminalKey, effective);
        });
      }

      collect(territoryRecords, "territory", "ownershipRecordId");
      collect(structureRecords, "structure", "structureOwnershipId");

      terminalByTarget.forEach((terminalRecord, terminalKey) => {
        const separator = terminalKey.indexOf(":");
        const kind = terminalKey.slice(0, separator);
        const key = terminalKey.slice(separator + 1);
        const idField = kind === "territory" ? "ownershipRecordId" : "structureOwnershipId";
        const effective = terminalRecord;
        const effectivePrecision = eventPrecision(effective);
        if (effectivePrecision !== "exact") {
          uncertainty.push({ kind, recordId: effective[idField], targetKey: key, target: targetDescription(effective, kind), precision: effectivePrecision, eventAt: deepClone(effective.eventAt) });
          return;
        }
        const value = {
          targetKey: key,
          ownershipState: effective.ownershipState,
          ownerUnionId: effective.ownerUnionId,
          recordId: effective[idField],
          eventAt: deepClone(effective.eventAt || { precision: "exact", at: effective.effectiveAt })
        };
        if (kind === "territory") territories.push({ territoryRef: deepClone(effective.territoryRef), ...value });
        else structures.push({ structureId: effective.structureId, ...value });
      });

      const territoryByKey = new Map(territories.map((entry) => [entry.targetKey, entry]));
      structures.forEach((structure) => {
        const catalogStructure = structureCatalog.get(structure.structureId);
        catalogStructure.footprint.forEach((point) => {
          const key = targetKey(point);
          const territory = territoryByKey.get(key);
          if (!territory) consistencyDiagnostics.push({ code: "missing_territory_record", structureId: structure.structureId, territoryKey: key, structureRecordId: structure.recordId });
          else if (territory.ownershipState !== structure.ownershipState || territory.ownerUnionId !== structure.ownerUnionId) consistencyDiagnostics.push({ code: "footprint_ownership_conflict", structureId: structure.structureId, territoryKey: key, structureRecordId: structure.recordId, territoryRecordId: territory.recordId });
        });
      });
      territories.sort(sortByTarget);
      structures.sort(sortByTarget);
      uncertainty.sort((left, right) => left.targetKey.localeCompare(right.targetKey) || left.recordId.localeCompare(right.recordId));
      excludedRecords.sort((left, right) => left.kind.localeCompare(right.kind) || left.targetKey.localeCompare(right.targetKey) || left.recordId.localeCompare(right.recordId));
      consistencyDiagnostics.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      return { seasonId, serverId, territories: deepClone(territories), structures: deepClone(structures), uncertainty: deepClone(uncertainty), excludedRecords: deepClone(excludedRecords), consistencyDiagnostics: deepClone(consistencyDiagnostics) };
    }

    return Object.freeze({ resolve });
  }

  const exportsObject = { createOwnershipHistoryResolver, OwnershipHistoryResolverError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
