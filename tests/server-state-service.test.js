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

runTest("removing a string owner restores fallback behavior", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0003");
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0002"), "union-0003");

  assert.strictEqual(service.removeTerritoryOwnerOverride("server-366", "10-11"), true);
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0002"), "union-0002");
});

runTest("removing an explicit null override restores fallback behavior", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", null);
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0002"), null);

  assert.strictEqual(service.removeTerritoryOwnerOverride("server-366", "10-11"), true);
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0002"), "union-0002");
});

runTest("removing a missing override returns false", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.strictEqual(service.removeTerritoryOwnerOverride("server-366", "10-11"), false);
});

runTest("replacement updates supplied servers", () => {
  const service = createServerStateService(createValidSeasonState());

  service.replaceTerritoryOwnership({
    "server-366": {
      "10-11": "union-0001"
    },
    "server-367": {
      "5-5": "union-0002"
    }
  });

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0001");
  assert.strictEqual(service.getTerritoryOwner("server-367", "5-5", null), "union-0002");
});

runTest("replacement clears omitted active servers", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-367", "5-5", "union-0002");

  service.replaceTerritoryOwnership({
    "server-366": {
      "10-11": "union-0003"
    }
  });

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0003");
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), {});
});

runTest("replacement preserves explicit null", () => {
  const service = createServerStateService(createValidSeasonState());

  service.replaceTerritoryOwnership({
    "server-366": {
      "10-11": null
    }
  });

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0001"), null);
});

runTest("replacement does not merge old keys", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-366", "10-12", "union-0002");

  service.replaceTerritoryOwnership({
    "server-366": {
      "10-12": "union-0003"
    },
    "server-367": {}
  });

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", "union-0009"), "union-0009");
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-12", null), "union-0003");
});

runTest("replacement does not retain input references", () => {
  const service = createServerStateService(createValidSeasonState());
  const replacementInput = {
    "server-366": {
      "10-11": "union-0001"
    },
    "server-367": {}
  };

  service.replaceTerritoryOwnership(replacementInput);
  replacementInput["server-366"]["10-11"] = "union-9999";
  replacementInput["server-366"]["10-12"] = "union-9998";

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0001");
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-12", null), null);
});

runTest("replaceTerritoryOwnership rejects Date as top-level replacement before mutation", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-367", "5-5", "union-0002");

  const before366 = service.getTerritoryOwnership("server-366");
  const before367 = service.getTerritoryOwnership("server-367");

  assert.throws(() => {
    service.replaceTerritoryOwnership(new Date("2026-07-28T12:00:00.000Z"));
  }, /ownershipByServerId to be an object/);

  assert.deepStrictEqual(service.getTerritoryOwnership("server-366"), before366);
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), before367);
});

runTest("replaceTerritoryOwnership rejects Date as server ownership value before mutation", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-367", "5-5", "union-0002");

  const before366 = service.getTerritoryOwnership("server-366");
  const before367 = service.getTerritoryOwnership("server-367");

  assert.throws(() => {
    service.replaceTerritoryOwnership({
      "server-366": new Date("2026-07-28T12:00:00.000Z"),
      "server-367": {}
    });
  }, /ownershipByServerId\['server-366'\] to be an object/);

  assert.deepStrictEqual(service.getTerritoryOwnership("server-366"), before366);
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), before367);
});

runTest("replaceTerritoryOwnership rejects class instance as server ownership value before mutation", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-367", "5-5", "union-0002");

  const before366 = service.getTerritoryOwnership("server-366");
  const before367 = service.getTerritoryOwnership("server-367");

  class OwnershipContainer {
    constructor() {
      this["10-11"] = "union-0003";
    }
  }

  assert.throws(() => {
    service.replaceTerritoryOwnership({
      "server-366": new OwnershipContainer(),
      "server-367": {}
    });
  }, /ownershipByServerId\['server-366'\] to be an object/);

  assert.deepStrictEqual(service.getTerritoryOwnership("server-366"), before366);
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), before367);
});

runTest("replaceTerritoryOwnership accepts normal object and updates ownership", () => {
  const service = createServerStateService(createValidSeasonState());

  service.replaceTerritoryOwnership({
    "server-366": {
      "10-11": "union-0003"
    },
    "server-367": {}
  });

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0003");
});

runTest("replaceTerritoryOwnership accepts null-prototype ownership dictionaries", () => {
  const service = createServerStateService(createValidSeasonState());
  const nullPrototypeOwnership = Object.create(null);
  nullPrototypeOwnership["10-11"] = "union-0004";

  service.replaceTerritoryOwnership({
    "server-366": nullPrototypeOwnership,
    "server-367": {}
  });

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0004");
});

runTest("unknown servers are rejected without changing any server", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-367", "5-5", "union-0002");

  const before366 = service.getTerritoryOwnership("server-366");
  const before367 = service.getTerritoryOwnership("server-367");

  assert.throws(() => {
    service.replaceTerritoryOwnership({
      "server-366": {
        "10-11": "union-0003"
      },
      "server-999": {
        "8-8": "union-0004"
      }
    });
  }, /could not find server/);

  assert.deepStrictEqual(service.getTerritoryOwnership("server-366"), before366);
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), before367);
});

runTest("invalid territory keys or ownership values are rejected without partial mutation", () => {
  const service = createServerStateService(createValidSeasonState());

  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  service.setTerritoryOwner("server-367", "5-5", "union-0002");

  const before366 = service.getTerritoryOwnership("server-366");
  const before367 = service.getTerritoryOwnership("server-367");

  assert.throws(() => {
    service.replaceTerritoryOwnership({
      "server-366": {
        "   ": "union-0003"
      },
      "server-367": {}
    });
  }, /ownershipByServerId\['server-366'\] key '   '/);

  assert.deepStrictEqual(service.getTerritoryOwnership("server-366"), before366);
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), before367);

  assert.throws(() => {
    service.replaceTerritoryOwnership({
      "server-366": {
        "10-11": "   "
      },
      "server-367": {}
    });
  }, /ownershipByServerId\['server-366'\]\['10-11'\]/);

  assert.deepStrictEqual(service.getTerritoryOwnership("server-366"), before366);
  assert.deepStrictEqual(service.getTerritoryOwnership("server-367"), before367);
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

runTest("renderer requires persistence controller initialize and requestSave", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.ok(/serverStatePersistenceController/.test(rendererSource));
  assert.ok(/serverStatePersistenceController\.initialize/.test(rendererSource));
  assert.ok(/serverStatePersistenceController\.requestSave/.test(rendererSource));
});

runTest("renderer restores ownership before workspace and map initialization flow", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  const initializeIndex = rendererSource.indexOf("await serverStatePersistenceController.initialize(serverStateService);");
  const initializeSummaryServiceIndex = rendererSource.indexOf("initializeSummaryService();");
  const listServersIndex = rendererSource.indexOf("appState.servers = serverStateService.listServers();");
  const renderWorkspaceNavigationIndex = rendererSource.indexOf("renderWorkspaceNavigation();");
  const renderMapIndex = rendererSource.indexOf("renderMap(mapData);");
  const initializeCameraIndex = rendererSource.indexOf("initializeCamera(mapData);");
  const attachSelectionPanelHandlersIndex = rendererSource.indexOf("attachSelectionPanelHandlers();");
  const setActiveWorkspaceIndex = rendererSource.indexOf("setActiveWorkspace(workspaceHome);");

  [
    initializeIndex,
    initializeSummaryServiceIndex,
    listServersIndex,
    renderWorkspaceNavigationIndex,
    renderMapIndex,
    initializeCameraIndex,
    attachSelectionPanelHandlersIndex,
    setActiveWorkspaceIndex
  ].forEach((index) => {
    assert.ok(index > -1);
  });

  assert.ok(initializeIndex < listServersIndex);
  assert.ok(initializeIndex < initializeSummaryServiceIndex);
  assert.ok(initializeSummaryServiceIndex < renderWorkspaceNavigationIndex);
  assert.ok(initializeIndex < renderWorkspaceNavigationIndex);
  assert.ok(initializeIndex < renderMapIndex);
  assert.ok(initializeIndex < initializeCameraIndex);
  assert.ok(initializeIndex < attachSelectionPanelHandlersIndex);
  assert.ok(initializeIndex < setActiveWorkspaceIndex);
});

runTest("renderer initializes summary service through server state ownership API", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.ok(/summaryServiceFactory\(\{[\s\S]*getMapData:[\s\S]*getUnionRegistry:[\s\S]*getGameRulesEngine:[\s\S]*getDesignatedUnionId:[\s\S]*getTerritoryOwner: serverStateService\.getTerritoryOwner\.bind\(serverStateService\)/.test(rendererSource));
  assert.strictEqual(/server\.ownership/.test(rendererSource), false);
});

runTest("renderer requests exactly one save after completed ownership edit", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  const changeHandlerMatch = rendererSource.match(/function handleSelectionPanelChange\(event\) \{[\s\S]*?\n\}/);
  assert.ok(changeHandlerMatch);

  const changeHandlerSource = changeHandlerMatch[0];
  const requestSaveMatches = changeHandlerSource.match(/requestSave\(/g) || [];
  const refreshCardsMatches = changeHandlerSource.match(/refreshCommandCentreCards\(/g) || [];

  assert.strictEqual(requestSaveMatches.length, 1);
  assert.strictEqual(refreshCardsMatches.length, 1);
  assert.ok(/refreshOwnershipView\(\);[\s\S]*refreshCommandCentreCards\(\);[\s\S]*requestSave\(\)/.test(changeHandlerSource));
  assert.ok(/requestSave\(\)\.catch\(\(error\) => \{[\s\S]*console\.error/.test(changeHandlerSource));

  const footprintMatch = rendererSource.match(/function applyStructureFootprintOwner\(structure, ownerId\) \{[\s\S]*?\n\}/);
  assert.ok(footprintMatch);
  assert.strictEqual(/requestSave\(/.test(footprintMatch[0]), false);

  const tileSetterMatch = rendererSource.match(/function setServerTileOwner\(tile, ownerId\) \{[\s\S]*?\n\}/);
  assert.ok(tileSetterMatch);
  assert.strictEqual(/requestSave\(/.test(tileSetterMatch[0]), false);
});

runTest("renderer command centre source contains no placeholder text and explicit structures wording", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.strictEqual(/Placeholder only/i.test(rendererSource), false);
  assert.ok(/<span>Structures<\/span><strong>\$\{structureAggregate\.designatedUnionControlledCount\} controlled · \$\{structureAggregate\.availableCount\} available<\/strong>/.test(rendererSource));
});

runTest("index loads summary service before renderer and bootstrap", () => {
  const indexPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(indexPath, "utf8");

  const summaryServiceIndex = html.indexOf('src="src/services/summary-service.js"');
  const rendererIndex = html.indexOf('src="src/map-renderer.js"');
  const bootstrapIndex = html.indexOf('src="src/app/application-bootstrap.js"');

  assert.ok(summaryServiceIndex > -1);
  assert.ok(rendererIndex > -1);
  assert.ok(bootstrapIndex > -1);
  assert.ok(summaryServiceIndex < rendererIndex);
  assert.ok(rendererIndex < bootstrapIndex);
});

runTest("renderer source preserves persistence boundary and excludes storage bridge and filesystem APIs", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.strictEqual(/warMapPersistenceStorage/.test(rendererSource), false);
  assert.strictEqual(/createElectronFileStorageAdapter/.test(rendererSource), false);
  assert.strictEqual(/localStorage/.test(rendererSource), false);
  assert.strictEqual(/ipcRenderer|ipcMain|electron/i.test(rendererSource), false);
  assert.strictEqual(/require\(['\"]fs['\"]\)|\bfs\./.test(rendererSource), false);
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