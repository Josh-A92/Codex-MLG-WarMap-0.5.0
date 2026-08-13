const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createOwnershipHistoryResolver, OwnershipHistoryResolverError } = require("../src/services/ownership-history-resolver.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function territory(overrides = {}) {
  return { ownershipRecordId: "territory-1", serverId: "server-366", seasonId: "season-1", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownerUnionId: "union-1", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "actor-1", reviewerId: "reviewer-1", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null, ...overrides };
}
function structure(overrides = {}) {
  return { structureOwnershipId: "structure-1", serverId: "server-366", seasonId: "season-1", structureId: "fort-1", ownerUnionId: "union-1", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "actor-1", reviewerId: "reviewer-1", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null, ...overrides };
}
function resolver(targetCatalog = { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }], structures: [{ structureId: "fort-1", footprint: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }] }) {
  return createOwnershipHistoryResolver({ targetCatalog });
}
function expectError(fn, code) { assert.throws(fn, (error) => error instanceof OwnershipHistoryResolverError && error.code === code); }
function resolve(overrides = {}) { return resolver().resolve({ territoryRecords: [], structureRecords: [], seasonId: "season-1", serverId: "server-366", ...overrides }); }

test("resolves every ownership state and exact structure", () => {
  const result = resolve({ territoryRecords: [territory({ ownershipRecordId: "owned", territoryRef: { type: "normal_map_cell", row: 1, col: 1 } }), territory({ ownershipRecordId: "unclaimed", territoryRef: { type: "normal_map_cell", row: 1, col: 2 }, ownershipState: "unclaimed", ownerUnionId: null }), territory({ ownershipRecordId: "unknown", territoryRef: { type: "normal_map_cell", row: 2, col: 1 }, ownershipState: "unknown", ownerUnionId: null })], structureRecords: [structure()] });
  assert.deepStrictEqual(result.territories.map((item) => [item.targetKey, item.ownershipState, item.ownerUnionId]), [['["normal_map_cell",1,1]', "owned", "union-1"], ['["normal_map_cell",1,2]', "unclaimed", null], ['["normal_map_cell",2,1]', "unknown", null]]);
  assert.strictEqual(result.structures[0].structureId, "fort-1");
});

test("resolves correction chains and excludes proposed and rejected records", () => {
  const result = resolve({ territoryRecords: [territory({ ownershipRecordId: "proposal", reviewState: "proposed", reviewerId: null, reviewedAt: null }), territory({ ownershipRecordId: "rejected", reviewState: "rejected" }), territory({ ownershipRecordId: "old", ownerUnionId: "union-old", reviewState: "superseded", supersededBy: "middle" }), territory({ ownershipRecordId: "middle", ownerUnionId: "union-middle", reviewState: "superseded", supersededBy: "new", effectiveAt: "2026-08-02T00:00:00Z", reviewedAt: "2026-08-02T00:10:00Z" }), territory({ ownershipRecordId: "new", ownerUnionId: "union-new", effectiveAt: "2026-08-03T00:00:00Z", reviewedAt: "2026-08-03T00:10:00Z" })] });
  assert.strictEqual(result.territories[0].ownerUnionId, "union-new");
  assert.deepStrictEqual(result.excludedRecords.map((item) => item.reason), ["proposed", "rejected"]);
});

test("keeps bounded and unknown terminal records as uncertainty", () => {
  const bounded = territory({ ownershipRecordId: "bounded", territoryRef: { type: "normal_map_cell", row: 1, col: 2 }, eventAt: { precision: "bounded", earliestAt: "2026-08-01T00:00:00Z", latestAt: "2026-08-02T00:00:00Z" } });
  const unknown = territory({ ownershipRecordId: "unknown", territoryRef: { type: "normal_map_cell", row: 2, col: 1 }, eventAt: { precision: "unknown" } });
  delete bounded.effectiveAt;
  delete unknown.effectiveAt;
  const result = resolve({ territoryRecords: [bounded, unknown] });
  assert.deepStrictEqual(result.territories, []);
  assert.deepStrictEqual(result.uncertainty.map((item) => [item.recordId, item.precision]), [["bounded", "bounded"], ["unknown", "unknown"]]);
});

test("fails closed for malformed chains, contradictions, and invalid catalog targets", () => {
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "duplicate" }), territory({ ownershipRecordId: "duplicate", territoryRef: { type: "normal_map_cell", row: 1, col: 2 } })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "a", reviewState: "superseded", supersededBy: "missing" })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "self", reviewState: "superseded", supersededBy: "self" })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "a", reviewState: "superseded", supersededBy: "b" }), territory({ ownershipRecordId: "b", reviewState: "superseded", supersededBy: "a" })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "cross-scope", reviewState: "superseded", supersededBy: "other" }), territory({ ownershipRecordId: "other", serverId: "server-367" })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "cross-target", reviewState: "superseded", supersededBy: "other" }), territory({ ownershipRecordId: "other", territoryRef: { type: "normal_map_cell", row: 1, col: 2 } })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory(), territory({ ownershipRecordId: "two", effectiveAt: "2026-08-02T00:00:00Z", reviewedAt: "2026-08-02T00:10:00Z" })] }), "contradiction");
  expectError(() => resolve({ territoryRecords: [territory({ territoryRef: { type: "normal_map_cell", row: 9, col: 9 } })] }), "invalid_history");
  expectError(() => resolve({ structureRecords: [structure({ structureId: "missing" })] }), "invalid_history");
  expectError(() => resolve({ territoryRecords: [territory({ ownershipRecordId: "old", reviewState: "superseded", supersededBy: "new", reviewedAt: "2026-08-02T00:10:00Z" }), territory({ ownershipRecordId: "new", effectiveAt: "2026-07-31T00:00:00Z", reviewedAt: "2026-08-03T00:10:00Z" })] }), "invalid_history");
  assert.throws(() => createOwnershipHistoryResolver({ targetCatalog: { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 1 }], structures: [] } }), (error) => error.code === "invalid_target_catalog");
});

test("isolates season and server scopes", () => {
  const result = resolve({ territoryRecords: [territory({ ownershipRecordId: "other-server", serverId: "server-367", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownerUnionId: "union-other" }), territory({ ownershipRecordId: "other-season", seasonId: "season-2", territoryRef: { type: "normal_map_cell", row: 1, col: 2 }, ownerUnionId: "union-other" })] });
  assert.deepStrictEqual(result.territories, []);
  assert.deepStrictEqual(result.excludedRecords, []);
});

test("reports structure footprint gaps and conflicts without overwriting territories", () => {
  const result = resolve({ territoryRecords: [territory({ ownerUnionId: "union-other" })], structureRecords: [structure()] });
  assert.strictEqual(result.territories[0].ownerUnionId, "union-other");
  assert.deepStrictEqual(result.consistencyDiagnostics.map((item) => item.code), ["footprint_ownership_conflict", "missing_territory_record"]);
  const missing = resolve({ structureRecords: [structure()] });
  assert.deepStrictEqual(missing.consistencyDiagnostics.map((item) => item.code), ["missing_territory_record", "missing_territory_record"]);
});

test("is permutation-independent and does not mutate records or catalog", () => {
  const input = { territoryRecords: [territory(), territory({ ownershipRecordId: "second", territoryRef: { type: "normal_map_cell", row: 1, col: 2 } })], structureRecords: [structure()] };
  const targetCatalog = { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }], structures: [{ structureId: "fort-1", footprint: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }] };
  const before = clone(input);
  const catalogBefore = clone(targetCatalog);
  const first = resolver(targetCatalog).resolve({ ...input, seasonId: "season-1", serverId: "server-366" });
  const second = resolver(targetCatalog).resolve({ territoryRecords: input.territoryRecords.slice().reverse(), structureRecords: input.structureRecords.slice().reverse(), seasonId: "season-1", serverId: "server-366" });
  assert.deepStrictEqual(first, second);
  assert.deepStrictEqual(input, before);
  assert.deepStrictEqual(targetCatalog, catalogBefore);
});

test("keeps multiple uncertain terminals deterministic for one target", () => {
  const first = territory({ ownershipRecordId: "bounded-a", eventAt: { precision: "bounded", earliestAt: "2026-08-01T00:00:00Z", latestAt: "2026-08-02T00:00:00Z" } });
  const second = territory({ ownershipRecordId: "bounded-b", eventAt: { precision: "unknown" } });
  delete first.effectiveAt;
  delete second.effectiveAt;
  const resultA = resolve({ territoryRecords: [first, second] });
  const resultB = resolve({ territoryRecords: [second, first] });
  assert.deepStrictEqual(resultA, resultB);
  assert.deepStrictEqual(resultA.uncertainty.map((item) => item.recordId), ["bounded-a", "bounded-b"]);
});

test("supports browser globals and has no infrastructure dependency", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-history-resolver.js"), "utf8");
  const sandbox = { globalThis: {}, validateTerritoryOwnershipRecord() { return { valid: true, errors: [] }; }, validateStructureOwnershipRecord() { return { valid: true, errors: [] }; } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createOwnershipHistoryResolver, "function");
  assert.ok(!/document|fetch|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|require\(['"](?:fs|crypto)/.test(source));
});

let passed = 0;
for (const entry of tests) { entry.fn(); passed += 1; console.log(`PASS ${entry.name}`); }
console.log(`${passed} ownership history resolver scenarios passed`);