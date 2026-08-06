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
  const resources = config.resources || [
    {
      resourceId: "ice-crystals",
      displayName: "Ice Crystals",
      unit: "crystals",
      metricType: "season-resource"
    }
  ];
  const calculations = config.calculations || [
    {
      calculationId: "ice-crystal-holdings",
      calculationModelId: "structure-output-holdings-total",
      resourceId: resources[0].resourceId,
      configured: true,
      displayLabel: "Ice Crystals",
      serverField: "iceCrystals",
      unconfiguredLabel: "Scoring rules not configured"
    }
  ];
  const structureOutputs = config.structureOutputs || {};

  return {
    getResourceModel() {
      return {
        resources: resources.map((entry) => ({ ...entry })),
        structureOutputs: Object.fromEntries(Object.entries(structureOutputs).map(([structureCode, outputs]) => [
          structureCode,
          Array.isArray(outputs) ? outputs.map((entry) => ({ ...entry })) : []
        ]))
      };
    },
    listScoringCalculations() {
      return calculations.map((entry) => ({ ...entry }));
    },
    getStructureResourceProfile(codeOrType) {
      const outputs = structureOutputs || {};
      return Object.prototype.hasOwnProperty.call(outputs, codeOrType)
        ? (Array.isArray(outputs[codeOrType]) ? outputs[codeOrType].map((entry) => ({ ...entry })) : [])
        : null;
    }
  };
}

function createSummaryServiceFixture(options) {
  const config = options || {};
  const mapData = config.mapData || { tiles: [], structures: [] };
  const unionRegistry = config.unionRegistry || [];
  const ownershipByServerAndKey = config.ownershipByServerAndKey || {};
  const designatedByServerId = config.designatedByServerId || {};
  const nativeByServerId = config.nativeByServerId || null;
  const gameRulesEngine = config.gameRulesEngine || createGameRulesEngine();

  const ownershipCalls = [];

  const service = createSummaryService({
    getMapData: () => mapData,
    getUnionRegistry: () => unionRegistry,
    getGameRulesEngine: () => gameRulesEngine,
    getNativeUnionIds: nativeByServerId === null
      ? undefined
      : (server) => Array.isArray(nativeByServerId[server && server.id])
        ? nativeByServerId[server.id].slice()
        : [],
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
      {
        unionId: "union-mlg",
        displayName: "Moonlight Guillotine",
        tag: "MLG",
        aliases: [],
        defaultColor: "#8FCEFF",
        presentationMetadata: {},
        registryStatus: "current"
      }
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
    },
    unionRegistry: [
      {
        unionId: "union-a",
        displayName: "Alpha Union",
        tag: "Alpha",
        aliases: [],
        defaultColor: "#AABBCC",
        presentationMetadata: {},
        registryStatus: "current"
      }
    ]
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
      {
        unionId: "union-a",
        displayName: "Alpha Union",
        tag: "Alpha",
        aliases: [],
        defaultColor: "#AABBCC",
        presentationMetadata: {},
        registryStatus: "current"
      }
    ],
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.designatedUnionLabel, "Alpha");
});

runTest("leading union excludes a higher-scoring union that is not native to the server", () => {
  const server = { id: "367", label: "Server 367" };
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "season-score",
        calculationModelId: "structure-output-holdings-total",
        configured: true,
        resourceId: "points",
        displayLabel: "Points"
      }],
      resources: [{
        resourceId: "points",
        displayName: "Points",
        unit: "points",
        metricType: "season-resource"
      }],
      structureOutputs: {
        HIGH: [{ resourceId: "points", value: 500 }],
        NATIVE: [{ resourceId: "points", value: 495 }]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "HIGH", type: "City", ownerId: null },
        { row: 1, col: 2, code: "NATIVE", type: "City", ownerId: null }
      ]],
      structures: []
    },
    ownershipByServerAndKey: {
      "367": { "1-1": "union-mlg", "1-2": "union-sos" }
    },
    nativeByServerId: {
      "367": ["union-sos"]
    },
    unionRegistry: [
      { unionId: "union-mlg", tag: "MLG" },
      { unionId: "union-sos", tag: "SOS" }
    ]
  });

  const summary = service.getServerSummary(server);
  assert.deepStrictEqual(summary.leadingUnionIds, ["union-sos"]);
  assert.strictEqual(summary.leadingUnionLabel, "SOS");
  assert.strictEqual(summary.leadingUnionScore, 495);
  assert.strictEqual(summary.leadingUnionControlledTileCount, 1);
});

runTest("equal highest positive scores produce joint native leaders", () => {
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "season-score",
        calculationModelId: "structure-output-holdings-total",
        configured: true,
        resourceId: "points"
      }],
      resources: [{ resourceId: "points", displayName: "Points", unit: "points", metricType: "season-resource" }],
      structureOutputs: {
        A: [{ resourceId: "points", value: 100 }],
        B: [{ resourceId: "points", value: 100 }]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "A", ownerId: null },
        { row: 1, col: 2, code: "B", ownerId: null }
      ]],
      structures: []
    },
    ownershipByServerAndKey: { "server-1": { "1-1": "union-a", "1-2": "union-b" } },
    nativeByServerId: { "server-1": ["union-a", "union-b"] },
    unionRegistry: [
      { unionId: "union-a", tag: "A" },
      { unionId: "union-b", tag: "B" }
    ]
  });

  const summary = service.getServerSummary({ id: "server-1", label: "Server 1" });
  assert.deepStrictEqual(summary.leadingUnionIds, ["union-a", "union-b"]);
  assert.strictEqual(summary.leadingUnionId, null);
  assert.strictEqual(summary.leadingUnionLabel, "A + B");
  assert.strictEqual(summary.leadingUnionScore, 100);
});

runTest("native unions without a positive score do not create a leader", () => {
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "season-score",
        calculationModelId: "structure-output-holdings-total",
        configured: true,
        resourceId: "points"
      }],
      resources: [{ resourceId: "points", displayName: "Points", unit: "points", metricType: "season-resource" }]
    }),
    nativeByServerId: { "server-1": ["union-a"] }
  });

  const summary = service.getServerSummary({ id: "server-1", label: "Server 1" });
  assert.strictEqual(summary.leadershipStatus, "no_native_leader");
  assert.strictEqual(summary.leadingUnionLabel, "No native leader yet");
  assert.deepStrictEqual(summary.leadingUnionIds, []);
});

runTest("unconfigured scoring reports that the leader is unavailable", () => {
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "future-score",
        calculationModelId: "structure-output-holdings-total",
        configured: false,
        resourceId: "points"
      }],
      resources: [{ resourceId: "points", displayName: "Points", unit: "points", metricType: "season-resource" }]
    }),
    nativeByServerId: { "server-1": ["union-a"] }
  });

  const summary = service.getServerSummary({ id: "server-1", label: "Server 1" });
  assert.strictEqual(summary.leadershipStatus, "unavailable");
  assert.strictEqual(summary.leadingUnionLabel, "Leader unavailable");
});

runTest("configured scoring uses calculationId and supports two independent totals for one model", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [
        {
          calculationId: "ice-crystal-holdings",
          calculationModelId: "structure-output-holdings-total",
          configured: true,
          resourceId: "ice-crystals",
          displayLabel: "Ice Crystals",
          serverField: "iceCrystals",
          unconfiguredLabel: "Scoring rules not configured"
        },
        {
          calculationId: "holy-water-holdings",
          calculationModelId: "structure-output-holdings-total",
          configured: true,
          resourceId: "holy-water",
          displayLabel: "Holy Water",
          serverField: "holyWater",
          unconfiguredLabel: "Scoring rules not configured"
        }
      ],
      resources: [
        {
          resourceId: "ice-crystals",
          displayName: "Ice Crystals",
          unit: "crystals",
          metricType: "season-resource"
        },
        {
          resourceId: "holy-water",
          displayName: "Holy Water",
          unit: "vials",
          metricType: "season-resource"
        }
      ],
      structureOutputs: {
        V1: [
          { resourceId: "ice-crystals", value: 100 },
          { resourceId: "holy-water", value: 20 }
        ]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "V1", type: "Village", ownerId: null }
      ]],
      structures: [
        { code: "V1", type: "Village", row: 1, col: 1, rows: 1, cols: 1 }
      ]
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
  assert.strictEqual(summary.scoringDisplays[0].calculationId, "ice-crystal-holdings");
  assert.strictEqual(summary.scoringDisplays[0].value, 100);
  assert.strictEqual(summary.scoringDisplays[1].calculationId, "holy-water-holdings");
  assert.strictEqual(summary.scoringDisplays[1].value, 20);
  assert.strictEqual(summary.scoringDisplays[0].calculationModelId, "structure-output-holdings-total");
  assert.strictEqual(summary.scoringDisplays[1].calculationModelId, "structure-output-holdings-total");
});

runTest("production-rate calculations sum owned strategic structures and honour Royal City's declared zero output", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "dark-oil-production",
        calculationModelId: "structure-output-production-rate",
        configured: true,
        resourceId: "dark-oil",
        displayLabel: "Dark Oil",
        serverField: "darkOil",
        unconfiguredLabel: "Scoring rules not configured"
      }],
      resources: [{
        resourceId: "dark-oil",
        displayName: "Dark Oil",
        unit: "units",
        metricType: "season-resource"
      }],
      structureOutputs: {
        V1: [{ resourceId: "dark-oil", value: 100 }],
        M2: [{ resourceId: "dark-oil", value: 200 }],
        F4: [{ resourceId: "dark-oil", value: 400 }],
        MP7: [{ resourceId: "dark-oil", value: 0 }]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "RESOURCE-MINE", type: "Resource Mine", ownerId: null },
        { row: 1, col: 2, code: "RESOURCE-MINE", type: "Resource Mine", ownerId: null }
      ]],
      structures: [
        { code: "V1", type: "Village", row: 1, col: 1, rows: 1, cols: 1 },
        { code: "M2", type: "Mine", row: 1, col: 2, rows: 1, cols: 1 },
        { code: "F4", type: "Factory", row: 2, col: 1, rows: 1, cols: 1 },
        { code: "MP7", type: "Royal City", row: 2, col: 2, rows: 1, cols: 1 }
      ]
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-a",
        "1-2": "union-a",
        "2-1": "union-a",
        "2-2": "union-a"
      }
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);
  assert.strictEqual(summary.scoringDisplays[0].value, 700);
  assert.strictEqual(summary.scoringDisplays[0].text, "700");
  assert.strictEqual(summary.scoringDisplays[0].configured, true);
});

runTest("production-rate calculations are independent across unions and exclude unclaimed or foreign structures", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "dark-oil-production",
        calculationModelId: "structure-output-production-rate",
        configured: true,
        resourceId: "dark-oil",
        displayLabel: "Dark Oil"
      }],
      resources: [{
        resourceId: "dark-oil",
        displayName: "Dark Oil",
        unit: "units",
        metricType: "season-resource"
      }],
      structureOutputs: {
        V1: [{ resourceId: "dark-oil", value: 100 }],
        M2: [{ resourceId: "dark-oil", value: 200 }]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "V1", type: "Village", ownerId: null },
        { row: 1, col: 2, code: "V1", type: "Village", ownerId: null },
        { row: 2, col: 1, code: "M2", type: "Mine", ownerId: null }
      ]],
      structures: [
        { code: "V1", type: "Village", row: 1, col: 1, rows: 1, cols: 1 },
        { code: "V1", type: "Village", row: 1, col: 2, rows: 1, cols: 1 },
        { code: "M2", type: "Mine", row: 2, col: 1, rows: 1, cols: 1 }
      ]
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-a",
        "1-2": "union-b",
        "2-1": null
      }
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const unionASummary = service.getServerSummary({ id: "server-1", label: "Server 1", designatedUnionId: "union-a" });
  const unionBSummary = service.getServerSummary({ id: "server-1", label: "Server 1", designatedUnionId: "union-b" });

  assert.strictEqual(unionASummary.scoringDisplays[0].value, 100);
  assert.strictEqual(unionBSummary.scoringDisplays[0].value, 100);
  assert.strictEqual(unionASummary.scoringDisplays[0].text, "100");
  assert.strictEqual(unionBSummary.scoringDisplays[0].text, "100");
});

runTest("unconfigured production-rate calculations remain null", () => {
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "dark-oil-production",
        calculationModelId: "structure-output-production-rate",
        configured: false,
        resourceId: "dark-oil"
      }],
      resources: [{
        resourceId: "dark-oil",
        displayName: "Dark Oil",
        unit: "units",
        metricType: "season-resource"
      }]
    })
  });

  const summary = service.getServerSummary({ id: "server-1", label: "Server 1" });
  assert.strictEqual(summary.scoringDisplays[0].value, null);
  assert.strictEqual(summary.scoringDisplays[0].text, "Scoring rules not configured");
});

runTest("unknown model returns a null total and preserves calculation metadata", () => {
  const server = { id: "server-1", label: "Server 1" };
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "future-model-holdings",
        calculationModelId: "future-model",
        configured: true,
        resourceId: "season-currency",
        displayLabel: "Future Model",
        serverField: "futureModel",
        unconfiguredLabel: "Future model unavailable"
      }],
      resources: [{
        resourceId: "season-currency",
        displayName: "Season Currency",
        unit: "points",
        metricType: "season-resource"
      }]
    })
  });

  const summary = service.getServerSummary(server);
  assert.strictEqual(summary.scoringDisplays[0].calculationId, "future-model-holdings");
  assert.strictEqual(summary.scoringDisplays[0].calculationModelId, "future-model");
  assert.strictEqual(summary.scoringDisplays[0].resourceId, "season-currency");
  assert.strictEqual(summary.scoringDisplays[0].value, null);
  assert.strictEqual(summary.scoringDisplays[0].text, "Future model unavailable");
});

runTest("unconfigured scoring remains null and uses the configured label", () => {
  const server = {
    id: "server-1",
    label: "Server 1",
    scoring: {
      iceCrystals: 99999
    }
  };

  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationId: "season-currency-holdings",
        calculationModelId: "structure-output-holdings-total",
        configured: false,
        resourceId: "season-currency",
        displayLabel: "Season Currency",
        serverField: "iceCrystals",
        unconfiguredLabel: "Season scoring unavailable"
      }],
      resources: [{
        resourceId: "season-currency",
        displayName: "Season Currency",
        unit: "points",
        metricType: "season-resource"
      }]
    })
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.scoringDisplays[0].calculationId, "season-currency-holdings");
  assert.strictEqual(summary.scoringDisplays[0].text, "Season scoring unavailable");
  assert.strictEqual(summary.scoringDisplays[0].configured, false);
  assert.strictEqual(summary.scoringDisplays[0].value, null);
});

runTest("existing Season 1 summary behavior remains unchanged", () => {
  const server = {
    id: "server-1",
    label: "Server 1",
    scoring: {
      iceCrystals: 123456
    }
  };

  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      calculations: [{
        calculationModelId: "structure-output-holdings-total",
        configured: true,
        resourceId: "season-currency",
        displayLabel: "Season Currency",
        serverField: "iceCrystals",
        unconfiguredLabel: "Season scoring unavailable"
      }],
      resources: [{
        resourceId: "season-currency",
        displayName: "Season Currency",
        unit: "points",
        metricType: "season-resource"
      }],
      structureOutputs: {
        V1: [{ resourceId: "season-currency", value: 100 }],
        FM1: [{ resourceId: "season-currency", value: 5 }]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "V1", type: "Village", ownerId: null },
        { row: 1, col: 2, code: "FM1", type: "Frost Mine", ownerId: null }
      ]],
      structures: [
        { code: "V1", type: "Village", row: 1, col: 1, rows: 1, cols: 1 }
      ]
    },
    ownershipByServerAndKey: {
      "server-1": {
        "1-1": "union-a",
        "1-2": "union-a"
      }
    },
    designatedByServerId: {
      "server-1": "union-a"
    }
  });

  const summary = service.getServerSummary(server);

  assert.strictEqual(summary.scoringDisplays[0].text, "105");
  assert.strictEqual(summary.scoringDisplays[0].configured, true);
  assert.strictEqual(summary.scoringDisplays[0].value, 105);
  assert.strictEqual(summary.scoringDisplays[0].displayLabel, "Season Currency");
  assert.strictEqual(summary.scoringDisplays[0].metricType, "season-resource");
  assert.strictEqual(summary.scoringDisplays[0].unit, "points");
});

runTest("configured scoring counts a merged structure once and requires its full footprint", () => {
  const { service } = createSummaryServiceFixture({
    gameRulesEngine: createGameRulesEngine({
      structureOutputs: {
        T5: [{ resourceId: "ice-crystals", value: 500000 }]
      }
    }),
    mapData: {
      tiles: [[
        { row: 1, col: 1, code: "T5", type: "Town", ownerId: null },
        { row: 1, col: 2, code: "T5", type: "Town", ownerId: null }
      ]],
      structures: [
        { code: "T5", type: "Town", row: 1, col: 1, rows: 1, cols: 2 }
      ]
    },
    ownershipByServerAndKey: {
      "server-1": { "1-1": "union-a", "1-2": "union-a" },
      "server-2": { "1-1": "union-a", "1-2": "union-b" }
    },
    designatedByServerId: {
      "server-1": "union-a",
      "server-2": "union-a"
    }
  });

  assert.strictEqual(service.getServerSummary({ id: "server-1" }).scoringDisplays[0].value, 500000);
  assert.strictEqual(service.getServerSummary({ id: "server-2" }).scoringDisplays[0].value, 0);
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
    {
      unionId: "union-a",
      displayName: "Alpha Union",
      tag: "Alpha",
      aliases: [],
      defaultColor: "#AABBCC",
      presentationMetadata: {},
      registryStatus: "current"
    }
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

runTest("summary service uses canonical union fields only", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "summary-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/entry\.id/.test(source));
  assert.ok(!/entry\.shortName/.test(source));
  assert.ok(!/union\.id/.test(source));
  assert.ok(!/shortName/.test(source));
  assert.ok(!/union\.color/.test(source));
  assert.ok(/union\.unionId/.test(source));
  assert.ok(/union\.tag/.test(source));
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
