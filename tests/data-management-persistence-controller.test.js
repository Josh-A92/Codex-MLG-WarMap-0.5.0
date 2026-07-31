const assert = require("assert");
const {
  createDataManagementPersistenceController,
  DataManagementPersistenceControllerError
} = require("../src/app/data-management-persistence-controller.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function runtimeSet() {
  return {
    status: "missing",
    unionRegistryService: { id: "registry" },
    strategicDomainRuntime: { id: "strategic" },
    evidenceDomainRuntime: { id: "evidence" }
  };
}

function harness(overrides = {}) {
  const calls = [];
  const persistenceService = {
    async load(input) {
      calls.push(["load", input]);
      return runtimeSet();
    },
    async save(input) {
      calls.push(["save", input]);
      return { status: "saved" };
    },
    ...overrides
  };
  return {
    calls,
    controller: createDataManagementPersistenceController({ persistenceService })
  };
}

test("initialization loads and retains one coherent runtime set", async () => {
  const { controller, calls } = harness();
  const input = { seasonId: "season-1", bundledIdentities: [] };
  const result = await controller.initialize(input);
  assert.strictEqual(result.unionRegistryService.id, "registry");
  assert.strictEqual(controller.isInitialized(), true);
  assert.deepStrictEqual(calls, [["load", input]]);
});

test("save requests use retained runtime identities and run sequentially", async () => {
  const order = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let saveNumber = 0;
  const { controller } = harness({
    async load() { return runtimeSet(); },
    async save(input) {
      saveNumber += 1;
      order.push(`start:${saveNumber}`);
      if (saveNumber === 1) await gate;
      order.push(`end:${saveNumber}`);
      assert.strictEqual(input.seasonId, "season-1");
      assert.strictEqual(input.unionRegistryService.id, "registry");
      return { status: "saved" };
    }
  });
  await controller.initialize({ seasonId: "season-1", bundledIdentities: [] });
  const first = controller.requestSave();
  const second = controller.requestSave();
  await Promise.resolve();
  assert.deepStrictEqual(order, ["start:1"]);
  release();
  await Promise.all([first, second]);
  assert.deepStrictEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
});

test("save failure does not block later saves and flush waits for queued work", async () => {
  let count = 0;
  const { controller } = harness({
    async load() { return runtimeSet(); },
    async save() {
      count += 1;
      if (count === 1) throw new Error("first failed");
      return { status: "saved" };
    }
  });
  await controller.initialize({ seasonId: "season-1", bundledIdentities: [] });
  const first = controller.requestSave();
  const second = controller.requestSave();
  await assert.rejects(() => first, /first failed/);
  await controller.flush();
  assert.deepStrictEqual(await second, { status: "saved" });
});

test("uninitialized save and repeated initialization fail clearly", async () => {
  const { controller } = harness();
  await assert.rejects(
    () => controller.requestSave(),
    (error) => error instanceof DataManagementPersistenceControllerError
      && error.code === "not_initialized"
  );
  await controller.initialize({ seasonId: "season-1", bundledIdentities: [] });
  await assert.rejects(
    () => controller.initialize({ seasonId: "season-1", bundledIdentities: [] }),
    (error) => error.code === "already_initialized"
  );
});

test("failed initialization may be retried and invalid results are rejected", async () => {
  let attempts = 0;
  const { controller } = harness({
    async load() {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary");
      return runtimeSet();
    }
  });
  await assert.rejects(
    () => controller.initialize({ seasonId: "season-1", bundledIdentities: [] }),
    /temporary/
  );
  assert.strictEqual(controller.isInitialized(), false);
  await controller.initialize({ seasonId: "season-1", bundledIdentities: [] });
  assert.strictEqual(controller.isInitialized(), true);

  const invalid = harness({ async load() { return {}; } }).controller;
  await assert.rejects(
    () => invalid.initialize({ seasonId: "season-1", bundledIdentities: [] }),
    (error) => error.code === "invalid_load_result"
  );
});

test("factory supports class services and rejects malformed dependencies", async () => {
  class Persistence {
    constructor() { this.loaded = false; }
    async load() { this.loaded = true; return runtimeSet(); }
    async save() { assert.strictEqual(this.loaded, true); }
  }
  const controller = createDataManagementPersistenceController({
    persistenceService: new Persistence()
  });
  await controller.initialize({ seasonId: "season-1", bundledIdentities: [] });
  await controller.requestSave();
  assert.throws(
    () => createDataManagementPersistenceController({}),
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
