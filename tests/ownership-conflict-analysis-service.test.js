const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createOwnershipConflictAnalysisService,
  OwnershipConflictAnalysisError
} = require("../src/services/ownership-conflict-analysis-service.js");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");

const targetCatalog = {
  territoryKeys: [
    { row: 1, col: 1 },
    { row: 1, col: 2 },
    { type: "strategic_node", nodeId: "node-a" }
  ],
  structures: [{ structureId: "fort-1", footprint: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }]
};

function territory(overrides = {}) {
  return {
    ownershipRecordId: "territory-1",
    seasonId: "season-1",
    serverId: "server-366",
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    ownerUnionId: "union-1",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-08-01T00:00:00Z",
    eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" },
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "actor-1",
    reviewedAt: "2026-08-01T00:10:00Z",
    supersededBy: null,
    ...overrides
  };
}

function structure(overrides = {}) {
  return {
    structureOwnershipId: "structure-1",
    seasonId: "season-1",
    serverId: "server-366",
    structureId: "fort-1",
    ownerUnionId: "union-1",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-08-01T00:00:00Z",
    eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" },
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "actor-1",
    reviewedAt: "2026-08-01T00:10:00Z",
    supersededBy: null,
    ...overrides
  };
}

function retraction(overrides = {}) {
  return {
    retractionId: "retraction-1",
    seasonId: "season-1",
    serverId: "server-366",
    targetKind: "territory_ownership_record",
    retractedRecordId: "territory-1",
    actorId: "actor-1",
    reason: "undo capture",
    recordedAt: "2026-08-01T00:20:00Z",
    transactionId: "transaction-1",
    sourceType: "manual_retraction",
    ...overrides
  };
}

function createResolver() {
  return createOwnershipHistoryResolver({ targetCatalog });
}

function createAnalyzer(resolver = createResolver()) {
  return createOwnershipConflictAnalysisService({ ownershipHistoryResolver: resolver });
}

function input(overrides = {}) {
  return {
    seasonId: "season-1",
    serverId: "server-366",
    territoryRecords: [],
    structureRecords: [],
    retractionRecords: [],
    ...overrides
  };
}

function expectAnalysisError(callback, code = "invalid_authoritative_history") {
  assert.throws(callback, (error) => error instanceof OwnershipConflictAnalysisError && error.code === code);
}

const analyzer = createAnalyzer();
assert.strictEqual(analyzer.inspect(input()), null);
console.log("PASS valid history without conflict returns null");

const territoryConflict = analyzer.inspect(input({
  territoryRecords: [
    territory({ ownershipRecordId: "territory-a", ownerUnionId: "union-a" }),
    territory({ ownershipRecordId: "territory-b", ownerUnionId: "union-b", effectiveAt: "2026-08-02T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-02T00:00:00Z" }, reviewedAt: "2026-08-02T00:10:00Z" })
  ]
}));
assert.strictEqual(territoryConflict.kind, "territory");
assert.deepStrictEqual(territoryConflict.recordIds, ["territory-a", "territory-b"]);
console.log("PASS territory conflict is derived with sorted records");

const structureConflict = analyzer.inspect(input({
  structureRecords: [
    structure({ structureOwnershipId: "structure-a", ownerUnionId: "union-a" }),
    structure({ structureOwnershipId: "structure-b", ownerUnionId: "union-b", effectiveAt: "2026-08-02T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-02T00:00:00Z" }, reviewedAt: "2026-08-02T00:10:00Z" })
  ]
}));
assert.strictEqual(structureConflict.kind, "structure");
assert.deepStrictEqual(structureConflict.recordIds, ["structure-a", "structure-b"]);
console.log("PASS structure conflict remains distinct");

const threeTerminals = analyzer.inspect(input({
  territoryRecords: [
    territory({ ownershipRecordId: "terminal-c", ownerUnionId: "union-c", effectiveAt: "2026-08-03T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-03T00:00:00Z" }, reviewedAt: "2026-08-03T00:10:00Z" }),
    territory({ ownershipRecordId: "terminal-a", ownerUnionId: "union-a" }),
    territory({ ownershipRecordId: "terminal-b", ownerUnionId: "union-b", effectiveAt: "2026-08-02T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-02T00:00:00Z" }, reviewedAt: "2026-08-02T00:10:00Z" })
  ]
}));
assert.deepStrictEqual(threeTerminals.recordIds, ["terminal-a", "terminal-b", "terminal-c"]);
const permuted = analyzer.inspect(input({ territoryRecords: input({}).territoryRecords.concat([]).concat([
  territory({ ownershipRecordId: "terminal-b", ownerUnionId: "union-b", effectiveAt: "2026-08-02T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-02T00:00:00Z" }, reviewedAt: "2026-08-02T00:10:00Z" }),
  territory({ ownershipRecordId: "terminal-c", ownerUnionId: "union-c", effectiveAt: "2026-08-03T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-03T00:00:00Z" }, reviewedAt: "2026-08-03T00:10:00Z" }),
  territory({ ownershipRecordId: "terminal-a", ownerUnionId: "union-a" })
]) }));
assert.deepStrictEqual(permuted, threeTerminals);
console.log("PASS three-terminal conflict output is permutation-independent");

const predecessor = analyzer.inspect(input({
  territoryRecords: [
    territory({ ownershipRecordId: "chain-a", ownerUnionId: "union-a", reviewState: "superseded", supersededBy: "chain-b" }),
    territory({ ownershipRecordId: "chain-b", ownerUnionId: "union-b", effectiveAt: "2026-08-02T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-02T00:00:00Z" }, reviewedAt: "2026-08-02T00:10:00Z" }),
      territory({ ownershipRecordId: "independent-c", ownerUnionId: "union-c", effectiveAt: "2026-08-03T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-03T00:00:00Z" }, reviewedAt: "2026-08-03T00:10:00Z" })
  ],
  retractionRecords: [retraction({ retractedRecordId: "chain-b" })]
}));
assert.deepStrictEqual(predecessor.recordIds, ["chain-a", "independent-c"]);
assert.strictEqual(predecessor.records.find((record) => record.ownershipRecordId === "chain-a").ownerUnionId, "union-a");
console.log("PASS effective predecessor exposed through retraction and supersession");

assert.strictEqual(analyzer.inspect(input({ territoryRecords: [territory({ serverId: "server-367" })] })), null);
assert.strictEqual(analyzer.inspect(input({ territoryRecords: [territory({ seasonId: "season-2" })] })), null);
console.log("PASS season and server isolation is preserved");

expectAnalysisError(() => createAnalyzer({ resolve() { throw Object.assign(new Error("bad diagnostics"), { code: "contradiction", details: { kind: "territory", targetKey: "bad", recordIds: ["a"] } }); } }).inspect(input()));
expectAnalysisError(() => createAnalyzer({ resolve() { throw Object.assign(new Error("missing record"), { code: "contradiction", details: { kind: "territory", targetKey: '["normal_map_cell",1,1]', recordIds: ["missing-a", "missing-b"] } }); } }).inspect(input({ territoryRecords: [territory({ ownershipRecordId: "present" })] })));
expectAnalysisError(() => createAnalyzer({ resolve() { throw Object.assign(new Error("malformed record"), { code: "contradiction", details: { kind: "territory", targetKey: '["normal_map_cell",1,1]', recordIds: ["malformed-a", "malformed-b"] } }); } }).inspect(input({ territoryRecords: [territory({ ownershipRecordId: "malformed-a", territoryRef: null }), territory({ ownershipRecordId: "malformed-b" })] })));
expectAnalysisError(() => createAnalyzer({ resolve() { throw Object.assign(new Error("uncertain"), { code: "contradiction", details: { kind: "territory", targetKey: '["normal_map_cell",1,1]', recordIds: ["a", "b"] } }); } }).inspect(input({
  territoryRecords: [
    territory({ ownershipRecordId: "a", eventAt: { precision: "bounded", earliestAt: "2026-08-01T00:00:00Z", latestAt: "2026-08-02T00:00:00Z" } }),
    territory({ ownershipRecordId: "b" })
  ]
})));
expectAnalysisError(() => createAnalyzer({ resolve() { throw Object.assign(new Error("invalid history"), { code: "invalid_history" }); } }).inspect(input()));
console.log("PASS malformed diagnostics, missing records, uncertainty, and non-conflict failures fail closed");

const original = input({ territoryRecords: [territory({ ownershipRecordId: "copy-a" }), territory({ ownershipRecordId: "copy-b", effectiveAt: "2026-08-02T00:00:00Z", eventAt: { precision: "exact", at: "2026-08-02T00:00:00Z" }, reviewedAt: "2026-08-02T00:10:00Z" })] });
const before = JSON.stringify(original);
const isolated = analyzer.inspect(original);
isolated.records[0].ownerUnionId = "mutated";
isolated.records[0].eventAt.at = "mutated";
assert.strictEqual(JSON.stringify(original), before);
console.log("PASS conflict records and inputs are deeply isolated");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-conflict-analysis-service.js"), "utf8");
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createOwnershipConflictAnalysisService, "function");
assert.doesNotMatch(source, /electron|ipcRenderer|ipcMain|GenerationStore|serverState|audit|filesystem|window\.document|fetch|require\(/i);
console.log("PASS analyzer is browser-global and host-neutral");

console.log("11 ownership conflict analysis scenarios passed");
