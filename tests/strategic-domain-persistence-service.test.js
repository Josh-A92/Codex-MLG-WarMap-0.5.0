const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createStrategicDomainPersistenceService,
  StrategicDomainPersistenceServiceError
} = require("../src/services/strategic-domain-persistence-service.js");

const fields = [
  "relations", "nativeAssignments", "activeStatuses", "combatStrengthObservations",
  "serverObservations", "territoryOwnershipRecords", "structureOwnershipRecords",
  "targetVerifications", "confirmedSnapshots", "confirmedPresenceFacts",
  "qualifyingFullMapConfirmations"
];
function state() {
  return fields.reduce((result, field) => {
    result[field] = [];
    return result;
  }, {});
}
function envelope(overrides = {}) {
  return {
    schemaVersion: 1,
    seasonId: "season-1",
    savedAt: "2026-07-30T23:50:00.000Z",
    state: state(),
    ...overrides
  };
}
function registry(known = ["union-1"]) {
  return {
    getUnionIdentity(unionId) {
      return known.includes(unionId) ? { unionId } : null;
    }
  };
}
function harness(stored = null) {
  const calls = [];
  const adapter = {
    stored,
    async loadEnvelope(identity) {
      calls.push({ action: "load", identity });
      return this.stored;
    },
    async saveEnvelope(identity, value) {
      calls.push({ action: "save", identity, value });
      this.stored = value;
    }
  };
  const service = createStrategicDomainPersistenceService({
    storageAdapter: adapter,
    serializeStrategicDomainRuntime: (_runtime, seasonId, savedAt) => envelope({ seasonId, savedAt }),
    deserializeStrategicDomainEnvelope: (value) => value,
    createStrategicDomainRuntime: (options) => ({ initializedFrom: options.initialState }),
    modules: {},
    clock: () => new Date("2026-07-30T23:50:00.000Z")
  });
  return { service, adapter, calls };
}

(async () => {
  const missing = harness();
  const missingResult = await missing.service.load("season-1", registry());
  assert.strictEqual(missingResult.status, "missing");
  assert.deepStrictEqual(missingResult.runtime.initializedFrom, state());
  assert.deepStrictEqual(missing.calls[0].identity, {
    scope: "strategic_domain",
    seasonId: "season-1"
  });

  const restoredEnvelope = envelope();
  restoredEnvelope.state.relations.push({ seasonId: "season-1", unionId: "union-1" });
  const restored = harness(restoredEnvelope);
  assert.strictEqual((await restored.service.load("season-1", registry())).status, "restored");

  const unknown = envelope();
  unknown.state.relations.push({ seasonId: "season-1", unionId: "unknown" });
  await assert.rejects(
    () => harness(unknown).service.load("season-1", registry()),
    (error) => error instanceof StrategicDomainPersistenceServiceError
      && error.code === "unknown_union_reference"
  );
  await assert.rejects(
    () => harness(envelope({ seasonId: "season-2" })).service.load("season-1", registry()),
    (error) => error.code === "season_mismatch"
  );
  await assert.rejects(
    () => harness({ ...envelope(), state: {} }).service.load("season-1", registry()),
    (error) => error.code === "stored_state_invalid"
      && error.cause.code === "invalid_state_shape"
  );

  const saveHarness = harness();
  assert.deepStrictEqual(
    await saveHarness.service.save({}, "season-1", registry()),
    { status: "saved", savedAt: "2026-07-30T23:50:00.000Z" }
  );
  assert.strictEqual(saveHarness.calls[0].action, "save");
  assert.throws(
    () => createStrategicDomainPersistenceService({}),
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
  const classService = createStrategicDomainPersistenceService({
    storageAdapter: new Adapter(),
    serializeStrategicDomainRuntime: (_runtime, seasonId, savedAt) => envelope({ seasonId, savedAt }),
    deserializeStrategicDomainEnvelope: (value) => value,
    createStrategicDomainRuntime: (options) => ({ state: options.initialState }),
    modules: {},
    clock: () => new Date("2026-07-30T23:50:00.000Z")
  });
  assert.strictEqual((await classService.load("season-1", registry())).status, "missing");

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "strategic-domain-persistence-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createStrategicDomainPersistenceService, "function");
  assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));
  console.log("ok - strategic domain persistence service");
  console.log("\n1 test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
