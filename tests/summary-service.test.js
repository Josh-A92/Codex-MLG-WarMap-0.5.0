const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createSummaryService } = require("../src/services/summary-service.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function createGameRulesEngine(options) {
  const config = options || {};
  const scoringModel = config.scoringModel || {
    configured: true,
    resourceLabel: "Ice Crystals",
    serverField: "iceCrystals",
    unconfiguredLabel: "Scoring rules not configured"
  };
  const resourceModel = config.resourceModel || {
    resourceId: "ice-crystals",
    displayName: "Ice Crystals",
    unit: "crystals",
    metricType: "season-resource",
    structureOutputs: {}
  };

  return {
    getScoringModel() {
      return { ...scoringModel };
    },
    getResourceModel() {
      return { ...resourceModel };
    }
  };
}

function createSummaryServiceFixture(options) {
  const config = options || {};
  const mapData = config.mapData || { tiles: [], structures: [] };
  const unionRegistry = config.unionRegistry || [];
  const ownershipByServerAndKey = config.ownershipByServerAndKey || {};
  const designatedByServerId = config.designatedByServerId || {};
  const gameRulesEngine = config.gameRulesEngine || createGameRulesEngine();

  const ownershipCalls = [];

  const service = createSummaryService({
    getMapData: () => mapData,
    getUnionRegistry: () => unionRegistry,
    getGameRulesEngine: () => gameRulesEngine,
    getDesignatedUnionId: (server) => {
      if (!server || typeof server.id !== "string") {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(designatedByServerId, server.id)) {
        return designatedByServerId[server.id];
      }

      return null;
    },
    getTerritoryOwner: (serverId, territoryKey, fallbackOwnerId) => {
      ownershipCalls.push({ serverId, territoryKey, fallbackOwnerId });

      const serverOwnership = ownershipByServerAndKey[serverId] || {};
      if (Object.prototype.hasOwnProperty.call(serverOwnership, territoryKey)) {
        return serverOwnership[territoryKey];
      }

      return fallbackOwnerId;
    }
  });

  return {
    service,
    ownershipCalls,
    mapData,
    unionRegistry,
    gameRulesEngine
  };
}

runTest("empty map returns zero summary values", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [],
      structures: []
    },
    designatedByServerId: {
      "server-1": "union-mlg"
    },
    unionRegistry: [
      { id: "union-mlg", shortName: "MLG" }
    ]
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.totalCapturableTileCount, 0);
  assert.strictEqual(summary.controlledTileCount, 0);
  assert.strictEqual(summary.controlledTerritoryPercent, 0);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 0);
  assert.strictEqual(summary.designatedUnionTerritoryPercent, 0);
  assert.deepStrictEqual(summary.structureOwnershipByType, []);
});

runTest("unclaimed map remains fully uncontrolled", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: null },
        { row: 1, col: 2, ownerId: null },
        { row: 2, col: 1, ownerId: null },
        { row: 2, col: 2, ownerId: null }
      ]],
      structures: []
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.totalCapturableTileCount, 4);
  assert.strictEqual(summary.controlledTileCount, 0);
  assert.strictEqual(summary.controlledTerritoryPercent, 0);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 0);
  assert.strictEqual(summary.designatedUnionTerritoryPercent, 0);
});

runTest("ownership across multiple unions reports controlled totals", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: null },
        { row: 1, col: 2, ownerId: null },
        { row: 1, col: 3, ownerId: null },
        { row: 1, col: 4, ownerId: null }
      ]],
      structures: []
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-a",
        "1-2": "union-b",
        "1-4": "union-c"
      }
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.totalCapturableTileCount, 4);
  assert.strictEqual(summary.controlledTileCount, 3);
  assert.strictEqual(summary.controlledTerritoryPercent, 75);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 1);
  assert.strictEqual(summary.designatedUnionTerritoryPercent, 25);
});

runTest("base-map ownerId is used as fallback", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service, ownershipCalls } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: "union-base" },
        { row: 1, col: 2, ownerId: null }
      ]],
      structures: []
    },
    designatedByServerId: {
      "server-1": "union-base"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.controlledTileCount, 1);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 1);
  assert.strictEqual(ownershipCalls[0].fallbackOwnerId, "union-base");
  assert.strictEqual(ownershipCalls[1].fallbackOwnerId, null);
});

runTest("explicit null ownership suppresses base-map fallback", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: "union-base" },
        { row: 1, col: 2, ownerId: "union-base" }
      ]],
      structures: []
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": null
      }
    },
    designatedByServerId: {
      "server-1": "union-base"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.totalCapturableTileCount, 2);
  assert.strictEqual(summary.controlledTileCount, 1);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 1);
});

runTest("authoritative ownership overrides are respected", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: "union-base" }
      ]],
      structures: []
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-override"
      }
    },
    designatedByServerId: {
      "server-1": "union-override"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.controlledTileCount, 1);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 1);
  assert.strictEqual(summary.designatedUnionId, "union-override");
});

runTest("different servers produce different ownership results", () => {
  const mapData = {
    tiles: [[
      { row: 1, col: 1, ownerId: null }
    ]],
    structures: []
  };

  const fixture = createSummaryServiceFixture({
    mapData,
    ownershipByServerAndKey: {
      "server-a": {
        "1-1": "union-a"
      },
      "server-b": {
        "1-1": "union-b"
      }
    },
    designatedByServerId: {
      "server-a": "union-a",
      "server-b": "union-a"
    }
  });

  const summaryA = fixture.service.getServerSummary({ id: "server-a", label: "Server A" });
  const summaryB = fixture.service.getServerSummary({ id: "server-b", label: "Server B" });

  assert.strictEqual(summaryA.designatedUnionControlledTileCount, 1);
  assert.strictEqual(summaryB.designatedUnionControlledTileCount, 0);
  assert.strictEqual(summaryA.controlledTileCount, 1);
  assert.strictEqual(summaryB.controlledTileCount, 1);
});

runTest("structure footprint ownership counts designated-union control only when fully owned", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: null },
        { row: 1, col: 2, ownerId: null },
        { row: 2, col: 1, ownerId: null },
        { row: 2, col: 2, ownerId: null }
      ]],
      structures: [
        { type: "Factory", row: 1, col: 1, rows: 1, cols: 2 },
        { type: "Factory", row: 2, col: 1, rows: 1, cols: 2 },
        { type: "Village", row: 1, col: 1, rows: 1, cols: 1 }
      ]
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-a",
        "1-2": "union-a",
        "2-1": "union-a",
        "2-2": "union-b"
      }
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);
  const factory = summary.structureOwnershipByType.find((entry) => entry.structureType === "Factory");
  const village = summary.structureOwnershipByType.find((entry) => entry.structureType === "Village");

  assert.ok(factory);
  assert.strictEqual(factory.totalCount, 2);
  assert.strictEqual(factory.designatedUnionControlledCount, 1);
  assert.strictEqual(factory.availableCount, 1);

  assert.ok(village);
  assert.strictEqual(village.totalCount, 1);
  assert.strictEqual(village.designatedUnionControlledCount, 1);
  assert.strictEqual(village.availableCount, 0);
});

runTest("missing designated union yields unassigned label and zero designated control", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: "union-a" }
      ]],
      structures: []
    },
    designatedByServerId: {
      "server-1": null
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.designatedUnionId, null);
  assert.strictEqual(summary.designatedUnionLabel, "Unassigned");
  assert.strictEqual(summary.designatedUnionControlledTileCount, 0);
  assert.strictEqual(summary.designatedUnionTerritoryPercent, 0);
});

runTest("designated union label is resolved from registry", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: "union-a" }
      ]],
      structures: []
    },
    unionRegistry: [
      { id: "union-a", shortName: "Alpha" }
    ],
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.designatedUnionLabel, "Alpha");
});

runTest("unconfigured scoring uses season-defined unconfigured label", () => {
  const server = {
    id: "server-1",
    label: "Server 1",
    scoring: {
      iceCrystals: 99999
    }
  };

  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      scoringModel: {
        configured: false,
        resourceLabel: "Season Currency",
        serverField: "iceCrystals",
        unconfiguredLabel: "Season scoring unavailable"
      }
    })
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.scoringDisplay.text, "Season scoring unavailable");
  assert.strictEqual(summary.scoringDisplay.configured, false);
  assert.strictEqual(summary.scoringDisplay.value, null);
});

runTest("configured scoring still ignores stored server totals and returns unconfigured label", () => {
  const server = {
    id: "server-1",
    label: "Server 1",
    scoring: {
      iceCrystals: 123456
    }
  };

  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      scoringModel: {
        configured: true,
        resourceLabel: "Season Currency",
        serverField: "iceCrystals",
        unconfiguredLabel: "Season scoring unavailable"
      },
      resourceModel: {
        resourceId: "season-currency",
        displayName: "Season Currency",
        unit: "points",
        metricType: "season-resource",
        structureOutputs: {}
      }
    })
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.scoringDisplay.text, "Season scoring unavailable");
  assert.strictEqual(summary.scoringDisplay.configured, false);
  assert.strictEqual(summary.scoringDisplay.value, null);
  assert.strictEqual(summary.scoringDisplay.resourceLabel, "Season Currency");
  assert.strictEqual(summary.scoringDisplay.metricType, "season-resource");
  assert.strictEqual(summary.scoringDisplay.unit, "points");
});

runTest("malformed map entries are safely ignored", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [
        [
          { row: 1, col: 1, ownerId: "union-a" },
          { row: "x", col: 2, ownerId: "union-a" },
          null
        ],
        "bad-row"
      ],
      structures: [
        null,
        { type: "Factory", row: "x", col: 1, rows: 1, cols: 1 },
        { type: "Village", row: 1, col: 1, rows: 1, cols: 1 }
      ]
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.totalCapturableTileCount, 1);
  assert.strictEqual(summary.controlledTileCount, 1);
  assert.strictEqual(summary.structureOwnershipByType.length, 1);
  assert.strictEqual(summary.structureOwnershipByType[0].structureType, "Village");
});

runTest("summary service never reads server ownership directly", () => {
  const server = {
    id: "server-1",
    label: "Server 1"
  };

  Object.defineProperty(server, "ownership", {
    get() {
      throw new Error("direct ownership read not allowed");
    }
  });

  const { service } = createSummaryServiceFixture({
    mapData: {
      tiles: [[
        { row: 1, col: 1, ownerId: null }
      ]],
      structures: []
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-a"
      }
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);
  assert.strictEqual(summary.designatedUnionControlledTileCount, 1);
});

runTest("inputs are not mutated", () => {
  const server = {
    id: "server-1",
    label: "Server 1",
    scoring: {
      iceCrystals: 200
    },
    metadata: {
      nested: true
    }
  };
  const mapData = {
    tiles: [[
      { row: 1, col: 1, ownerId: "union-a" }
    ]],
    structures: [
      { type: "Village", row: 1, col: 1, rows: 1, cols: 1 }
    ]
  };
  const unionRegistry = [
    { id: "union-a", shortName: "Alpha" }
  ];

  const serverBefore = clone(server);
  const mapBefore = clone(mapData);
  const unionsBefore = clone(unionRegistry);

  const { service } = createSummaryServiceFixture({
    mapData,
    unionRegistry,
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  service.getServerSummary(server);

  assert.deepStrictEqual(server, serverBefore);
  assert.deepStrictEqual(mapData, mapBefore);
  assert.deepStrictEqual(unionRegistry, unionsBefore);
});

runTest("browser-global and CommonJS exports are available", () => {
  assert.strictEqual(typeof createSummaryService, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "summary-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createSummaryService, "function");
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
