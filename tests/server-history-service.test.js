const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createServerHistoryService } = require("../src/services/server-history-service.js");

function snapshot(id, createdAt, previousConfirmedSnapshotId) {
  return {
    snapshotId: id, serverId: "server-366", seasonId: "season-1",
    createdAt, previousConfirmedSnapshotId,
    ownershipRecordIds: [], structureOwnershipRecordIds: []
  };
}
const first = snapshot("snapshot-1", "2026-07-29T10:00:00Z", null);
const second = snapshot("snapshot-2", "2026-07-30T10:00:00Z", "snapshot-1");
const calls = [];
const service = createServerHistoryService({
  confirmedSnapshotService: {
    listSnapshots(filter) {
      assert.deepStrictEqual(filter, { serverId: "server-366", seasonId: "season-1" });
      return [second, first];
    }
  },
  ownershipRecordService: {
    listTerritoryRecords: () => [],
    listStructureRecords: () => []
  },
  confirmedSnapshotChangeService: {
    compare(input) {
      calls.push(input);
      return {
        currentSnapshotId: input.currentSnapshot.snapshotId,
        baselineSnapshotId: input.previousSnapshot.snapshotId,
        territoryChanges: [],
        structureChanges: [],
        unionDeltas: []
      };
    }
  }
});
const timeline = service.getTimeline("server-366", "season-1");
assert.deepStrictEqual(timeline.map((entry) => entry.snapshot.snapshotId), ["snapshot-1", "snapshot-2"]);
assert.strictEqual(timeline[0].changesFromPrevious, null);
assert.strictEqual(timeline[1].changesFromPrevious.baselineSnapshotId, "snapshot-1");
assert.strictEqual(calls.length, 1);
timeline[1].snapshot.snapshotId = "changed";
assert.strictEqual(second.snapshotId, "snapshot-2");

const broken = createServerHistoryService({
  confirmedSnapshotService: { listSnapshots: () => [
    first,
    { ...second, previousConfirmedSnapshotId: "wrong" }
  ] },
  ownershipRecordService: {
    listTerritoryRecords: () => [],
    listStructureRecords: () => []
  },
  confirmedSnapshotChangeService: { compare: () => ({}) }
});
assert.throws(() => broken.getTimeline("server-366", "season-1"), (error) => error.code === "inconsistent_history");
assert.throws(() => service.getTimeline(" ", "season-1"), /non-empty/);
assert.throws(() => createServerHistoryService({}), /requires options/);

class Snapshots {
  listSnapshots() {
    assert.strictEqual(this instanceof Snapshots, true);
    return [];
  }
}
assert.doesNotThrow(() => createServerHistoryService({
  confirmedSnapshotService: new Snapshots(),
  ownershipRecordService: {
    listTerritoryRecords: () => [],
    listStructureRecords: () => []
  },
  confirmedSnapshotChangeService: { compare: () => ({}) }
}).getTimeline("server-366", "season-1"));

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "server-history-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createServerHistoryService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));
console.log("ok - server history service");
console.log("\n1 test passed");
