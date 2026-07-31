const assert = require("assert");
const {
  createDataManagementStatePersistenceService,
  DataManagementStatePersistenceServiceError
} = require("../src/services/data-management-state-persistence-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nested(savedAt = "2026-07-31T10:00:00.000Z") {
  return {
    registry: { schemaVersion: 1, savedAt, identities: [{ unionId: "union-1" }] },
    strategic: { schemaVersion: 1, seasonId: "season-1", savedAt, state: { relations: [] } },
    evidence: { schemaVersion: 1, savedAt, assets: [], evidenceRecords: [] }
  };
}

function harness(stored = null, overrides = {}) {
  const calls = [];
  const adapter = {
    stored,
    async loadEnvelope(identity) {
      calls.push(["load", identity]);
      return this.stored;
    },
    async saveEnvelope(identity, envelope) {
      calls.push(["save", identity, envelope]);
      this.stored = envelope;
    }
  };
  const service = createDataManagementStatePersistenceService({
    storageAdapter: adapter,
    serializeUnionRegistry: overrides.serializeUnionRegistry || ((_service, savedAt) => nested(savedAt).registry),
    deserializeUnionRegistryEnvelope: overrides.deserializeUnionRegistryEnvelope || ((value) => value),
    serializeStrategicDomainRuntime:
      overrides.serializeStrategicDomainRuntime
      || ((_runtime, seasonId, savedAt) => ({
        ...nested(savedAt).strategic,
        seasonId
      })),
    deserializeStrategicDomainEnvelope:
      overrides.deserializeStrategicDomainEnvelope || ((value) => value),
    evidenceStateSerializer: overrides.evidenceStateSerializer || {
      serializeRuntime(_runtime, savedAt) { return nested(savedAt).evidence; },
      deserializeEnvelope(value) { return value; }
    },
    createUnionRegistryService: overrides.createUnionRegistryService || ((identities) => ({ identities })),
    createStrategicDomainRuntime:
      overrides.createStrategicDomainRuntime || ((options) => ({ strategicState: options.initialState })),
    createEvidenceDomainRuntime:
      overrides.createEvidenceDomainRuntime || ((options) => ({ evidenceState: options.initialState })),
    strategicDomainModules: {},
    evidenceDomainModules: {},
    clock: overrides.clock || (() => new Date("2026-07-31T10:00:00.000Z"))
  });
  return { service, adapter, calls };
}

test("missing storage creates all three runtimes from bundled and empty state", async () => {
  const { service, calls } = harness();
  const result = await service.load({
    seasonId: "season-1",
    bundledIdentities: [{ unionId: "bundled" }]
  });
  assert.strictEqual(result.status, "missing");
  assert.strictEqual(result.source, "bundled");
  assert.deepStrictEqual(result.unionRegistryService.identities, [{ unionId: "bundled" }]);
  assert.deepStrictEqual(result.strategicDomainRuntime.strategicState.relations, []);
  assert.deepStrictEqual(result.evidenceDomainRuntime.evidenceState, {
    assets: [],
    evidenceRecords: []
  });
  assert.deepStrictEqual(calls[0][1], {
    scope: "data_management",
    seasonId: "season-1"
  });
});

test("stored envelope restores all three runtimes from one coherent timestamp", async () => {
  const parts = nested();
  const stored = {
    schemaVersion: 1,
    seasonId: "season-1",
    savedAt: "2026-07-31T10:00:00.000Z",
    unionRegistry: parts.registry,
    strategicDomain: parts.strategic,
    evidenceDomain: parts.evidence
  };
  const result = await harness(stored).service.load({
    seasonId: "season-1",
    bundledIdentities: []
  });
  assert.strictEqual(result.status, "restored");
  assert.strictEqual(result.source, "storage");
  assert.deepStrictEqual(result.unionRegistryService.identities, [{ unionId: "union-1" }]);
  assert.deepStrictEqual(result.strategicDomainRuntime.strategicState, { relations: [] });
});

test("save writes one envelope containing all domains with one timestamp", async () => {
  const { service, calls } = harness();
  const result = await service.save({
    seasonId: "season-1",
    unionRegistryService: {},
    strategicDomainRuntime: {},
    evidenceDomainRuntime: {}
  });
  assert.deepStrictEqual(result, {
    status: "saved",
    savedAt: "2026-07-31T10:00:00.000Z"
  });
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0][1], {
    scope: "data_management",
    seasonId: "season-1"
  });
  assert.strictEqual(calls[0][2].unionRegistry.savedAt, result.savedAt);
  assert.strictEqual(calls[0][2].strategicDomain.savedAt, result.savedAt);
  assert.strictEqual(calls[0][2].evidenceDomain.savedAt, result.savedAt);
});

test("inconsistent nested timestamps and seasons are rejected atomically", async () => {
  const parts = nested();
  const stored = {
    schemaVersion: 1,
    seasonId: "season-1",
    savedAt: "2026-07-31T10:00:00.000Z",
    unionRegistry: { ...parts.registry, savedAt: "2026-07-31T09:00:00.000Z" },
    strategicDomain: parts.strategic,
    evidenceDomain: parts.evidence
  };
  await assert.rejects(
    () => harness(stored).service.load({ seasonId: "season-1", bundledIdentities: [] }),
    (error) => error instanceof DataManagementStatePersistenceServiceError
      && error.code === "stored_state_invalid"
  );
});

test("storage failures and malformed factory/input are reported clearly", async () => {
  const brokenLoad = harness();
  brokenLoad.adapter.loadEnvelope = async () => { throw new Error("load failed"); };
  const recreated = harness(null, {});
  recreated.service = createDataManagementStatePersistenceService({
    storageAdapter: brokenLoad.adapter,
    serializeUnionRegistry() {},
    deserializeUnionRegistryEnvelope() {},
    serializeStrategicDomainRuntime() {},
    deserializeStrategicDomainEnvelope() {},
    evidenceStateSerializer: { serializeRuntime() {}, deserializeEnvelope() {} },
    createUnionRegistryService() {},
    createStrategicDomainRuntime() {},
    createEvidenceDomainRuntime() {},
    strategicDomainModules: {},
    evidenceDomainModules: {},
    clock: () => new Date()
  });
  await assert.rejects(
    () => recreated.service.load({ seasonId: "season-1", bundledIdentities: [] }),
    (error) => error.code === "storage_load_failed" && error.cause.message === "load failed"
  );
  assert.throws(
    () => createDataManagementStatePersistenceService({}),
    (error) => error.code === "invalid_factory"
  );
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
  console.log(`${passed} tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
