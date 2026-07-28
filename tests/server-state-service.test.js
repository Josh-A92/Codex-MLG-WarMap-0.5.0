const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createServerStateService } = require("../src/services/server-state-service.js");

function createValidSeasonState() {
  return {
    seasonId: "season-1",
    baseMapId: "season1-map",
    servers: [
      {
        id: "server-366",
        label: "Server 366",
        baseMapId: "season1-map",
        activeUnionId: null,
        ownership: {},
        extraMetadata: {
          untouched: true
        }
      },
      {
        id: "server-367",
        label: "Server 367",
        baseMapId: "season1-map",
        activeUnionId: null,
        ownership: {}
      }
    ]
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

runTest("valid initialization from current data shape", () => {
  const input = createValidSeasonState();
  const service = createServerStateService(input);

  assert.strictEqual(service.getSeasonId(), "season-1");
  assert.strictEqual(service.getBaseMapId(), "season1-map");
  assert.strictEqual(service.hasServer("server-366"), true);
  assert.strictEqual(service.hasServer("server-999"), false);

  assert.deepStrictEqual(service.listServers().map((server) => server.id), ["server-366", "server-367"]);
});

runTest("input state is not mutated", () => {
  const input = createValidSeasonState();
  const before = clone(input);
  const service = createServerStateService(input);

  service.setTerritoryOwner("server-366", "10-11", "union-0001");

  assert.deepStrictEqual(input, before);
});

runTest("returned snapshots cannot mutate internal state", () => {
  const service = createServerStateService(createValidSeasonState());
  const servers = service.listServers();
  const server = service.getServer("server-366");
  const ownership = service.getTerritoryOwnership("server-366");

  servers[0].label = "Changed";
  server.activeUnionId = "union-0002";
  ownership["10-11"] = "union-0002";

  assert.strictEqual(service.getServer("server-366").label, "Server 366");
  assert.strictEqual(service.getServer("server-366").activeUnionId, null);
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), null);
});

runTest("per-server ownership isolation", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0001");
  assert.strictEqual(service.getTerritoryOwner("server-367", "10-11", null), null);
});

runTest("missing override uses fallback", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0002"), "union-0002");
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", undefined), null);
});

runTest("explicit null override suppresses fallback", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", null);

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0001"), null);
});

runTest("setting and clearing ownership", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.strictEqual(service.setTerritoryOwner("server-366", "10-11", "union-0003"), "union-0003");
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0003");

  assert.strictEqual(service.setTerritoryOwner("server-366", "10-11", null), null);
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0003"), null);
});

runTest("invalid owner ids are rejected", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.throws(() => service.setTerritoryOwner("server-366", "10-11", ""), /ownerId/);
  assert.throws(() => service.setTerritoryOwner("server-366", "10-11", "   "), /ownerId/);
  assert.throws(() => service.setTerritoryOwner("server-366", "10-11", 123), /ownerId/);
});

runTest("invalid or empty territory keys are rejected", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.throws(() => service.getTerritoryOwner("server-366", "", null), /territoryKey/);
  assert.throws(() => service.getTerritoryOwner("server-366", "   ", null), /territoryKey/);
  assert.throws(() => service.setTerritoryOwner("server-366", "", null), /territoryKey/);
});

runTest("unknown server writes are rejected", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.throws(() => service.setTerritoryOwner("server-999", "10-11", "union-0001"), /could not find server/);
});

runTest("duplicate server ids are rejected", () => {
  const input = createValidSeasonState();
  input.servers.push({
    id: "server-366",
    label: "Duplicate",
    baseMapId: "season1-map",
    activeUnionId: null,
    ownership: {}
  });

  assert.throws(() => createServerStateService(input), /Duplicate id 'server-366'/);
});

runTest("malformed ownership objects are rejected", () => {
  const input = createValidSeasonState();
  input.servers[0].ownership = [];
  assert.throws(() => createServerStateService(input), /ownership to be an object/);

  const invalidOwnershipValue = createValidSeasonState();
  invalidOwnershipValue.servers[0].ownership["10-11"] = "   ";
  assert.throws(() => createServerStateService(invalidOwnershipValue), /ownership\['10-11'\]/);

  const emptyOwnershipKey = createValidSeasonState();
  emptyOwnershipKey.servers[0].ownership[""] = "union-0001";
  assert.throws(() => createServerStateService(emptyOwnershipKey), /servers\[0\]\.ownership key ''/);

  const whitespaceOwnershipKey = createValidSeasonState();
  whitespaceOwnershipKey.servers[0].ownership["   "] = "union-0001";
  assert.throws(() => createServerStateService(whitespaceOwnershipKey), /servers\[0\]\.ownership key '   '/);
});

runTest("malformed top-level input is rejected", () => {
  assert.throws(() => createServerStateService(null), /initialSeasonState/);
  assert.throws(() => createServerStateService({}), /seasonId/);
  assert.throws(() => createServerStateService({ seasonId: "a", baseMapId: "b", servers: {} }), /servers to be an array/);
});

runTest("browser-global and CommonJS exports are available", () => {
  assert.strictEqual(typeof createServerStateService, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "server-state-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createServerStateService, "function");
});

runTest("service source has no DOM filesystem network or season-specific assumptions", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "server-state-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['\"]fs['\"]\)/.test(source));
  assert.ok(!/season-1|season1-map|server-366|map-renderer|rows|columns/.test(source));
});

runTest("renderer uses server state service ownership boundary APIs", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.ok(/serverStateService\.listServers\(/.test(rendererSource));
  assert.ok(/serverStateService\.getTerritoryOwner\(/.test(rendererSource));
  assert.ok(/serverStateService\.setTerritoryOwner\(/.test(rendererSource));
});

runTest("renderer no longer directly initializes or mutates server ownership", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");
  const tileOwnerAssignmentPattern = /tile\.ownerId\s*=\s*[^=]/;

  assert.strictEqual(tileOwnerAssignmentPattern.test("tile.ownerId = value;"), true);
  assert.strictEqual(tileOwnerAssignmentPattern.test("tile.ownerId == null"), false);
  assert.strictEqual(tileOwnerAssignmentPattern.test("tile.ownerId === null"), false);

  assert.ok(!/server\.ownership\s*=\s*\{\}/.test(rendererSource));
  assert.ok(!/\.ownership\[[^\]]+\]\s*=/.test(rendererSource));
  assert.ok(!tileOwnerAssignmentPattern.test(rendererSource));
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