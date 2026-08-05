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

runTest("transaction snapshot restores every server ownership projection safely", () => {
  const service = createServerStateService(createValidSeasonState());
  service.setTerritoryOwner("server-366", "10-11", "union-0001");
  const snapshot = service.captureTransactionState();

  service.setTerritoryOwner("server-366", "10-11", "union-0002");
  service.setTerritoryOwner("server-367", "5-5", "union-0003");
  service.restoreTransactionState(snapshot);

  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0001");
  assert.strictEqual(service.getTerritoryOwner("server-367", "5-5", null), null);
  snapshot["server-366"]["10-11"] = "mutated";
  assert.strictEqual(service.getTerritoryOwner("server-366", "10-11", null), "union-0001");
});

runTest("user-entered servers can be registered and listed safely", () => {
  const service = createServerStateService(createValidSeasonState());
  const registered = service.registerServer({ id: "server-374", label: "Server 374" });

  assert.deepStrictEqual(registered, {
    id: "server-374",
    label: "Server 374",
    baseMapId: "season1-map",
    ownership: {}
  });
  assert.strictEqual(service.hasServer("server-374"), true);
  assert.strictEqual(service.listServers().at(-1).label, "Server 374");
  registered.label = "Mutated";
  assert.strictEqual(service.getServer("server-374").label, "Server 374");
});

runTest("server registration validates its boundary and rejects duplicates", () => {
  const service = createServerStateService(createValidSeasonState());

  assert.throws(() => service.registerServer(null), /server to be an object/);
  assert.throws(() => service.registerServer({ id: "", label: "Server 374" }), /server\.id/);
  assert.throws(() => service.registerServer({ id: "server-374", label: "   " }), /server\.label/);
  assert.throws(() => service.registerServer({ id: "server-374", label: "Server 374", extra: true }), /extra/);
  assert.throws(() => service.registerServer({ id: "server-366", label: "Server 366" }), /already contains/);
});

runTest("freshly registered servers can be removed but populated servers cannot", () => {
  const service = createServerStateService(createValidSeasonState());
  service.registerServer({ id: "server-374", label: "Server 374" });
  assert.strictEqual(service.unregisterServer("server-374"), true);
  assert.strictEqual(service.hasServer("server-374"), false);

  service.registerServer({ id: "server-374", label: "Server 374" });
  service.setTerritoryOwner("server-374", "1-1", "union-1");
  assert.throws(() => service.unregisterServer("server-374"), /ownership data/);
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
  assert.ok(/serverStateService\.registerServer\(/.test(rendererSource));
});

runTest("renderer uses canonical union registry fields only", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.ok(/union\.unionId/.test(rendererSource));
  assert.ok(/union\.tag/.test(rendererSource));
  assert.ok(/union\.defaultColor/.test(rendererSource));
  assert.ok(!/union\.id/.test(rendererSource));
  assert.ok(!/shortName/.test(rendererSource));
  assert.ok(!/union\.color/.test(rendererSource));
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
  const initializeMapStart = rendererSource.indexOf("function initializeMap()");
  const configureRendererStart = rendererSource.indexOf("function configureRenderer(", initializeMapStart);
  const initializeMapSource = rendererSource.slice(initializeMapStart, configureRendererStart);

  const initializeIndex = initializeMapSource.indexOf("await serverStatePersistenceController.initialize(serverStateService);");
  const initializeSummaryServiceIndex = initializeMapSource.indexOf("initializeSummaryService();");
  const listServersIndex = initializeMapSource.indexOf("appState.allServers = serverStateService.listServers();");
  const activeSeasonIndex = initializeMapSource.indexOf("seasonAdministrationService.getActiveSeason();");
  const renderWorkspaceNavigationIndex = initializeMapSource.indexOf("renderWorkspaceNavigation();");
  const renderMapIndex = initializeMapSource.indexOf("renderMap(mapData);");
  const initializeCameraIndex = initializeMapSource.indexOf("initializeCamera(mapData);");
  const attachSelectionPanelHandlersIndex = initializeMapSource.indexOf("attachSelectionPanelHandlers();");
  const setActiveWorkspaceIndex = initializeMapSource.indexOf("setActiveWorkspace(workspaceHome);");

  [
    initializeIndex,
    initializeSummaryServiceIndex,
    listServersIndex,
    activeSeasonIndex,
    renderWorkspaceNavigationIndex,
    renderMapIndex,
    initializeCameraIndex,
    attachSelectionPanelHandlersIndex,
    setActiveWorkspaceIndex
  ].forEach((index) => {
    assert.ok(index > -1);
  });

  assert.ok(initializeIndex < listServersIndex);
  assert.ok(listServersIndex < activeSeasonIndex);
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

  assert.ok(/summaryServiceFactory\(\{[\s\S]*getMapData:[\s\S]*getUnionRegistry:[\s\S]*getGameRulesEngine:[\s\S]*getNativeUnionIds:[\s\S]*getTerritoryOwner: serverStateService\.getTerritoryOwner\.bind\(serverStateService\)/.test(rendererSource));
  assert.strictEqual(/server\.ownership/.test(rendererSource), false);
});

runTest("renderer restores one coherent data management state before composing management runtime", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.ok(/dataManagementPersistenceController\.initialize\(\{[\s\S]*seasonId: seasonIdentity\.seasonId,[\s\S]*bundledIdentities/.test(rendererSource));
  assert.ok(/appState\.unionRegistryService = restored\.unionRegistryService/.test(rendererSource));
  assert.ok(/strategicDomainRuntime = restored\.strategicDomainRuntime/.test(rendererSource));
  assert.ok(/evidenceDomainRuntime = restored\.evidenceDomainRuntime/.test(rendererSource));
  assert.ok(/dataManagementRuntimeFactory\(\{[\s\S]*modules: dataManagementModules[\s\S]*unionRegistryService: appState\.unionRegistryService[\s\S]*strategicDomainRuntime,[\s\S]*evidenceDomainRuntime,[\s\S]*serverStateService,[\s\S]*clock: \(\) => new Date\(\)\.toISOString\(\)[\s\S]*createId: createRuntimeId/.test(rendererSource));
  assert.ok(/appState\.dataManagementRuntime = dataManagementRuntime/.test(rendererSource));

  const restoreIndex = rendererSource.indexOf("await initializePersistedDataManagementDomains(bundledIdentities);");
  const managementIndex = rendererSource.indexOf("initializeDataManagementRuntime();");
  const serverStateIndex = rendererSource.indexOf("initializeServerStateService(seasonServerState);");
  assert.ok(restoreIndex > -1);
  assert.ok(serverStateIndex > restoreIndex);
  assert.ok(managementIndex > serverStateIndex);
});

runTest("renderer routes ownership through the canonical coordinator and saves both state domains", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  const changeHandlerMatch = rendererSource.match(/async function handleSelectionPanelChange\(event\) \{[\s\S]*?\n\}/);
  assert.ok(changeHandlerMatch);

  const changeHandlerSource = changeHandlerMatch[0];
  const requestSaveMatches = changeHandlerSource.match(/requestSave\(/g) || [];
  const refreshCardsMatches = changeHandlerSource.match(/refreshCommandCentreCards\(/g) || [];

  assert.strictEqual(requestSaveMatches.length, 2);
  assert.strictEqual(refreshCardsMatches.length, 2);
  assert.ok(/mapOwnershipCoordinator\.setStructureOwnership\(localActor/.test(changeHandlerSource));
  assert.ok(/mapOwnershipCoordinator\.setTerritoryOwnership\(localActor/.test(changeHandlerSource));
  assert.ok(/serverStatePersistenceController\.requestSave\(\)/.test(changeHandlerSource));
  assert.ok(/dataManagementPersistenceController\.requestSave\(\)/.test(changeHandlerSource));
  assert.strictEqual(/ownershipService\.setTileOwner/.test(changeHandlerSource), false);

  const tileSetterMatch = rendererSource.match(/function setServerTileOwner\(tile, ownerId\) \{[\s\S]*?\n\}/);
  assert.ok(tileSetterMatch);
  assert.strictEqual(/requestSave\(/.test(tileSetterMatch[0]), false);
});

runTest("renderer command centre source contains no placeholder text and explicit structures wording", () => {
  const rendererPath = path.join(__dirname, "..", "src", "map-renderer.js");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");

  assert.strictEqual(/Placeholder only/i.test(rendererSource), false);
  assert.strictEqual(/Designated Union/.test(rendererSource), false);
  assert.ok(/Leading Union/.test(rendererSource));
  assert.ok(/<span>Structures<\/span><strong>\$\{structureAggregate\.designatedUnionControlledCount\} controlled · \$\{structureAggregate\.availableCount\} available<\/strong>/.test(rendererSource));
});

runTest("map layout removes the legend and provides smartphone responsive boundaries", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const styleSource = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");

  assert.strictEqual(/class="legend"/.test(indexSource), false);
  assert.ok(/class="server-dock"/.test(indexSource));
  assert.ok(/@media \(max-width: 760px\)/.test(styleSource));
  assert.ok(/overflow-x:hidden/.test(styleSource));
  assert.ok(/\.workspace-shell\s*\{[\s\S]*min-width:0/.test(styleSource));
  assert.ok(/#serverDockButtons\s*\{[\s\S]*flex-wrap:wrap/.test(styleSource));
  assert.ok(/\.camera-viewport\s*\{[\s\S]*overflow:hidden/.test(styleSource));
});

runTest("compact selected-target panel uses canonical view data without coordinates or evidence", () => {
  const rendererSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "map-renderer.js"),
    "utf8"
  );
  const start = rendererSource.indexOf("function renderSelectionPanel(tile)");
  const end = rendererSource.indexOf("function clearHoverEffects()", start);
  assert.ok(start > -1 && end > start);
  const selectionRenderer = rendererSource.slice(start, end);
  assert.ok(/getSelectedTargetView\(tile\)/.test(selectionRenderer));
  assert.ok(/Last confirmed/.test(selectionRenderer));
  assert.ok(/Last ownership change/.test(selectionRenderer));
  assert.ok(/Season value/.test(selectionRenderer));
  assert.strictEqual(/Coordinate|Row \$\{|Column|Evidence source/.test(selectionRenderer), false);
  assert.ok(/selectedMapTargetViewService\.getTerritoryView/.test(rendererSource));
  assert.ok(/selectedMapTargetViewService\.getStructureView/.test(rendererSource));
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
