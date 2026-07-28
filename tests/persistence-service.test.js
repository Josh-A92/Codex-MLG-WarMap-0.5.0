const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  PersistenceServiceError,
  createPersistenceService
} = require("../src/services/persistence-service.js");

function createEnvelope(overrides) {
  const base = {
    schemaVersion: 1,
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-07-28T12:00:00.000Z",
    servers: [
      {
        id: "server-366",
        ownership: {
          "10-10": "union-0001",
          "10-11": null
        }
      }
    ]
  };

  return Object.assign(base, overrides || {});
}

function createServerStateDouble(options) {
  const values = options || {};
  const seasonId = values.seasonId || "season-1";
  const baseMapId = values.baseMapId || "season1-map";
  const serverIds = values.serverIds || ["server-366", "server-367"];
  const ownershipByServerId = new Map();

  serverIds.forEach((serverId) => {
    ownershipByServerId.set(serverId, {});
  });

  if (values.initialOwnershipByServerId) {
    Object.keys(values.initialOwnershipByServerId).forEach((serverId) => {
      ownershipByServerId.set(serverId, { ...values.initialOwnershipByServerId[serverId] });
    });
  }

  let replaceCallCount = 0;
  let replaceBehavior = values.replaceBehavior || null;

  const service = {
    getSeasonId() {
      return seasonId;
    },
    getBaseMapId() {
      return baseMapId;
    },
    hasServer(serverId) {
      return ownershipByServerId.has(serverId);
    },
    replaceTerritoryOwnership(ownershipByServerIdInput) {
      replaceCallCount += 1;

      if (replaceBehavior) {
        replaceBehavior(ownershipByServerIdInput);
      }

      const nextOwnership = new Map();
      serverIds.forEach((serverId) => {
        if (Object.prototype.hasOwnProperty.call(ownershipByServerIdInput, serverId)) {
          nextOwnership.set(serverId, { ...ownershipByServerIdInput[serverId] });
        } else {
          nextOwnership.set(serverId, {});
        }
      });

      ownershipByServerId.clear();
      nextOwnership.forEach((value, key) => ownershipByServerId.set(key, value));
    },
    listServers() {
      return serverIds.map((serverId) => ({
        id: serverId,
        ownership: ownershipByServerId.get(serverId)
      }));
    }
  };

  return {
    service,
    getReplaceCallCount() {
      return replaceCallCount;
    },
    getOwnership(serverId) {
      return ownershipByServerId.get(serverId);
    },
    setReplaceBehavior(fn) {
      replaceBehavior = fn;
    }
  };
}

function createDependencies(overrides) {
  const options = overrides || {};

  const calls = {
    loadIdentities: [],
    saveIdentities: [],
    saveEnvelopes: [],
    serializerCalls: [],
    deserializerCalls: [],
    clockCalls: 0
  };

  const storageAdapter = {
    async loadEnvelope(identity) {
      calls.loadIdentities.push(identity);
      if (options.loadError) {
        throw options.loadError;
      }

      return Object.prototype.hasOwnProperty.call(options, "loadedEnvelope")
        ? options.loadedEnvelope
        : null;
    },
    async saveEnvelope(identity, envelope) {
      calls.saveIdentities.push(identity);
      calls.saveEnvelopes.push(envelope);
      if (options.saveError) {
        throw options.saveError;
      }

      if (typeof options.onSaveEnvelope === "function") {
        options.onSaveEnvelope(identity, envelope);
      }
    }
  };

  const serializeServerState = options.serializeServerState || ((serverStateService, savedAt) => {
    calls.serializerCalls.push({ serverStateService, savedAt });

    if (options.serializerError) {
      throw options.serializerError;
    }

    return createEnvelope({
      savedAt,
      seasonId: serverStateService.getSeasonId(),
      baseMapId: serverStateService.getBaseMapId(),
      servers: serverStateService.listServers().map((server) => ({
        id: server.id,
        ownership: { ...server.ownership }
      }))
    });
  });

  const deserializePersistenceEnvelope = options.deserializePersistenceEnvelope || ((candidate) => {
    calls.deserializerCalls.push(candidate);

    if (options.deserializerError) {
      throw options.deserializerError;
    }

    return JSON.parse(JSON.stringify(candidate));
  });

  const clock = options.clock || (() => {
    calls.clockCalls += 1;
    if (options.clockError) {
      throw options.clockError;
    }

    return new Date("2026-07-28T12:00:00.000Z");
  });

  return {
    dependencies: {
      storageAdapter,
      serializeServerState,
      deserializePersistenceEnvelope,
      clock
    },
    calls
  };
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

runTest("creation validates dependencies immediately", () => {
  assert.throws(() => createPersistenceService(), TypeError);
  assert.throws(() => createPersistenceService({}), TypeError);

  const { dependencies } = createDependencies();
  const missingClock = { ...dependencies };
  delete missingClock.clock;

  assert.throws(() => createPersistenceService(missingClock), TypeError);
});

runTest("class-based storage adapter using this works for load and save", async () => {
  class ClassStorageAdapter {
    constructor() {
      this.loadedEnvelope = createEnvelope({
        servers: [
          {
            id: "server-366",
            ownership: {
              "10-10": "union-0007"
            }
          }
        ]
      });
      this.loadCalls = 0;
      this.saveCalls = 0;
      this.loadThisOk = false;
      this.saveThisOk = false;
      this.lastSavedEnvelope = null;
      this.lastSavedIdentity = null;
    }

    async loadEnvelope(identity) {
      this.loadCalls += 1;
      this.loadThisOk = this instanceof ClassStorageAdapter;
      this.lastLoadIdentity = identity;
      return this.loadedEnvelope;
    }

    async saveEnvelope(identity, envelope) {
      this.saveCalls += 1;
      this.saveThisOk = this instanceof ClassStorageAdapter;
      this.lastSavedIdentity = identity;
      this.lastSavedEnvelope = envelope;
    }
  }

  const adapter = new ClassStorageAdapter();
  const state = createServerStateDouble();
  const serializerCalls = [];

  const persistenceService = createPersistenceService({
    storageAdapter: adapter,
    serializeServerState(serverStateService, savedAt) {
      serializerCalls.push(savedAt);
      return createEnvelope({
        seasonId: serverStateService.getSeasonId(),
        baseMapId: serverStateService.getBaseMapId(),
        savedAt,
        servers: [
          {
            id: "server-366",
            ownership: {
              "10-10": "union-0010"
            }
          }
        ]
      });
    },
    deserializePersistenceEnvelope(candidate) {
      return JSON.parse(JSON.stringify(candidate));
    },
    clock() {
      return new Date("2026-07-28T12:00:00.000Z");
    }
  });

  const loadResult = await persistenceService.load(state.service);
  const saveResult = await persistenceService.save(state.service);

  assert.strictEqual(adapter.loadCalls, 1);
  assert.strictEqual(adapter.saveCalls, 1);
  assert.strictEqual(adapter.loadThisOk, true);
  assert.strictEqual(adapter.saveThisOk, true);
  assert.deepStrictEqual(adapter.lastLoadIdentity, { seasonId: "season-1", baseMapId: "season1-map" });
  assert.deepStrictEqual(adapter.lastSavedIdentity, { seasonId: "season-1", baseMapId: "season1-map" });
  assert.strictEqual(serializerCalls.length, 1);
  assert.deepStrictEqual(loadResult, {
    status: "restored",
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-07-28T12:00:00.000Z"
  });
  assert.deepStrictEqual(saveResult, {
    status: "saved",
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-07-28T12:00:00.000Z"
  });
});

runTest("class-based server state service works", async () => {
  class ClassServerStateService {
    constructor() {
      this.seasonId = "season-1";
      this.baseMapId = "season1-map";
      this.serverIds = ["server-366", "server-367"];
      this.ownershipByServerId = new Map([
        ["server-366", {}],
        ["server-367", {}]
      ]);
      this.replaceCalls = 0;
    }

    getSeasonId() {
      return this.seasonId;
    }

    getBaseMapId() {
      return this.baseMapId;
    }

    hasServer(serverId) {
      return this.ownershipByServerId.has(serverId);
    }

    replaceTerritoryOwnership(ownershipByServerId) {
      this.replaceCalls += 1;
      this.serverIds.forEach((serverId) => {
        const next = Object.prototype.hasOwnProperty.call(ownershipByServerId, serverId)
          ? { ...ownershipByServerId[serverId] }
          : {};
        this.ownershipByServerId.set(serverId, next);
      });
    }

    listServers() {
      return this.serverIds.map((serverId) => ({
        id: serverId,
        ownership: this.ownershipByServerId.get(serverId)
      }));
    }
  }

  const state = new ClassServerStateService();
  const { dependencies } = createDependencies({ loadedEnvelope: createEnvelope() });
  const persistenceService = createPersistenceService(dependencies);

  await persistenceService.load(state);
  await persistenceService.save(state);

  assert.strictEqual(state.replaceCalls, 1);
  assert.deepStrictEqual(state.ownershipByServerId.get("server-366"), {
    "10-10": "union-0001",
    "10-11": null
  });
});

runTest("storage adapter rejects null arrays primitives and missing or non-function methods", () => {
  const { dependencies } = createDependencies();

  assert.throws(() => createPersistenceService({ ...dependencies, storageAdapter: null }), TypeError);
  assert.throws(() => createPersistenceService({ ...dependencies, storageAdapter: [] }), TypeError);
  assert.throws(() => createPersistenceService({ ...dependencies, storageAdapter: 123 }), TypeError);

  assert.throws(() => createPersistenceService({
    ...dependencies,
    storageAdapter: {
      saveEnvelope: async () => {}
    }
  }), TypeError);

  assert.throws(() => createPersistenceService({
    ...dependencies,
    storageAdapter: {
      loadEnvelope: async () => {},
      saveEnvelope: "not-a-function"
    }
  }), TypeError);
});

runTest("server state service rejects null arrays primitives and missing methods", async () => {
  const { dependencies } = createDependencies();
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(null), (error) => {
    assert.strictEqual(error.code, "INVALID_SERVER_STATE_SERVICE");
    return true;
  });

  await assert.rejects(() => persistenceService.load([]), (error) => {
    assert.strictEqual(error.code, "INVALID_SERVER_STATE_SERVICE");
    return true;
  });

  await assert.rejects(() => persistenceService.load(123), (error) => {
    assert.strictEqual(error.code, "INVALID_SERVER_STATE_SERVICE");
    return true;
  });

  await assert.rejects(() => persistenceService.load({
    getSeasonId() {
      return "season-1";
    },
    getBaseMapId() {
      return "season1-map";
    }
  }), (error) => {
    assert.strictEqual(error.code, "INVALID_SERVER_STATE_SERVICE");
    return true;
  });

  await assert.rejects(() => persistenceService.save({
    getSeasonId: "not-a-function",
    getBaseMapId() {
      return "season1-map";
    }
  }), (error) => {
    assert.strictEqual(error.code, "INVALID_SERVER_STATE_SERVICE");
    return true;
  });
});

runTest("missing save returns missing and does not call replacement", async () => {
  const state = createServerStateDouble({
    initialOwnershipByServerId: {
      "server-366": { "10-10": "union-0001" },
      "server-367": { "5-5": "union-0002" }
    }
  });
  const { dependencies, calls } = createDependencies({ loadedEnvelope: null });
  const persistenceService = createPersistenceService(dependencies);

  const before366 = { ...state.getOwnership("server-366") };
  const before367 = { ...state.getOwnership("server-367") };

  const result = await persistenceService.load(state.service);

  assert.deepStrictEqual(result, {
    status: "missing",
    seasonId: "season-1",
    baseMapId: "season1-map"
  });
  assert.strictEqual(state.getReplaceCallCount(), 0);
  assert.deepStrictEqual(state.getOwnership("server-366"), before366);
  assert.deepStrictEqual(state.getOwnership("server-367"), before367);
  assert.strictEqual(calls.deserializerCalls.length, 0);
  assert.deepStrictEqual(calls.loadIdentities[0], { seasonId: "season-1", baseMapId: "season1-map" });
});

runTest("valid save restores ownership and calls replacement once", async () => {
  const state = createServerStateDouble({
    initialOwnershipByServerId: {
      "server-366": { "1-1": "union-old" },
      "server-367": { "2-2": "union-old" }
    }
  });
  const envelope = createEnvelope({
    servers: [
      {
        id: "server-366",
        ownership: {
          "10-10": "union-0001",
          "10-11": null
        }
      }
    ]
  });
  const { dependencies } = createDependencies({ loadedEnvelope: envelope });
  const persistenceService = createPersistenceService(dependencies);

  const result = await persistenceService.load(state.service);

  assert.deepStrictEqual(result, {
    status: "restored",
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-07-28T12:00:00.000Z"
  });
  assert.strictEqual(state.getReplaceCallCount(), 1);
  assert.deepStrictEqual(state.getOwnership("server-366"), { "10-10": "union-0001", "10-11": null });
});

runTest("omitted active servers are handled through complete replacement", async () => {
  const state = createServerStateDouble({
    initialOwnershipByServerId: {
      "server-366": { "10-10": "union-0001" },
      "server-367": { "5-5": "union-0002" }
    }
  });

  const envelope = createEnvelope({
    servers: [
      {
        id: "server-366",
        ownership: {
          "10-10": "union-0003"
        }
      }
    ]
  });
  const { dependencies } = createDependencies({ loadedEnvelope: envelope });
  const persistenceService = createPersistenceService(dependencies);

  await persistenceService.load(state.service);

  assert.deepStrictEqual(state.getOwnership("server-366"), { "10-10": "union-0003" });
  assert.deepStrictEqual(state.getOwnership("server-367"), {});
});

runTest("explicit null survives restoration", async () => {
  const state = createServerStateDouble();
  const envelope = createEnvelope({
    servers: [
      {
        id: "server-366",
        ownership: {
          "10-11": null
        }
      }
    ]
  });
  const { dependencies } = createDependencies({ loadedEnvelope: envelope });
  const persistenceService = createPersistenceService(dependencies);

  await persistenceService.load(state.service);

  assert.strictEqual(Object.prototype.hasOwnProperty.call(state.getOwnership("server-366"), "10-11"), true);
  assert.strictEqual(state.getOwnership("server-366")["10-11"], null);
});

runTest("invalid envelope causes no replacement", async () => {
  const state = createServerStateDouble({
    initialOwnershipByServerId: {
      "server-366": { "10-10": "union-0001" },
      "server-367": { "5-5": "union-0002" }
    }
  });

  const deserializerError = new Error("invalid envelope");
  deserializerError.validationErrors = [{ code: "INVALID", path: "schemaVersion", message: "bad" }];

  const { dependencies } = createDependencies({
    loadedEnvelope: { bad: true },
    deserializerError
  });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(state.service), (error) => {
    assert.strictEqual(error.name, "PersistenceServiceError");
    assert.strictEqual(error.code, "INVALID_SAVED_ENVELOPE");
    assert.strictEqual(error.cause, deserializerError);
    assert.deepStrictEqual(error.validationErrors, deserializerError.validationErrors);
    return true;
  });

  assert.strictEqual(state.getReplaceCallCount(), 0);
});

runTest("season mismatch causes no replacement", async () => {
  const state = createServerStateDouble();
  const envelope = createEnvelope({ seasonId: "season-2" });
  const { dependencies } = createDependencies({ loadedEnvelope: envelope });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(state.service), (error) => {
    assert.strictEqual(error.code, "SEASON_MISMATCH");
    return true;
  });

  assert.strictEqual(state.getReplaceCallCount(), 0);
});

runTest("base-map mismatch causes no replacement", async () => {
  const state = createServerStateDouble();
  const envelope = createEnvelope({ baseMapId: "other-map" });
  const { dependencies } = createDependencies({ loadedEnvelope: envelope });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(state.service), (error) => {
    assert.strictEqual(error.code, "BASE_MAP_MISMATCH");
    return true;
  });

  assert.strictEqual(state.getReplaceCallCount(), 0);
});

runTest("unknown persisted server causes no replacement", async () => {
  const state = createServerStateDouble();
  const envelope = createEnvelope({
    servers: [
      {
        id: "server-999",
        ownership: {
          "10-10": "union-0001"
        }
      }
    ]
  });
  const { dependencies } = createDependencies({ loadedEnvelope: envelope });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(state.service), (error) => {
    assert.strictEqual(error.code, "UNKNOWN_PERSISTED_SERVER");
    return true;
  });

  assert.strictEqual(state.getReplaceCallCount(), 0);
});

runTest("storage load rejection is wrapped with its cause", async () => {
  const state = createServerStateDouble();
  const loadError = new Error("load failed");
  const { dependencies } = createDependencies({ loadError });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(state.service), (error) => {
    assert.ok(error instanceof PersistenceServiceError);
    assert.strictEqual(error.code, "STORAGE_LOAD_FAILED");
    assert.strictEqual(error.cause, loadError);
    return true;
  });
});

runTest("replacement failure is wrapped with its cause", async () => {
  const replaceError = new Error("replace failed");
  const state = createServerStateDouble();
  state.setReplaceBehavior(() => {
    throw replaceError;
  });

  const { dependencies } = createDependencies({ loadedEnvelope: createEnvelope() });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.load(state.service), (error) => {
    assert.strictEqual(error.code, "RESTORATION_FAILED");
    assert.strictEqual(error.cause, replaceError);
    return true;
  });
});

runTest("save calls clock exactly once", async () => {
  const state = createServerStateDouble();
  const { dependencies, calls } = createDependencies();
  const persistenceService = createPersistenceService(dependencies);

  await persistenceService.save(state.service);

  assert.strictEqual(calls.clockCalls, 1);
});

runTest("save passes canonical timestamp to serializer", async () => {
  const state = createServerStateDouble();
  const { dependencies, calls } = createDependencies({
    clock: () => {
      calls.clockCalls += 1;
      return new Date("2026-07-28T12:00:00.000Z");
    }
  });
  const persistenceService = createPersistenceService(dependencies);

  await persistenceService.save(state.service);

  assert.strictEqual(calls.serializerCalls.length, 1);
  assert.strictEqual(calls.serializerCalls[0].savedAt, "2026-07-28T12:00:00.000Z");
});

runTest("save uses correct logical identity", async () => {
  const state = createServerStateDouble();
  const { dependencies, calls } = createDependencies();
  const persistenceService = createPersistenceService(dependencies);

  const result = await persistenceService.save(state.service);

  assert.deepStrictEqual(calls.saveIdentities[0], { seasonId: "season-1", baseMapId: "season1-map" });
  assert.deepStrictEqual(result, {
    status: "saved",
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-07-28T12:00:00.000Z"
  });
});

runTest("storage save rejection is wrapped with its cause", async () => {
  const state = createServerStateDouble();
  const saveError = new Error("save failed");
  const { dependencies } = createDependencies({ saveError });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.save(state.service), (error) => {
    assert.strictEqual(error.code, "STORAGE_SAVE_FAILED");
    assert.strictEqual(error.cause, saveError);
    return true;
  });
});

runTest("invalid clock values are rejected before serialization and storage", async () => {
  const state = createServerStateDouble();
  const { dependencies, calls } = createDependencies({
    clock: () => {
      calls.clockCalls += 1;
      return new Date("not-a-date");
    }
  });

  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.save(state.service), (error) => {
    assert.strictEqual(error.code, "INVALID_CLOCK_RESULT");
    return true;
  });

  assert.strictEqual(calls.serializerCalls.length, 0);
  assert.strictEqual(calls.saveIdentities.length, 0);
});

runTest("serializer failures are wrapped with cause and validation errors", async () => {
  const state = createServerStateDouble();
  const serializerError = new Error("serialize failed");
  serializerError.validationErrors = [
    {
      code: "INVALID",
      path: "servers[0].ownership.10-10",
      message: "bad"
    }
  ];

  const { dependencies } = createDependencies({ serializerError });
  const persistenceService = createPersistenceService(dependencies);

  await assert.rejects(() => persistenceService.save(state.service), (error) => {
    assert.strictEqual(error.code, "SERIALIZATION_FAILED");
    assert.strictEqual(error.cause, serializerError);
    assert.deepStrictEqual(error.validationErrors, serializerError.validationErrors);
    return true;
  });
});

runTest("adapter mutations do not affect live service data", async () => {
  const state = createServerStateDouble({
    initialOwnershipByServerId: {
      "server-366": {
        "10-10": "union-0001"
      }
    }
  });

  const { dependencies } = createDependencies({
    serializeServerState(serverStateService, savedAt) {
      return createEnvelope({
        seasonId: serverStateService.getSeasonId(),
        baseMapId: serverStateService.getBaseMapId(),
        savedAt,
        servers: [
          {
            id: "server-366",
            ownership: state.getOwnership("server-366")
          }
        ]
      });
    },
    onSaveEnvelope(identity, envelope) {
      envelope.servers[0].ownership["10-10"] = "union-mutated";
      envelope.servers[0].ownership["10-11"] = "union-mutated";
    }
  });

  const persistenceService = createPersistenceService(dependencies);

  await persistenceService.save(state.service);

  assert.strictEqual(state.getOwnership("server-366")["10-10"], "union-0001");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(state.getOwnership("server-366"), "10-11"), false);
});

runTest("browser-global and CommonJS exports are available", () => {
  assert.strictEqual(typeof PersistenceServiceError, "function");
  assert.strictEqual(typeof createPersistenceService, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "persistence-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.PersistenceServiceError, "function");
  assert.strictEqual(typeof sandbox.globalThis.createPersistenceService, "function");
});

runTest("source has no DOM filesystem network electron storage or season-specific assumptions", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "persistence-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/ipcRenderer|ipcMain|electron/.test(source));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(source));
  assert.ok(!/require\(['\"]fs['\"]\)/.test(source));
  assert.ok(!/season-1|season1-map|server-366/.test(source));
});

async function executeTests() {
  for (const test of runTest.tests) {
    try {
      await test.fn();
      process.stdout.write(`PASS ${test.name}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${test.name}\n`);
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

executeTests();
