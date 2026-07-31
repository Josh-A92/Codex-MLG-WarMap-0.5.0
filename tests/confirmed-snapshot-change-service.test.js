const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createConfirmedSnapshotChangeService,
  ConfirmedSnapshotChangeServiceError
} = require("../src/services/confirmed-snapshot-change-service.js");

function territory(id, row, ownerUnionId, ownershipState = "owned") {
  return {
    ownershipRecordId: id, serverId: "server-366", seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row, col: 1 },
    ownerUnionId, ownershipState
  };
}
function structure(id, structureId, ownerUnionId, ownershipState = "owned") {
  return {
    structureOwnershipId: id, serverId: "server-366", seasonId: "season-1",
    structureId, ownerUnionId, ownershipState
  };
}
const previous = {
  snapshotId: "snapshot-1", serverId: "server-366", seasonId: "season-1",
  ownershipRecordIds: ["territory-old", "territory-stable"],
  structureOwnershipRecordIds: ["structure-old"],
  previousConfirmedSnapshotId: null
};
const current = {
  snapshotId: "snapshot-2", serverId: "server-366", seasonId: "season-1",
  ownershipRecordIds: ["territory-new", "territory-stable"],
  structureOwnershipRecordIds: ["structure-new"],
  previousConfirmedSnapshotId: "snapshot-1"
};
const input = {
  currentSnapshot: current,
  previousSnapshot: previous,
  territoryOwnershipRecords: [
    territory("territory-old", 1, "union-a"),
    territory("territory-new", 1, "union-b"),
    territory("territory-stable", 2, "union-a")
  ],
  structureOwnershipRecords: [
    structure("structure-old", "town-1", "union-a"),
    structure("structure-new", "town-1", null, "unclaimed")
  ]
};

const service = createConfirmedSnapshotChangeService();
const result = service.compare(input);
assert.strictEqual(result.currentSnapshotId, "snapshot-2");
assert.strictEqual(result.baselineSnapshotId, "snapshot-1");
assert.strictEqual(result.territoryChanges.length, 1);
assert.strictEqual(result.structureChanges.length, 1);
assert.deepStrictEqual(result.unionDeltas, [
  { unionId: "union-a", territoryDelta: -1, structureDelta: -1 },
  { unionId: "union-b", territoryDelta: 1, structureDelta: 0 }
]);
result.territoryChanges[0].targetRef.row = 99;
assert.strictEqual(input.territoryOwnershipRecords[0].territoryRef.row, 1);

assert.throws(
  () => service.compare({ ...input, currentSnapshot: { ...current, previousConfirmedSnapshotId: "wrong" } }),
  (error) => error instanceof ConfirmedSnapshotChangeServiceError
    && error.code === "baseline_mismatch"
);
assert.throws(
  () => service.compare({ ...input, territoryOwnershipRecords: input.territoryOwnershipRecords.slice(1) }),
  (error) => error.code === "unresolved_reference"
);
assert.throws(
  () => service.compare({
    ...input,
    previousSnapshot: { ...previous, serverId: "server-367" }
  }),
  (error) => error.code === "scope_mismatch"
);
assert.throws(() => service.compare({}), /requires input/);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "confirmed-snapshot-change-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createConfirmedSnapshotChangeService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));
console.log("ok - confirmed snapshot change service");
console.log("\n1 test passed");
