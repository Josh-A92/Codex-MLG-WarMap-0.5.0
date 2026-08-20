const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");
const { createOwnershipProjectionMaterializer, OwnershipProjectionMaterializerError } = require("../src/services/ownership-projection-materializer.js");

const catalog = { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { type: "strategic_node", nodeId: "node-a" }], structures: [{ structureId: "fort-1", footprint: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }] };
function territory(overrides = {}) { return { ownershipRecordId: "territory-1", seasonId: "season-1", serverId: "server-366", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownerUnionId: "union-1", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "actor", reviewerId: "actor", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null, ...overrides }; }
function structure(overrides = {}) { return { structureOwnershipId: "structure-1", seasonId: "season-1", serverId: "server-366", structureId: "fort-1", ownerUnionId: "union-1", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "actor", reviewerId: "actor", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null, ...overrides }; }
function retraction(overrides = {}) { return { retractionId: "retraction-1", seasonId: "season-1", serverId: "server-366", targetKind: "structure_ownership_record", retractedRecordId: "structure-1", actorId: "actor", reason: "undo", recordedAt: "2026-08-01T00:20:00Z", transactionId: "tx-1", sourceType: "manual_retraction", ...overrides }; }
function materializer() { return createOwnershipProjectionMaterializer({ ownershipHistoryResolver: createOwnershipHistoryResolver({ targetCatalog: catalog }), targetCatalog: catalog }); }
function materialize(overrides = {}) { return materializer().materialize({ seasonId: "season-1", serverId: "server-366", territoryRecords: [], structureRecords: [], retractionRecords: [], ...overrides }); }

assert.deepStrictEqual(materialize({ territoryRecords: [territory()] }), { "1-1": "union-1" });
assert.deepStrictEqual(materialize({ territoryRecords: [territory({ territoryRef: { type: "strategic_node", nodeId: "node-a" } })] }), { [JSON.stringify(["strategic_node", "node-a"])]: "union-1" });
assert.deepStrictEqual(materialize({ territoryRecords: [territory({ ownershipRecordId: "underlying", ownerUnionId: "union-base" })], structureRecords: [structure({ ownerUnionId: "union-structure" })] }), { "1-1": "union-structure", "1-2": "union-structure" });
assert.deepStrictEqual(materialize({ territoryRecords: [territory({ ownershipRecordId: "underlying", ownerUnionId: "union-base" })], structureRecords: [structure()], retractionRecords: [retraction()] }), { "1-1": "union-base" });
assert.deepStrictEqual(materialize({ territoryRecords: [territory({ ownershipState: "unclaimed", ownerUnionId: null, territoryRef: { type: "normal_map_cell", row: 1, col: 2 } })] }), { "1-2": null });
assert.deepStrictEqual(materialize(), {});
assert.throws(() => materialize({ territoryRecords: [territory(), territory({ ownershipRecordId: "second" })] }), (error) => error.code === "contradiction");
const bounded = territory({ eventAt: { precision: "bounded", earliestAt: "2026-08-01T00:00:00Z", latestAt: "2026-08-02T00:00:00Z" } }); delete bounded.effectiveAt;
assert.deepStrictEqual(materialize({ territoryRecords: [bounded] }), {});
assert.deepStrictEqual(materialize({ territoryRecords: [territory({ serverId: "server-367" })] }), {});
assert.throws(() => materialize({ territoryRecords: [territory({ ownershipRecordId: "duplicate" }), territory({ ownershipRecordId: "duplicate", territoryRef: { type: "normal_map_cell", row: 1, col: 2 } })] }), (error) => error.code === "invalid_history");
const input = { territoryRecords: [territory()], structureRecords: [structure()] }; const before = JSON.stringify(input); const catalogBefore = JSON.stringify(catalog);
const first = materializer().materialize({ seasonId: "season-1", serverId: "server-366", retractionRecords: [], ...input }); const second = materializer().materialize({ seasonId: "season-1", serverId: "server-366", territoryRecords: input.territoryRecords.slice().reverse(), structureRecords: input.structureRecords.slice().reverse(), retractionRecords: [] });
assert.deepStrictEqual(first, second); assert.strictEqual(JSON.stringify(input), before); assert.strictEqual(JSON.stringify(catalog), catalogBefore); assert.strictEqual(Object.isFrozen(first), true);
assert.throws(() => createOwnershipProjectionMaterializer({ ownershipHistoryResolver: {}, targetCatalog: catalog }), (error) => error instanceof OwnershipProjectionMaterializerError && error.code === "invalid_factory");
assert.throws(() => createOwnershipProjectionMaterializer({ ownershipHistoryResolver: createOwnershipHistoryResolver({ targetCatalog: catalog }), targetCatalog: { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 1 }], structures: [] } }), (error) => error instanceof OwnershipProjectionMaterializerError && error.code === "invalid_target_catalog");
const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-projection-materializer.js"), "utf8"); const sandbox = { globalThis: {} }; vm.createContext(sandbox); vm.runInContext(source, sandbox); assert.strictEqual(typeof sandbox.globalThis.createOwnershipProjectionMaterializer, "function"); assert.doesNotMatch(source, /electron|ipc|GenerationStore|filesystem|localStorage|indexedDB|fetch|write|commit|publish|prepare/);
console.log("12 ownership projection materializer scenarios passed");