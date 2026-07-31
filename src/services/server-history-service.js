(function initializeServerHistoryServiceFactory(globalScope) {
  const FIELDS = new Set([
    "confirmedSnapshotService",
    "ownershipRecordService",
    "confirmedSnapshotChangeService"
  ]);

  class ServerHistoryServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ServerHistoryServiceError";
      this.code = code;
    }
  }
  function fail(code, message) {
    throw new ServerHistoryServiceError(code, message);
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
      fail("invalid_input", `Server History Service requires ${path} to be non-empty.`);
    }
    return value;
  }
  function bind(value, field, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Server History Service requires options.${field}.`);
    }
    return methods.reduce((bound, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Server History Service requires options.${field}.${method}.`);
      }
      bound[method] = value[method].bind(value);
      return bound;
    }, {});
  }

  function createServerHistoryService(options) {
    if (!isRecord(options)) fail("invalid_factory", "Server History Service requires options.");
    FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Server History Service requires options.${field}.`);
      }
    });
    const unknown = Object.keys(options).filter((field) => !FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unknown option '${unknown[0]}'.`);
    const snapshots = bind(options.confirmedSnapshotService, "confirmedSnapshotService", ["listSnapshots"]);
    const ownership = bind(
      options.ownershipRecordService,
      "ownershipRecordService",
      ["listTerritoryRecords", "listStructureRecords"]
    );
    const changes = bind(
      options.confirmedSnapshotChangeService,
      "confirmedSnapshotChangeService",
      ["compare"]
    );

    function getTimeline(serverId, seasonId) {
      const server = requireString(serverId, "serverId");
      const season = requireString(seasonId, "seasonId");
      const listedSnapshots = snapshots.listSnapshots({ serverId: server, seasonId: season });
      const territoryRecords = ownership.listTerritoryRecords({ serverId: server, seasonId: season });
      const structureRecords = ownership.listStructureRecords({ serverId: server, seasonId: season });
      if (!Array.isArray(listedSnapshots)
          || !Array.isArray(territoryRecords)
          || !Array.isArray(structureRecords)) {
        fail("invalid_dependency", "Server History Service dependencies must return arrays.");
      }
      const ordered = clone(listedSnapshots).sort((left, right) => {
        if (!isRecord(left) || !isRecord(right)
            || !Number.isFinite(Date.parse(left.createdAt))
            || !Number.isFinite(Date.parse(right.createdAt))) {
          fail("invalid_dependency", "Server History Service received an invalid snapshot.");
        }
        return Date.parse(left.createdAt) - Date.parse(right.createdAt)
          || left.snapshotId.localeCompare(right.snapshotId);
      });
      return ordered.map((snapshot, index) => {
        if (snapshot.serverId !== server || snapshot.seasonId !== season) {
          fail("invalid_dependency", "Server History Service received an out-of-scope snapshot.");
        }
        if (index === 0) {
          if (snapshot.previousConfirmedSnapshotId !== null) {
            fail("inconsistent_history", "First timeline snapshot must have no previous baseline.");
          }
          return { snapshot: clone(snapshot), changesFromPrevious: null };
        }
        const previous = ordered[index - 1];
        if (snapshot.previousConfirmedSnapshotId !== previous.snapshotId) {
          fail("inconsistent_history", "Timeline snapshots must form one consecutive chain.");
        }
        return {
          snapshot: clone(snapshot),
          changesFromPrevious: clone(changes.compare({
            currentSnapshot: snapshot,
            previousSnapshot: previous,
            territoryOwnershipRecords: territoryRecords,
            structureOwnershipRecords: structureRecords
          }))
        };
      });
    }
    return { getTimeline };
  }

  const exportsObject = { createServerHistoryService, ServerHistoryServiceError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
