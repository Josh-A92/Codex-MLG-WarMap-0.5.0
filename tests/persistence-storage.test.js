const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const { createPersistenceFileStore } = require("../src/main/persistence-file-store.js");
const { createElectronFileStorageAdapter } = require("../src/services/electron-file-storage-adapter.js");
const { PERSISTENCE_IPC_CHANNELS } = require("../src/shared/persistence-ipc-channels.js");

const workspaceRoot = path.resolve(__dirname, "..");
const scheduledTests = [];

function runTest(name, fn) {
  scheduledTests.push({ name, fn });
}

function createTempDirectory() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-persistence-storage-"));
}

async function withTempStore(run) {
  const tempDirectory = await createTempDirectory();
  const store = createPersistenceFileStore({ baseDirectory: tempDirectory });

  try {
    await run({
      tempDirectory,
      store
    });
  } finally {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  }
}

function sampleIdentity(overrides) {
  return {
    seasonId: "season-1",
    baseMapId: "season1-map",
    ...(overrides || {})
  };
}

function sampleEnvelope(identityOverrides, envelopeOverrides) {
  const identity = sampleIdentity(identityOverrides);
  return {
    seasonId: identity.seasonId,
    baseMapId: identity.baseMapId,
    stateVersion: 1,
    ownershipByCellKey: {
      "1:1": "union-a"
    },
    ...(envelopeOverrides || {})
  };
}

function getSingleJsonFileName(fileNames) {
  const jsonFiles = fileNames.filter((fileName) => fileName.endsWith(".json"));
  assert.strictEqual(jsonFiles.length, 1, "Expected exactly one JSON file.");
  return jsonFiles[0];
}

runTest("missing file returns null", async () => {
  await withTempStore(async ({ store }) => {
    const loaded = await store.loadEnvelope(sampleIdentity());
    assert.strictEqual(loaded, null);
  });
});

runTest("save/load JSON round trip", async () => {
  await withTempStore(async ({ store }) => {
    const identity = sampleIdentity();
    const envelope = sampleEnvelope();

    await store.saveEnvelope(identity, envelope);
    const loaded = await store.loadEnvelope(identity);

    assert.deepStrictEqual(loaded, envelope);
  });
});

runTest("separate identities do not collide", async () => {
  await withTempStore(async ({ store, tempDirectory }) => {
    const firstIdentity = sampleIdentity({ seasonId: "season-1", baseMapId: "map-a" });
    const secondIdentity = sampleIdentity({ seasonId: "season-1", baseMapId: "map-b" });

    await store.saveEnvelope(firstIdentity, sampleEnvelope({ seasonId: "season-1", baseMapId: "map-a" }, { marker: "first" }));
    await store.saveEnvelope(secondIdentity, sampleEnvelope({ seasonId: "season-1", baseMapId: "map-b" }, { marker: "second" }));

    const firstLoaded = await store.loadEnvelope(firstIdentity);
    const secondLoaded = await store.loadEnvelope(secondIdentity);

    assert.strictEqual(firstLoaded.marker, "first");
    assert.strictEqual(secondLoaded.marker, "second");

    const fileNames = await fs.promises.readdir(tempDirectory);
    const jsonFiles = fileNames.filter((fileName) => fileName.endsWith(".json"));
    assert.strictEqual(jsonFiles.length, 2);
  });
});

runTest("data management domain identities round trip independently", async () => {
  await withTempStore(async ({ store }) => {
    const identity = { scope: "data_management", seasonId: "season-1" };
    const envelope = {
      schemaVersion: 1,
      seasonId: "season-1",
      savedAt: "2026-07-31T10:00:00.000Z",
      unionRegistry: {},
      strategicDomain: {},
      evidenceDomain: {}
    };
    await store.saveEnvelope(identity, envelope);
    assert.deepStrictEqual(await store.loadEnvelope(identity), envelope);
    assert.strictEqual(await store.loadEnvelope(sampleIdentity()), null);
  });
});

runTest("same identity overwrites the current envelope", async () => {
  await withTempStore(async ({ store, tempDirectory }) => {
    const identity = sampleIdentity();

    await store.saveEnvelope(identity, sampleEnvelope(null, { revision: 1 }));
    await store.saveEnvelope(identity, sampleEnvelope(null, { revision: 2 }));

    const loaded = await store.loadEnvelope(identity);
    assert.strictEqual(loaded.revision, 2);

    const fileNames = await fs.promises.readdir(tempDirectory);
    const fileName = getSingleJsonFileName(fileNames);
    assert.match(fileName, /^[a-f0-9]{64}\.json$/);
  });
});

runTest("explicit null and missing ownership keys survive round trip", async () => {
  await withTempStore(async ({ store }) => {
    const identity = sampleIdentity();
    const envelope = {
      seasonId: identity.seasonId,
      baseMapId: identity.baseMapId,
      ownershipByCellKey: {
        "1:1": null,
        "1:2": {
          ownerId: "union-a"
        },
        "1:3": {}
      }
    };

    await store.saveEnvelope(identity, envelope);
    const loaded = await store.loadEnvelope(identity);

    assert.deepStrictEqual(loaded, envelope);
    assert.strictEqual(loaded.ownershipByCellKey["1:1"], null);
    assert.deepStrictEqual(loaded.ownershipByCellKey["1:3"], {});
  });
});

runTest("raw identity strings with traversal characters do not escape base directory", async () => {
  await withTempStore(async ({ store, tempDirectory }) => {
    const identity = sampleIdentity({ seasonId: "../season/..//one", baseMapId: "..\\..\\map" });
    const envelope = sampleEnvelope({ seasonId: "../season/..//one", baseMapId: "..\\..\\map" }, { marker: "safe" });

    await store.saveEnvelope(identity, envelope);

    const fileNames = await fs.promises.readdir(tempDirectory);
    const fileName = getSingleJsonFileName(fileNames);
    assert.match(fileName, /^[a-f0-9]{64}\.json$/);

    const resolvedFile = path.resolve(tempDirectory, fileName);
    const resolvedBase = path.resolve(tempDirectory);

    assert.ok(resolvedFile.startsWith(`${resolvedBase}${path.sep}`));
    assert.strictEqual(fileName.includes(".."), false);
    assert.strictEqual(fileName.includes("/"), false);
    assert.strictEqual(fileName.includes("\\"), false);
  });
});

runTest("invalid identity shapes, unknown fields, whitespace IDs, and mismatch are rejected", async () => {
  await withTempStore(async ({ store }) => {
    await assert.rejects(() => store.loadEnvelope(null), TypeError);
    await assert.rejects(() => store.loadEnvelope([]), TypeError);
    await assert.rejects(() => store.loadEnvelope({ seasonId: "season-1" }), TypeError);
    await assert.rejects(() => store.loadEnvelope({ seasonId: "season-1", baseMapId: "map", extra: true }), TypeError);
    await assert.rejects(() => store.loadEnvelope({ scope: "unknown", seasonId: "season-1" }), TypeError);
    await assert.rejects(() => store.loadEnvelope({ seasonId: "   ", baseMapId: "map" }), TypeError);
    await assert.rejects(() => store.loadEnvelope({ seasonId: "season-1", baseMapId: "   " }), TypeError);

    await assert.rejects(
      () => store.saveEnvelope(sampleIdentity(), sampleEnvelope(null, { seasonId: "season-2" })),
      TypeError
    );
    await assert.rejects(
      () => store.saveEnvelope(sampleIdentity(), sampleEnvelope(null, { baseMapId: "other-map" })),
      TypeError
    );
  });
});

runTest("malformed stored JSON is surfaced", async () => {
  await withTempStore(async ({ store, tempDirectory }) => {
    const identity = sampleIdentity();
    await store.saveEnvelope(identity, sampleEnvelope());

    const fileNames = await fs.promises.readdir(tempDirectory);
    const fileName = getSingleJsonFileName(fileNames);
    const filePath = path.join(tempDirectory, fileName);
    await fs.promises.writeFile(filePath, "{bad json", "utf8");

    await assert.rejects(
      () => store.loadEnvelope(identity),
      (error) => error instanceof SyntaxError
    );
  });
});

runTest("failed writes attempt temporary-file cleanup", async () => {
  await withTempStore(async ({ store, tempDirectory }) => {
    const originalRename = fs.promises.rename;
    const originalUnlink = fs.promises.unlink;
    const removedTempFiles = [];

    fs.promises.rename = async () => {
      throw new Error("forced-rename-failure");
    };

    fs.promises.unlink = async (filePath) => {
      removedTempFiles.push(filePath);
      return originalUnlink(filePath);
    };

    try {
      await assert.rejects(
        () => store.saveEnvelope(sampleIdentity(), sampleEnvelope()),
        (error) => error && error.message === "forced-rename-failure"
      );
    } finally {
      fs.promises.rename = originalRename;
      fs.promises.unlink = originalUnlink;
    }

    assert.strictEqual(removedTempFiles.length, 1);
    assert.ok(path.resolve(removedTempFiles[0]).startsWith(`${path.resolve(tempDirectory)}${path.sep}`));
    const fileName = path.basename(removedTempFiles[0]);
    assert.match(fileName, /^[a-f0-9]{64}\.json\./);
  });
});

runTest("input data is not mutated", async () => {
  await withTempStore(async ({ store }) => {
    const identity = sampleIdentity();
    const envelope = sampleEnvelope();
    const identitySnapshot = JSON.parse(JSON.stringify(identity));
    const envelopeSnapshot = JSON.parse(JSON.stringify(envelope));

    await store.saveEnvelope(identity, envelope);

    assert.deepStrictEqual(identity, identitySnapshot);
    assert.deepStrictEqual(envelope, envelopeSnapshot);
  });
});

runTest("adapter forwards load and save correctly", async () => {
  const calls = [];
  const bridge = {
    async loadEnvelope(identity) {
      calls.push({ method: "load", identity });
      return { loaded: true, identity };
    },
    async saveEnvelope(identity, envelope) {
      calls.push({ method: "save", identity, envelope });
      return { saved: true, identity, envelope };
    }
  };

  const adapter = createElectronFileStorageAdapter(bridge);
  const identity = sampleIdentity();
  const envelope = sampleEnvelope();

  const loaded = await adapter.loadEnvelope(identity);
  const saved = await adapter.saveEnvelope(identity, envelope);

  assert.deepStrictEqual(loaded, { loaded: true, identity });
  assert.deepStrictEqual(saved, { saved: true, identity, envelope });
  assert.deepStrictEqual(calls, [
    { method: "load", identity },
    { method: "save", identity, envelope }
  ]);
});

runTest("class-based bridge methods retain this", async () => {
  class Bridge {
    constructor() {
      this.calls = 0;
    }

    async loadEnvelope(identity) {
      this.calls += 1;
      return { type: "load", calls: this.calls, identity };
    }

    async saveEnvelope(identity, envelope) {
      this.calls += 1;
      return { type: "save", calls: this.calls, identity, envelope };
    }
  }

  const bridge = new Bridge();
  const adapter = createElectronFileStorageAdapter(bridge);

  const loaded = await adapter.loadEnvelope(sampleIdentity());
  const saved = await adapter.saveEnvelope(sampleIdentity(), sampleEnvelope());

  assert.strictEqual(loaded.calls, 1);
  assert.strictEqual(saved.calls, 2);
  assert.strictEqual(bridge.calls, 2);
});

runTest("invalid bridges are rejected", () => {
  assert.throws(() => createElectronFileStorageAdapter(null), TypeError);
  assert.throws(() => createElectronFileStorageAdapter([]), TypeError);
  assert.throws(() => createElectronFileStorageAdapter({}), TypeError);
  assert.throws(() => createElectronFileStorageAdapter({ loadEnvelope() {} }), TypeError);
  assert.throws(() => createElectronFileStorageAdapter({ saveEnvelope() {} }), TypeError);
});

runTest("preload source exposes only restricted bridge", async () => {
  const preloadPath = path.join(workspaceRoot, "preload.js");
  const source = await fs.promises.readFile(preloadPath, "utf8");

  let exposedName = null;
  let exposedApi = null;
  const invoked = [];
  const requiredModules = [];

  const sandbox = {
    require(moduleName) {
      requiredModules.push(moduleName);

      if (moduleName === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld(name, api) {
              exposedName = name;
              exposedApi = api;
            }
          },
          ipcRenderer: {
            invoke(channel, ...args) {
              invoked.push({ channel, args });
              return Promise.resolve({ channel, args });
            }
          }
        };
      }

      throw new Error(`Unexpected preload require: ${moduleName}`);
    },
    globalThis: {},
    module: { exports: {} },
    exports: {}
  };

  vm.runInNewContext(source, sandbox, { filename: "preload.js" });

  assert.strictEqual(exposedName, "warMapPersistenceStorage");
  assert.ok(exposedApi && typeof exposedApi === "object");
  assert.deepStrictEqual(Object.keys(exposedApi).sort(), ["loadEnvelope", "saveEnvelope"]);
  assert.strictEqual(typeof exposedApi.loadEnvelope, "function");
  assert.strictEqual(typeof exposedApi.saveEnvelope, "function");

  const identity = sampleIdentity();
  const envelope = sampleEnvelope();
  await exposedApi.loadEnvelope(identity);
  await exposedApi.saveEnvelope(identity, envelope);

  assert.deepStrictEqual(requiredModules, ["electron"]);
  assert.deepStrictEqual(invoked, [
    {
      channel: "persistence:load-envelope",
      args: [identity]
    },
    {
      channel: "persistence:save-envelope",
      args: [identity, envelope]
    }
  ]);

  assert.strictEqual("ipcRenderer" in exposedApi, false);
  assert.strictEqual("invoke" in exposedApi, false);
});

runTest("main source uses preload security settings fixed handlers and user-data directory", async () => {
  const source = await fs.promises.readFile(path.join(workspaceRoot, "main.js"), "utf8");

  assert.match(source, /preload\s*:\s*path\.join\(__dirname,\s*"preload\.js"\)/);
  assert.match(source, /contextIsolation\s*:\s*true/);
  assert.match(source, /nodeIntegration\s*:\s*false/);
  assert.match(source, /path\.join\(app\.getPath\("userData"\),\s*"warmap-state"\)/);

  const handleCount = (source.match(/ipcMain\.handle\(/g) || []).length;
  assert.strictEqual(handleCount, 2);

  assert.match(source, /PERSISTENCE_IPC_CHANNELS\.LOAD_ENVELOPE/);
  assert.match(source, /PERSISTENCE_IPC_CHANNELS\.SAVE_ENVELOPE/);
});

runTest("main uses shared channel constants while preload is self-contained", async () => {
  const sharedSource = await fs.promises.readFile(path.join(workspaceRoot, "src/shared/persistence-ipc-channels.js"), "utf8");
  const mainSource = await fs.promises.readFile(path.join(workspaceRoot, "main.js"), "utf8");
  const preloadSource = await fs.promises.readFile(path.join(workspaceRoot, "preload.js"), "utf8");

  assert.match(sharedSource, /LOAD_ENVELOPE/);
  assert.match(sharedSource, /SAVE_ENVELOPE/);
  assert.match(mainSource, /require\("\.\/src\/shared\/persistence-ipc-channels\.js"\)/);
  assert.match(mainSource, /PERSISTENCE_IPC_CHANNELS\.LOAD_ENVELOPE/);
  assert.match(mainSource, /PERSISTENCE_IPC_CHANNELS\.SAVE_ENVELOPE/);
  assert.doesNotMatch(preloadSource, /require\("\.\/src\/shared\/persistence-ipc-channels\.js"\)/);
  assert.match(preloadSource, /"persistence:load-envelope"/);
  assert.match(preloadSource, /"persistence:save-envelope"/);
});

runTest("renderer adapter source has no prohibited dependencies", async () => {
  const source = (await fs.promises.readFile(path.join(workspaceRoot, "src/services/electron-file-storage-adapter.js"), "utf8")).toLowerCase();

  const forbiddenSubstrings = [
    "require(\"electron\")",
    "ipcrenderer",
    "ipcmain",
    "document",
    "window.",
    "require(\"fs\")",
    "fetch(",
    "http://",
    "https://",
    "localstorage",
    "season1"
  ];

  forbiddenSubstrings.forEach((value) => {
    assert.strictEqual(source.includes(value), false, `Unexpected dependency marker: ${value}`);
  });
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
