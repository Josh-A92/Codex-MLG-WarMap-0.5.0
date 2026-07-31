(function initializeConfirmedSnapshotChangeServiceFactory(globalScope) {
  const INPUT_FIELDS = new Set([
    "currentSnapshot",
    "previousSnapshot",
    "territoryOwnershipRecords",
    "structureOwnershipRecords"
  ]);

  class ConfirmedSnapshotChangeServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ConfirmedSnapshotChangeServiceError";
      this.code = code;
    }
  }
  function fail(code, message) {
    throw new ConfirmedSnapshotChangeServiceError(code, message);
  }
  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function defineOwn(target, key, value) {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwn(output, key, clone(value[key])));
    return output;
  }
  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Confirmed Snapshot Change Service requires ${path} to be non-empty.`);
    }
    return value;
  }
  function requireSnapshot(value, path) {
    if (!isRecord(value)) fail("invalid_input", `Confirmed Snapshot Change Service requires ${path}.`);
    ["snapshotId", "serverId", "seasonId"].forEach((field) => requireString(value[field], `${path}.${field}`));
    ["ownershipRecordIds", "structureOwnershipRecordIds"].forEach((field) => {
      if (!Array.isArray(value[field])) {
        fail("invalid_input", `Confirmed Snapshot Change Service requires ${path}.${field} to be an array.`);
      }
    });
    return value;
  }

  function createConfirmedSnapshotChangeService() {
    function compare(input) {
      if (!isRecord(input)) fail("invalid_input", "Confirmed Snapshot Change Service requires input.");
      INPUT_FIELDS.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(input, field)) {
          fail("invalid_input", `Confirmed Snapshot Change Service requires input.${field}.`);
        }
      });
      const unknown = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
      if (unknown.length > 0) {
        fail("invalid_input", `Confirmed Snapshot Change Service does not recognize input.${unknown[0]}.`);
      }
      const current = requireSnapshot(input.currentSnapshot, "input.currentSnapshot");
      const previous = requireSnapshot(input.previousSnapshot, "input.previousSnapshot");
      if (current.serverId !== previous.serverId || current.seasonId !== previous.seasonId) {
        fail("scope_mismatch", "Snapshots must belong to the same server and season.");
      }
      if (current.previousConfirmedSnapshotId !== previous.snapshotId) {
        fail("baseline_mismatch", "Current snapshot must identify the previous snapshot as its baseline.");
      }
      if (!Array.isArray(input.territoryOwnershipRecords)
          || !Array.isArray(input.structureOwnershipRecords)) {
        fail("invalid_input", "Ownership record collections must be arrays.");
      }

      function buildIndex(records, idField, type) {
        const index = new Map();
        records.forEach((record, position) => {
          if (!isRecord(record)) {
            fail("invalid_record", `${type} ownership record at index ${position} must be a plain object.`);
          }
          const id = requireString(record[idField], `${type}OwnershipRecords[${position}].${idField}`);
          if (index.has(id)) fail("duplicate_record_id", `Duplicate ownership record ID '${id}'.`);
          if (record.serverId !== current.serverId || record.seasonId !== current.seasonId) {
            fail("scope_mismatch", `Ownership record '${id}' does not match snapshot scope.`);
          }
          index.set(id, record);
        });
        return index;
      }
      const territoryIndex = buildIndex(
        input.territoryOwnershipRecords,
        "ownershipRecordId",
        "territory"
      );
      const structureIndex = buildIndex(
        input.structureOwnershipRecords,
        "structureOwnershipId",
        "structure"
      );

      function resolve(ids, index, targetKey, label) {
        const byTarget = new Map();
        ids.forEach((id, position) => {
          requireString(id, `${label}[${position}]`);
          const record = index.get(id);
          if (!record) fail("unresolved_reference", `${label}[${position}] '${id}' cannot be resolved.`);
          const key = targetKey(record);
          if (byTarget.has(key)) fail("duplicate_target", `${label} selects target '${key}' more than once.`);
          byTarget.set(key, record);
        });
        return byTarget;
      }
      const territoryKey = (record) => {
        if (!isRecord(record.territoryRef)
            || record.territoryRef.type !== "normal_map_cell"
            || !Number.isInteger(record.territoryRef.row)
            || !Number.isInteger(record.territoryRef.col)) {
          fail("invalid_record", "Territory ownership record has invalid territoryRef.");
        }
        return JSON.stringify(["normal_map_cell", record.territoryRef.row, record.territoryRef.col]);
      };
      const structureKey = (record) => JSON.stringify([
        "logical_structure",
        requireString(record.structureId, "structureOwnershipRecord.structureId")
      ]);

      const currentTerritory = resolve(
        current.ownershipRecordIds, territoryIndex, territoryKey, "currentSnapshot.ownershipRecordIds"
      );
      const previousTerritory = resolve(
        previous.ownershipRecordIds, territoryIndex, territoryKey, "previousSnapshot.ownershipRecordIds"
      );
      const currentStructures = resolve(
        current.structureOwnershipRecordIds, structureIndex, structureKey,
        "currentSnapshot.structureOwnershipRecordIds"
      );
      const previousStructures = resolve(
        previous.structureOwnershipRecordIds, structureIndex, structureKey,
        "previousSnapshot.structureOwnershipRecordIds"
      );

      const unionDeltas = new Map();
      function adjust(record, field, amount) {
        if (!record || record.ownershipState !== "owned" || typeof record.ownerUnionId !== "string") return;
        if (!unionDeltas.has(record.ownerUnionId)) {
          unionDeltas.set(record.ownerUnionId, { unionId: record.ownerUnionId, territoryDelta: 0, structureDelta: 0 });
        }
        unionDeltas.get(record.ownerUnionId)[field] += amount;
      }
      function differences(before, after, kind) {
        const keys = Array.from(new Set([...before.keys(), ...after.keys()])).sort();
        const changes = [];
        keys.forEach((key) => {
          const prior = before.get(key) || null;
          const next = after.get(key) || null;
          const same = prior !== null && next !== null
            && prior.ownershipState === next.ownershipState
            && prior.ownerUnionId === next.ownerUnionId;
          if (same) return;
          const field = kind === "territory" ? "territoryDelta" : "structureDelta";
          adjust(prior, field, -1);
          adjust(next, field, 1);
          changes.push({
            targetType: kind,
            targetRef: kind === "territory"
              ? clone((next || prior).territoryRef)
              : { type: "logical_structure", structureId: (next || prior).structureId },
            before: prior === null ? null : {
              recordId: prior.ownershipRecordId || prior.structureOwnershipId,
              ownershipState: prior.ownershipState,
              ownerUnionId: prior.ownerUnionId
            },
            after: next === null ? null : {
              recordId: next.ownershipRecordId || next.structureOwnershipId,
              ownershipState: next.ownershipState,
              ownerUnionId: next.ownerUnionId
            }
          });
        });
        return changes;
      }

      return {
        serverId: current.serverId,
        seasonId: current.seasonId,
        currentSnapshotId: current.snapshotId,
        baselineSnapshotId: previous.snapshotId,
        territoryChanges: differences(previousTerritory, currentTerritory, "territory"),
        structureChanges: differences(previousStructures, currentStructures, "structure"),
        unionDeltas: Array.from(unionDeltas.values())
          .filter((delta) => delta.territoryDelta !== 0 || delta.structureDelta !== 0)
          .sort((left, right) => left.unionId.localeCompare(right.unionId))
      };
    }
    return { compare };
  }

  const exportsObject = {
    createConfirmedSnapshotChangeService,
    ConfirmedSnapshotChangeServiceError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
