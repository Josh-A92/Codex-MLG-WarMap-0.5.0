const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createOwnershipProjectionSerializer, OwnershipProjectionSerializerError } = require("../src/services/ownership-projection-serializer.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hashSha256(bytes) { return crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex"); }
function result(overrides = {}) {
  return {
    seasonId: "season-1", serverId: "server-366",
    territories: [
      { targetKey: "ignored", territoryRef: { type: "normal_map_cell", row: 2, col: 1 }, ownershipState: "unknown", ownerUnionId: null, recordId: "record-b", eventAt: { precision: "unknown" } },
      { targetKey: "ignored", territoryRef: { type: "normal_map_cell", row: 1, col: 2 }, ownershipState: "unclaimed", ownerUnionId: null, recordId: "record-a", eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } },
      { targetKey: "ignored", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownershipState: "owned", ownerUnionId: "union-1", recordId: "record-c", eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } }
    ],
    structures: [
      { structureId: "z-structure", targetKey: "ignored", ownershipState: "unclaimed", ownerUnionId: null, recordId: "structure-b", eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } },
      { structureId: "a-structure", targetKey: "ignored", ownershipState: "owned", ownerUnionId: "union-2", recordId: "structure-a", eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } }
    ],
    uncertainty: [], excludedRecords: [], consistencyDiagnostics: [], ...overrides
  };
}
function serializer(hash = hashSha256) { return createOwnershipProjectionSerializer({ hashSha256: hash }); }
function expectError(fn, code) { assert.throws(fn, (error) => error instanceof OwnershipProjectionSerializerError && error.code === code); }

test("canonicalizes target ordering and preserves ownership state and owner", () => {
  const output = serializer().fingerprint(result({ structures: [
    { structureId: "z-structure", targetKey: "ignored", ownershipState: "unclaimed", ownerUnionId: null, recordId: "structure-b", eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } },
    { structureId: "ä-structure", targetKey: "ignored", ownershipState: "owned", ownerUnionId: "union-2", recordId: "structure-a", eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } }
  ] }));
  assert.deepStrictEqual(output.payload.territories.map((item) => item.target), [{ type: "normal_map_cell", row: 1, col: 1 }, { type: "normal_map_cell", row: 1, col: 2 }, { type: "normal_map_cell", row: 2, col: 1 }]);
  assert.deepStrictEqual(output.payload.territories.map((item) => [item.ownershipState, item.ownerUnionId]), [["owned", "union-1"], ["unclaimed", null], ["unknown", null]]);
  assert.deepStrictEqual(output.payload.structures.map((item) => item.structureId), ["z-structure", "ä-structure"]);
  assert.strictEqual(output.payload.schemaVersion, 1);
});

test("equivalent insertion and input ordering produce identical bytes and hashes", () => {
  const first = result();
  const second = result({
    territories: result().territories.slice().reverse().map((item) => ({ eventAt: item.eventAt, ownerUnionId: item.ownerUnionId, recordId: item.recordId, ownershipState: item.ownershipState, territoryRef: { col: item.territoryRef.col, type: item.territoryRef.type, row: item.territoryRef.row }, targetKey: item.targetKey })),
    structures: result().structures.slice().reverse().map((item) => ({ eventAt: item.eventAt, ownerUnionId: item.ownerUnionId, recordId: item.recordId, ownershipState: item.ownershipState, structureId: item.structureId, targetKey: item.targetKey }))
  });
  const firstOutput = serializer().fingerprint(first);
  const secondOutput = serializer().fingerprint(second);
  assert.strictEqual(firstOutput.json, secondOutput.json);
  assert.strictEqual(firstOutput.fingerprint, secondOutput.fingerprint);
  assert.deepStrictEqual(Array.from(firstOutput.bytes), Array.from(secondOutput.bytes));
});

test("meaningful state, owner, target, season, and server changes alter bytes and hash", () => {
  const baseline = serializer().fingerprint(result());
  [
    result({ territories: result().territories.map((item) => item.territoryRef.row === 1 && item.territoryRef.col === 1 ? { ...item, ownershipState: "unclaimed", ownerUnionId: null } : item) }),
    result({ territories: result().territories.map((item) => item.territoryRef.row === 1 && item.territoryRef.col === 1 ? { ...item, ownerUnionId: "union-other" } : item) }),
    result({ territories: result().territories.map((item) => item.territoryRef.row === 1 && item.territoryRef.col === 1 ? { ...item, territoryRef: { type: "normal_map_cell", row: 3, col: 1 } } : item) }),
    result({ seasonId: "season-2" }), result({ serverId: "server-367" })
  ].forEach((changed) => {
    const output = serializer().fingerprint(changed);
    assert.notStrictEqual(output.json, baseline.json);
    assert.notStrictEqual(output.fingerprint, baseline.fingerprint);
  });
});

test("diagnostics and volatile record metadata do not affect projection", () => {
  const base = serializer().fingerprint(result());
  const changed = serializer().fingerprint(result({ uncertainty: [{ anything: "ignored" }], excludedRecords: [{ anything: "ignored" }], consistencyDiagnostics: [{ anything: "ignored" }], territories: result().territories.map((item) => ({ ...item, recordId: "different", eventAt: { precision: "exact", at: "2099-01-01T00:00:00Z" } })) }));
  assert.strictEqual(changed.json, base.json);
  assert.strictEqual(changed.fingerprint, base.fingerprint);
});

test("validates hash results, malformed resolver output, and UTF-8 bytes", () => {
  expectError(() => serializer(() => "bad").fingerprint(result()), "invalid_hash");
  expectError(() => serializer(() => "A".repeat(64)).fingerprint(result()), "invalid_hash");
  expectError(() => serializer(() => { throw new Error("hash failed"); }).fingerprint(result()), "hash_failed");
  expectError(() => serializer().fingerprint({ ...result(), territories: [{ ...result().territories[0], ownershipState: "owned", ownerUnionId: null }] }), "invalid_result");
  expectError(() => serializer().fingerprint({ ...result(), structures: [{ ...result().structures[0], structureId: "" }] }), "invalid_result");
  const unicode = serializer().fingerprint(result({ seasonId: "Säsön-火", territories: result().territories.map((item) => item.ownershipState === "owned" ? { ...item, ownerUnionId: "联盟-🌙" } : item) }));
  assert.deepStrictEqual(Array.from(unicode.bytes), Array.from(new TextEncoder().encode(unicode.json)));
  assert.strictEqual(unicode.fingerprint.length, 64);
});

test("repeated execution does not mutate resolver results", () => {
  const input = result();
  const before = clone(input);
  const output = serializer().fingerprint(input);
  const repeated = serializer().fingerprint(input);
  assert.deepStrictEqual(input, before);
  assert.strictEqual(output.json, repeated.json);
  assert.strictEqual(output.fingerprint, repeated.fingerprint);
});

test("supports browser globals and has no host integration", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-projection-serializer.js"), "utf8");
  const sandbox = { globalThis: {}, TextEncoder };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createOwnershipProjectionSerializer, "function");
  assert.ok(!/document|fetch|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|serverState|applicationAudit|generation|score|require\(['"](?:fs|crypto)/.test(source));
});

let passed = 0;
for (const entry of tests) { entry.fn(); passed += 1; console.log(`PASS ${entry.name}`); }
console.log(`${passed} ownership projection serializer scenarios passed`);