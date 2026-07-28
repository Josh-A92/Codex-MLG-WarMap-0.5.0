const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const {
  ServerStatePersistenceControllerError,
  createServerStatePersistenceController
} = require("../src/app/server-state-persistence-controller.js");

const workspaceRoot = path.resolve(__dirname, "..");
const scheduledTests = [];

function runTest(name, fn) {
  scheduledTests.push({ name, fn });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function createServerStateDouble(id) {
  return {
    id: id || "state-default"
  };
}

runTest("creation validates persistence service methods", () => {
  assert.throws(() => createServerStatePersistenceController(), TypeError);
  assert.throws(() => createServerStatePersistenceController({}), TypeError);
  assert.throws(() => createServerStatePersistenceController({ persistenceService: null }), TypeError);
  assert.throws(() => createServerStatePersistenceController({ persistenceService: [] }), TypeError);
  assert.throws(() => createServerStatePersistenceController({ persistenceService: {} }), TypeError);
  assert.throws(() => createServerStatePersistenceController({ persistenceService: { load() {} } }), TypeError);
  assert.throws(() => createServerStatePersistenceController({ persistenceService: { save() {} } }), TypeError);
});

runTest("class-based persistence service retains this", async () => {
  class PersistenceService {
    constructor() {
      this.loadCalls = 0;
      this.saveCalls = 0;
      this.loadThisOk = false;
      this.saveThisOk = false;
    }

    async load() {
      this.loadCalls += 1;
      this.loadThisOk = this instanceof PersistenceService;
      return { status: "missing" };
    }

    async save() {
      this.saveCalls += 1;
      this.saveThisOk = this instanceof PersistenceService;
      return { status: "saved" };
    }
  }

  const persistenceService = new PersistenceService();
  const controller = createServerStatePersistenceController({ persistenceService });

  await controller.initialize(createServerStateDouble("state-1"));
  await controller.requestSave();

  assert.strictEqual(persistenceService.loadCalls, 1);
  assert.strictEqual(persistenceService.saveCalls, 1);
  assert.strictEqual(persistenceService.loadThisOk, true);
  assert.strictEqual(persistenceService.saveThisOk, true);
});

runTest("initialization calls load once and returns missing result", async () => {
  const calls = [];
  const expected = {
    status: "missing",
    seasonId: "season-1",
    baseMapId: "map-1"
  };

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load(serverStateService) {
        calls.push(serverStateService);
        return expected;
      },
      async save() {
        throw new Error("not needed");
      }
    }
  });

  const serverStateService = createServerStateDouble("state-2");
  const result = await controller.initialize(serverStateService);

  assert.strictEqual(result, expected);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], serverStateService);
  assert.strictEqual(controller.isInitialized(), true);
});

runTest("initialization calls load once and returns restored result", async () => {
  const expected = {
    status: "restored",
    seasonId: "season-1",
    baseMapId: "map-1",
    savedAt: "2026-07-29T00:00:00.000Z"
  };

  let loadCalls = 0;
  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        loadCalls += 1;
        return expected;
      },
      async save() {
        throw new Error("not needed");
      }
    }
  });

  const result = await controller.initialize(createServerStateDouble("state-3"));

  assert.strictEqual(result, expected);
  assert.strictEqual(loadCalls, 1);
  assert.strictEqual(controller.isInitialized(), true);
});

runTest("isInitialized remains false while load is pending", async () => {
  const deferred = createDeferred();

  const controller = createServerStatePersistenceController({
    persistenceService: {
      load() {
        return deferred.promise;
      },
      async save() {
        throw new Error("not needed");
      }
    }
  });

  const initializationPromise = controller.initialize(createServerStateDouble("state-4"));
  assert.strictEqual(controller.isInitialized(), false);

  deferred.resolve({ status: "missing" });
  await initializationPromise;

  assert.strictEqual(controller.isInitialized(), true);
});

runTest("failed initialization leaves controller uninitialized and permits retry", async () => {
  const originalFailure = new Error("load failed");
  let loadCalls = 0;

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        loadCalls += 1;

        if (loadCalls === 1) {
          throw originalFailure;
        }

        return { status: "missing" };
      },
      async save() {
        throw new Error("not needed");
      }
    }
  });

  await assert.rejects(
    () => controller.initialize(createServerStateDouble("state-5")),
    (error) => error === originalFailure
  );

  assert.strictEqual(controller.isInitialized(), false);

  const retryResult = await controller.initialize(createServerStateDouble("state-5b"));

  assert.deepStrictEqual(retryResult, { status: "missing" });
  assert.strictEqual(loadCalls, 2);
  assert.strictEqual(controller.isInitialized(), true);
});

runTest("repeated successful initialization is rejected", async () => {
  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      async save() {
        return { status: "saved" };
      }
    }
  });

  await controller.initialize(createServerStateDouble("state-6"));

  await assert.rejects(
    () => controller.initialize(createServerStateDouble("state-6b")),
    (error) => {
      assert.ok(error instanceof ServerStatePersistenceControllerError);
      assert.strictEqual(error.name, "ServerStatePersistenceControllerError");
      assert.strictEqual(error.code, "ALREADY_INITIALIZED");
      return true;
    }
  );
});

runTest("concurrent initialization is rejected", async () => {
  const deferred = createDeferred();

  const controller = createServerStatePersistenceController({
    persistenceService: {
      load() {
        return deferred.promise;
      },
      async save() {
        throw new Error("not needed");
      }
    }
  });

  const first = controller.initialize(createServerStateDouble("state-7"));

  await assert.rejects(
    () => controller.initialize(createServerStateDouble("state-7b")),
    (error) => {
      assert.ok(error instanceof ServerStatePersistenceControllerError);
      assert.strictEqual(error.name, "ServerStatePersistenceControllerError");
      assert.strictEqual(error.code, "INITIALIZATION_IN_PROGRESS");
      return true;
    }
  );

  deferred.resolve({ status: "missing" });
  await first;
});

runTest("save before initialization is rejected and persistence save is not called", async () => {
  let saveCalls = 0;

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      async save() {
        saveCalls += 1;
        return { status: "saved" };
      }
    }
  });

  await assert.rejects(
    () => controller.requestSave(),
    (error) => {
      assert.ok(error instanceof ServerStatePersistenceControllerError);
      assert.strictEqual(error.name, "ServerStatePersistenceControllerError");
      assert.strictEqual(error.code, "NOT_INITIALIZED");
      return true;
    }
  );

  assert.strictEqual(saveCalls, 0);
});

runTest("save uses the exact initialized server state service instance", async () => {
  const initializedService = createServerStateDouble("state-8");
  const saveServices = [];

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load(serverStateService) {
        assert.strictEqual(serverStateService, initializedService);
        return { status: "missing" };
      },
      async save(serverStateService) {
        saveServices.push(serverStateService);
        return { status: "saved" };
      }
    }
  });

  await controller.initialize(initializedService);
  await controller.requestSave();

  assert.strictEqual(saveServices.length, 1);
  assert.strictEqual(saveServices[0], initializedService);
});

runTest("two rapid saves execute sequentially and in order", async () => {
  const firstDeferred = createDeferred();
  let saveCalls = 0;
  const started = [];

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      save() {
        saveCalls += 1;
        started.push(saveCalls);

        if (saveCalls === 1) {
          return firstDeferred.promise;
        }

        return Promise.resolve({ status: "saved", call: saveCalls });
      }
    }
  });

  await controller.initialize(createServerStateDouble("state-9"));

  const firstSave = controller.requestSave();
  const secondSave = controller.requestSave();

  await Promise.resolve();
  assert.deepStrictEqual(started, [1]);

  firstDeferred.resolve({ status: "saved", call: 1 });

  const firstResult = await firstSave;
  const secondResult = await secondSave;

  assert.deepStrictEqual(firstResult, { status: "saved", call: 1 });
  assert.deepStrictEqual(secondResult, { status: "saved", call: 2 });
  assert.deepStrictEqual(started, [1, 2]);
});

runTest("failed save rejects its own Promise", async () => {
  const saveFailure = new Error("save failed");

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      async save() {
        throw saveFailure;
      }
    }
  });

  await controller.initialize(createServerStateDouble("state-10"));

  await assert.rejects(
    () => controller.requestSave(),
    (error) => error === saveFailure
  );
});

runTest("later save still runs after an earlier failure", async () => {
  let saveCalls = 0;
  const firstFailure = new Error("first save failed");

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      async save() {
        saveCalls += 1;

        if (saveCalls === 1) {
          throw firstFailure;
        }

        return { status: "saved", call: saveCalls };
      }
    }
  });

  await controller.initialize(createServerStateDouble("state-11"));

  await assert.rejects(() => controller.requestSave(), (error) => error === firstFailure);
  const secondResult = await controller.requestSave();

  assert.deepStrictEqual(secondResult, { status: "saved", call: 2 });
  assert.strictEqual(saveCalls, 2);
});

runTest("flush waits for saves already queued", async () => {
  const firstDeferred = createDeferred();
  const secondDeferred = createDeferred();
  let call = 0;

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      save() {
        call += 1;

        if (call === 1) {
          return firstDeferred.promise;
        }

        if (call === 2) {
          return secondDeferred.promise;
        }

        return Promise.resolve({ status: "saved", call });
      }
    }
  });

  await controller.initialize(createServerStateDouble("state-12"));

  const firstSave = controller.requestSave();
  const secondSave = controller.requestSave();
  const flushPromise = controller.flush();

  let flushSettled = false;
  flushPromise.then(
    () => {
      flushSettled = true;
    },
    () => {
      flushSettled = true;
    }
  );

  await Promise.resolve();
  assert.strictEqual(flushSettled, false);

  firstDeferred.resolve({ status: "saved", call: 1 });
  await firstSave;
  await Promise.resolve();
  assert.strictEqual(flushSettled, false);

  secondDeferred.resolve({ status: "saved", call: 2 });
  await secondSave;
  await flushPromise;
  assert.strictEqual(flushSettled, true);
});

runTest("flush does not start another save", async () => {
  let saveCalls = 0;

  const controller = createServerStatePersistenceController({
    persistenceService: {
      async load() {
        return { status: "missing" };
      },
      async save() {
        saveCalls += 1;
        return { status: "saved", call: saveCalls };
      }
    }
  });

  await controller.initialize(createServerStateDouble("state-13"));

  await controller.flush();
  assert.strictEqual(saveCalls, 0);

  await controller.requestSave();
  await controller.flush();
  assert.strictEqual(saveCalls, 1);
});

runTest("browser CommonJS exports and prohibited dependency source scan", async () => {
  const moduleExports = require("../src/app/server-state-persistence-controller.js");
  assert.strictEqual(typeof moduleExports.createServerStatePersistenceController, "function");
  assert.strictEqual(typeof moduleExports.ServerStatePersistenceControllerError, "function");

  const sourcePath = path.join(workspaceRoot, "src/app/server-state-persistence-controller.js");
  const source = await fs.promises.readFile(sourcePath, "utf8");
  const lowered = source.toLowerCase();

  [
    "electron",
    "ipcrenderer",
    "ipcmain",
    "localstorage",
    "fetch(",
    "http://",
    "https://",
    "document",
    "window.",
    "require(\"fs\")",
    "require(\"path\")",
    "season1",
    "ownership"
  ].forEach((token) => {
    assert.strictEqual(lowered.includes(token), false, `Unexpected dependency marker: ${token}`);
  });

  const sandbox = {
    globalThis: {},
    window: undefined,
    module: { exports: {} },
    exports: {},
    require(moduleName) {
      throw new Error(`Unexpected require in controller module: ${moduleName}`);
    }
  };

  vm.runInNewContext(source, sandbox, { filename: "server-state-persistence-controller.js" });

  assert.strictEqual(typeof sandbox.globalThis.createServerStatePersistenceController, "function");
  assert.strictEqual(typeof sandbox.globalThis.ServerStatePersistenceControllerError, "function");
});

(async () => {
  for (const testCase of scheduledTests) {
    try {
      await testCase.fn();
      process.stdout.write(`PASS ${testCase.name}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${testCase.name}\n`);
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    }
  }
})();
