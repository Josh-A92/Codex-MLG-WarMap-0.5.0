const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");
const {
  validateUnionRegistryEnvelope,
  serializeUnionRegistry,
  deserializeUnionRegistryEnvelope
} = require("../src/services/union-registry-state-serializer.js");

function identity(id = "union-0001") {
  return {
    unionId: id,
    displayName: "Moonlight Guillotine",
    tag: "MLG",
    aliases: ["Moonlight G"],
    defaultColor: "#8FCEFF",
    presentationMetadata: JSON.parse('{"__proto__":{"polluted":true},"emblem":"crescent"}'),
    registryStatus: "current"
  };
}

function envelope() {
  return {
    schemaVersion: 1,
    savedAt: "2026-07-30T23:00:00.000Z",
    identities: [identity()]
  };
}

assert.deepStrictEqual(validateUnionRegistryEnvelope(envelope()), {
  valid: true,
  errors: [],
  warnings: []
});

const missing = envelope();
delete missing.identities;
assert.ok(validateUnionRegistryEnvelope(missing).errors.some(
  (entry) => entry.code === "MISSING_REQUIRED_FIELD"
));

const unknown = envelope();
unknown.extra = true;
unknown.identities[0].extra = true;
assert.strictEqual(validateUnionRegistryEnvelope(unknown).valid, false);

const duplicate = envelope();
duplicate.identities.push(identity());
assert.ok(validateUnionRegistryEnvelope(duplicate).errors.some(
  (entry) => entry.code === "DUPLICATE_UNION_ID"
));

const duplicateAlias = envelope();
duplicateAlias.identities[0].aliases.push("moonlight g");
assert.ok(validateUnionRegistryEnvelope(duplicateAlias).errors.some(
  (entry) => entry.code === "DUPLICATE_ALIAS"
));

const invalidMetadata = envelope();
invalidMetadata.identities[0].presentationMetadata = { value: new Date() };
assert.ok(validateUnionRegistryEnvelope(invalidMetadata).errors.some(
  (entry) => entry.code === "INVALID_METADATA"
));

[
  ["defaultColor", "blue"],
  ["registryStatus", "deleted"],
  ["displayName", "   "]
].forEach(([field, value]) => {
  const candidate = envelope();
  candidate.identities[0][field] = value;
  assert.strictEqual(validateUnionRegistryEnvelope(candidate).valid, false, field);
});

const service = createUnionRegistryService([
  identity(),
  { ...identity("union-0002"), tag: "ARC", aliases: [], registryStatus: "archived" }
]);
const serialized = serializeUnionRegistry(service, "2026-07-30T23:00:00.000Z");
assert.strictEqual(serialized.identities.length, 2);
assert.strictEqual(serialized.identities[1].registryStatus, "archived");
assert.strictEqual(Object.prototype.hasOwnProperty.call(
  serialized.identities[0].presentationMetadata,
  "__proto__"
), true);
assert.strictEqual({}.polluted, undefined);

serialized.identities[0].displayName = "changed";
assert.strictEqual(service.getUnionIdentity("union-0001").displayName, "Moonlight Guillotine");

const restoredEnvelope = deserializeUnionRegistryEnvelope(serialized);
const restoredService = createUnionRegistryService(restoredEnvelope.identities);
assert.strictEqual(restoredService.getUnionIdentity("union-0002").registryStatus, "archived");
restoredEnvelope.identities[1].displayName = "changed again";
assert.notStrictEqual(restoredService.getUnionIdentity("union-0002").displayName, "changed again");

class Registry {
  constructor(identities) {
    this.identities = identities;
  }
  listUnionIdentities(options) {
    assert.deepStrictEqual(options, { includeArchived: true });
    assert.strictEqual(this instanceof Registry, true);
    return this.identities;
  }
}
assert.strictEqual(
  serializeUnionRegistry(new Registry([identity()]), "2026-07-30T23:00:00.000Z").identities.length,
  1
);

assert.throws(
  () => serializeUnionRegistry({}, "2026-07-30T23:00:00.000Z"),
  (error) => error.code === "UNION_REGISTRY_SERIALIZATION_FAILED"
);
assert.throws(
  () => deserializeUnionRegistryEnvelope({}),
  (error) => error.code === "UNION_REGISTRY_SERIALIZATION_FAILED"
);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "union-registry-state-serializer.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateUnionRegistryEnvelope, "function");
assert.strictEqual(typeof sandbox.globalThis.serializeUnionRegistry, "function");
assert.strictEqual(typeof sandbox.globalThis.deserializeUnionRegistryEnvelope, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - union registry state serializer");
console.log("\n1 test passed");
