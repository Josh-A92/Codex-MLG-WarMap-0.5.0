const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");
const {
  serializeUnionRegistry,
  deserializeUnionRegistryEnvelope
} = require("../src/services/union-registry-state-serializer.js");
const {
  createUnionRegistryPersistenceService,
  UnionRegistryPersistenceServiceError
} = require("../src/services/union-registry-persistence-service.js");

function identities(name = "Bundled Union") {
  return [{
    unionId: "union-0001",
    displayName: name,
    tag: "ONE",
    aliases: [],
    defaultColor: "#112233",
    presentationMetadata: {},
    registryStatus: "current"
  }];
}

function createHarness(storedEnvelope) {
  const calls = [];
  const adapter = {
    storedEnvelope,
    async loadEnvelope(identity) {
      calls.push({ type: "load", identity });
      return this.storedEnvelope;
    },
    async saveEnvelope(identity, envelope) {
      calls.push({ type: "save", identity, envelope });
      this.storedEnvelope = envelope;
    }
  };
  const service = createUnionRegistryPersistenceService({
    storageAdapter: adapter,
    serializeUnionRegistry,
    deserializeUnionRegistryEnvelope,
    createUnionRegistryService,
    clock: () => new Date("2026-07-30T23:00:00.000Z")
  });
  return { service, adapter, calls };
}

(async () => {
  const missing = createHarness(null);
  const missingResult = await missing.service.load(identities());
  assert.strictEqual(missingResult.status, "missing");
  assert.strictEqual(missingResult.source, "bundled");
  assert.strictEqual(
    missingResult.unionRegistryService.getUnionIdentity("union-0001").displayName,
    "Bundled Union"
  );
  assert.deepStrictEqual(missing.calls[0].identity, {
    scope: "union_registry",
    registryId: "global"
  });

  const storedService = createUnionRegistryService(identities("Stored Union"));
  const storedEnvelope = serializeUnionRegistry(
    storedService,
    "2026-07-29T23:00:00.000Z"
  );
  const restored = createHarness(storedEnvelope);
  const restoredResult = await restored.service.load(identities());
  assert.strictEqual(restoredResult.status, "restored");
  assert.strictEqual(restoredResult.source, "storage");
  assert.strictEqual(restoredResult.savedAt, "2026-07-29T23:00:00.000Z");
  assert.strictEqual(
    restoredResult.unionRegistryService.getUnionIdentity("union-0001").displayName,
    "Stored Union"
  );

  const saveHarness = createHarness(null);
  const saveResult = await saveHarness.service.save(storedService);
  assert.deepStrictEqual(saveResult, {
    status: "saved",
    savedAt: "2026-07-30T23:00:00.000Z"
  });
  assert.strictEqual(saveHarness.calls[0].type, "save");
  assert.strictEqual(saveHarness.calls[0].envelope.identities[0].displayName, "Stored Union");

  const malformed = createHarness({});
  await assert.rejects(
    () => malformed.service.load(identities()),
    (error) => error instanceof UnionRegistryPersistenceServiceError
      && error.code === "stored_registry_invalid"
  );

  const invalidStoredIdentity = createHarness({
    schemaVersion: 1,
    savedAt: "2026-07-30T23:00:00.000Z",
    identities: [{ ...identities()[0], aliases: ["same", "SAME"] }]
  });
  await assert.rejects(
    () => invalidStoredIdentity.service.load(identities()),
    (error) => error.code === "stored_registry_invalid"
  );

  const loadFailure = createHarness(null);
  loadFailure.adapter.loadEnvelope = async () => {
    throw new Error("load failure");
  };
  const loadFailureService = createUnionRegistryPersistenceService({
    storageAdapter: loadFailure.adapter,
    serializeUnionRegistry,
    deserializeUnionRegistryEnvelope,
    createUnionRegistryService,
    clock: () => new Date()
  });
  await assert.rejects(
    () => loadFailureService.load(identities()),
    (error) => error.code === "storage_load_failed" && error.cause.message === "load failure"
  );

  await assert.rejects(
    () => missing.service.load({}),
    (error) => error.code === "invalid_input"
  );

  assert.throws(
    () => createUnionRegistryPersistenceService({}),
    (error) => error.code === "invalid_factory"
  );

  class Adapter {
    async loadEnvelope() {
      assert.strictEqual(this instanceof Adapter, true);
      return null;
    }
    async saveEnvelope() {
      assert.strictEqual(this instanceof Adapter, true);
    }
  }
  const classService = createUnionRegistryPersistenceService({
    storageAdapter: new Adapter(),
    serializeUnionRegistry,
    deserializeUnionRegistryEnvelope,
    createUnionRegistryService,
    clock: () => new Date("2026-07-30T23:00:00.000Z")
  });
  assert.strictEqual((await classService.load(identities())).status, "missing");

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "union-registry-persistence-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createUnionRegistryPersistenceService, "function");
  assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

  console.log("ok - union registry persistence service");
  console.log("\n1 test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
