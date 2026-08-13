const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createOwnershipProjectionComparator, OwnershipProjectionComparatorError } = require("../src/services/ownership-projection-comparator.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function territory(row, col, ownershipState = "owned", ownerUnionId = "union-1", overrides = {}) {
  return { targetKey: JSON.stringify(["normal_map_cell", row, col]), territoryRef: { type: "normal_map_cell", row, col }, ownershipState, ownerUnionId, recordId: `record-${row}-${col}`, eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" }, ...overrides };
}
function resolverResult(overrides = {}) {
  return { seasonId: "season-1", serverId: "server-366", territories: [territory(1, 1), territory(1, 2, "unclaimed", null), territory(1, 3, "unknown", null)], structures: [], uncertainty: [], excludedRecords: [], consistencyDiagnostics: [], ...overrides };
}
function persisted(ownership = {}, overrides = {}) {
  return { schemaVersion: 1, seasonId: "season-1", baseMapId: "season1-map", savedAt: "2026-08-01T00:00:00.000Z", servers: [{ id: "server-366", label: "Server 366", ownership }], ...overrides };
}
function comparator() { return createOwnershipProjectionComparator(); }
function expectError(fn, code) { assert.throws(fn, (error) => error instanceof OwnershipProjectionComparatorError && error.code === code); }

test("classifies matching, missing, stale, orphan, and uncertainty", () => {
  const result = resolverResult({ territories: [territory(1, 1), territory(1, 2, "unclaimed", null), territory(1, 3, "unknown", null), territory(1, 4)] });
  const output = comparator().compare({ resolverResult: result, persistedProjection: persisted({ "1-1": "union-1", "1-2": "wrong", "9-9": null }) });
  assert.strictEqual(output.status, "reconciliation_required");
  assert.deepStrictEqual(output.differences.map((item) => [item.territoryKey, item.classification]), [["1-2", "stale_projection_entry"], ["1-3", "uncertainty_not_projectable"], ["1-4", "missing_projection_entry"], ["9-9", "orphan_projection_entry"]]);
  const matching = comparator().compare({ resolverResult: resolverResult({ territories: [territory(1, 1), territory(1, 2, "unclaimed", null)], structures: [] }), persistedProjection: persisted({ "1-1": "union-1", "1-2": null }) });
  assert.strictEqual(matching.status, "matching_projection");
  assert.deepStrictEqual(matching.differences, []);
});

test("preserves ownership-state distinctions and uncertainty precedence", () => {
  const result = resolverResult({ territories: [territory(2, 2, "unknown", null)], uncertainty: [{ kind: "territory", recordId: "bounded-z", targetKey: '["normal_map_cell",2,2]', target: { type: "normal_map_cell", row: 2, col: 2 }, precision: "bounded", eventAt: { precision: "bounded" } }, { kind: "territory", recordId: "bounded-a", targetKey: '["normal_map_cell",2,2]', target: { type: "normal_map_cell", row: 2, col: 2 }, precision: "bounded", eventAt: { precision: "bounded" } }] });
  const output = comparator().compare({ resolverResult: result, persistedProjection: persisted({ "2-2": null }) });
  assert.strictEqual(output.differences[0].classification, "uncertainty_not_projectable");
  assert.strictEqual(output.differences[0].authoritative.ownershipState, "unknown");
  assert.deepStrictEqual(output.differences[0].uncertainty.map((entry) => entry.recordId), ["bounded-a", "bounded-z"]);
  const unclaimed = comparator().compare({ resolverResult: resolverResult({ territories: [territory(2, 2, "unclaimed", null)], structures: [] }), persistedProjection: persisted({ "2-2": null }) });
  assert.strictEqual(unclaimed.status, "matching_projection");
});

test("orders differences independently of input and object order", () => {
  const first = { resolverResult: resolverResult({ territories: [territory(3, 2), territory(1, 9), territory(2, 1)] }), persistedProjection: persisted({ "8-8": null, "1-9": "wrong" }) };
  const second = { resolverResult: { consistencyDiagnostics: [], excludedRecords: [], uncertainty: [], structures: [], serverId: "server-366", seasonId: "season-1", territories: first.resolverResult.territories.slice().reverse() }, persistedProjection: persisted({ "1-9": "wrong", "8-8": null }) };
  assert.deepStrictEqual(comparator().compare(first), comparator().compare(second));
});

test("rejects scope mismatch, malformed keys, values, duplicates, and resolver output", () => {
  expectError(() => comparator().compare({ resolverResult: resolverResult(), persistedProjection: persisted({}, { seasonId: "season-2" }) }), "scope_mismatch");
  expectError(() => comparator().compare({ resolverResult: resolverResult({ serverId: "server-367" }), persistedProjection: persisted() }), "scope_mismatch");
  expectError(() => comparator().compare({ resolverResult: resolverResult(), persistedProjection: persisted({ "bad-key": null }) }), "invalid_input");
  expectError(() => comparator().compare({ resolverResult: resolverResult(), persistedProjection: persisted({ "1-1": 0 }) }), "invalid_input");
  expectError(() => comparator().compare({ resolverResult: resolverResult(), persistedProjection: persisted({}, { savedAt: "2026-08-01T00:00:00Z" }) }), "invalid_input");
  expectError(() => comparator().compare({ resolverResult: resolverResult(), persistedProjection: persisted({}, { servers: [{ id: "server-366", ownership: {} }, { id: "server-366", ownership: {} }] }) }), "invalid_input");
  expectError(() => comparator().compare({ resolverResult: { ...resolverResult(), territories: "bad" }, persistedProjection: persisted() }), "invalid_input");
  expectError(() => comparator().compare({ resolverResult: resolverResult({ territories: [territory(1, 1), territory(1, 1)] }), persistedProjection: persisted() }), "invalid_input");
  expectError(() => comparator().compare({ resolverResult: resolverResult({ uncertainty: [{ kind: "territory", recordId: "bad", targetKey: "wrong", target: { type: "normal_map_cell", row: 1, col: 1 }, precision: "bounded", eventAt: { precision: "bounded" } }] }), persistedProjection: persisted() }), "invalid_input");
});

test("does not mutate either input", () => {
  const resolverInput = resolverResult({ territories: [territory(2, 2), territory(1, 1)] });
  const persistedInput = persisted({ "1-1": "union-1", "4-4": null });
  const resolverBefore = clone(resolverInput);
  const persistedBefore = clone(persistedInput);
  comparator().compare({ resolverResult: resolverInput, persistedProjection: persistedInput });
  assert.deepStrictEqual(resolverInput, resolverBefore);
  assert.deepStrictEqual(persistedInput, persistedBefore);
});

test("supports browser globals and has no host integration", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-projection-comparator.js"), "utf8");
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createOwnershipProjectionComparator, "function");
  assert.ok(!/serverState|persistence|generation|applicationAudit|electron|ipcRenderer|ipcMain|document|fetch|WebSocket|score|fs|crypto|clock/.test(source));
});

let passed = 0;
for (const entry of tests) { entry.fn(); passed += 1; console.log(`PASS ${entry.name}`); }
console.log(`${passed} ownership projection comparator scenarios passed`);