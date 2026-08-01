const assert = require("assert");
const { createGameRulesEngine } = require("../src/services/game-rules-engine.js");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

const engine = createGameRulesEngine({
  seasonIdentity: {
    seasonId: "season-1",
    seasonName: "Season 1",
    kingdomNumber: 1
  },
  metadata: {
    timelineModel: "seasonal"
  },
  mapDefinition: {
    baseMapId: "season1-map"
  },
  structureCatalog: [
    { structureTypeId: "structure-type-v1", code: "V1", type: "Village", level: 1, capturable: true },
    { structureTypeId: "structure-type-fm1", code: "FM1", type: "Frost Mine", level: 1, capturable: true }
  ],
  resourceModel: {
    resources: [
      { resourceId: "ice-crystals", displayName: "Ice Crystals", unit: "crystals", metricType: "season-resource" },
      { resourceId: "holy-water", displayName: "Holy Water", unit: "vials", metricType: "season-resource" }
    ],
    structureOutputs: {
      V1: [
        { resourceId: "ice-crystals", value: 100 },
        { resourceId: "holy-water", value: 2 }
      ],
      FM1: [
        { resourceId: "ice-crystals", value: 5 }
      ]
    }
  },
  scoringModel: {
    calculations: [
      {
        calculationId: "ice-crystal-holdings",
        calculationModelId: "structure-output-holdings-total",
        resourceId: "ice-crystals",
        configured: true,
        displayLabel: "Ice Crystals",
        serverField: "iceCrystals",
        unconfiguredLabel: "Scoring rules not configured"
      },
      {
        calculationId: "holy-water-holdings",
        calculationModelId: "structure-output-holdings-total",
        resourceId: "holy-water",
        configured: false,
        displayLabel: "Holy Water",
        serverField: "holyWater",
        unconfiguredLabel: "Not configured"
      }
    ]
  },
  phaseModel: [],
  structureUnlocks: { V1: true, FM1: true },
  captureRules: { defaultCapturable: true, byCode: {}, byType: {}, phaseRestrictions: [] },
  buffDefinitions: []
});

test("lists resources in declaration order", () => {
  assert.deepStrictEqual(engine.listResources(), [
    { resourceId: "ice-crystals", displayName: "Ice Crystals", unit: "crystals", metricType: "season-resource" },
    { resourceId: "holy-water", displayName: "Holy Water", unit: "vials", metricType: "season-resource" }
  ]);
});

test("resource lookups return safe copies", () => {
  const resource = engine.getResource("ice-crystals");
  assert.deepStrictEqual(resource, {
    resourceId: "ice-crystals",
    displayName: "Ice Crystals",
    unit: "crystals",
    metricType: "season-resource"
  });
  resource.displayName = "Changed";
  assert.strictEqual(engine.getResource("ice-crystals").displayName, "Ice Crystals");
  assert.strictEqual(engine.getResource("missing"), null);
});

test("lists scoring calculations in declaration order", () => {
  assert.deepStrictEqual(engine.listScoringCalculations(), [
    {
      calculationId: "ice-crystal-holdings",
      calculationModelId: "structure-output-holdings-total",
      resourceId: "ice-crystals",
      configured: true,
      displayLabel: "Ice Crystals",
      serverField: "iceCrystals",
      unconfiguredLabel: "Scoring rules not configured"
    },
    {
      calculationId: "holy-water-holdings",
      calculationModelId: "structure-output-holdings-total",
      resourceId: "holy-water",
      configured: false,
      displayLabel: "Holy Water",
      serverField: "holyWater",
      unconfiguredLabel: "Not configured"
    }
  ]);
});

test("supports multiple calculations that share a model id", () => {
  const first = engine.getScoringCalculation("ice-crystal-holdings");
  const second = engine.getScoringCalculation("holy-water-holdings");

  assert.deepStrictEqual(first, {
    calculationId: "ice-crystal-holdings",
    calculationModelId: "structure-output-holdings-total",
    resourceId: "ice-crystals",
    configured: true,
    displayLabel: "Ice Crystals",
    serverField: "iceCrystals",
    unconfiguredLabel: "Scoring rules not configured"
  });
  assert.deepStrictEqual(second, {
    calculationId: "holy-water-holdings",
    calculationModelId: "structure-output-holdings-total",
    resourceId: "holy-water",
    configured: false,
    displayLabel: "Holy Water",
    serverField: "holyWater",
    unconfiguredLabel: "Not configured"
  });
  assert.strictEqual(first.calculationModelId, second.calculationModelId);
  assert.notStrictEqual(first.resourceId, second.resourceId);
});

test("scoring calculation lookup returns safe copies", () => {
  const calculation = engine.getScoringCalculation("ice-crystal-holdings");
  assert.deepStrictEqual(calculation, {
    calculationId: "ice-crystal-holdings",
    calculationModelId: "structure-output-holdings-total",
    resourceId: "ice-crystals",
    configured: true,
    displayLabel: "Ice Crystals",
    serverField: "iceCrystals",
    unconfiguredLabel: "Scoring rules not configured"
  });
  calculation.displayLabel = "Changed";
  assert.strictEqual(engine.getScoringCalculation("ice-crystal-holdings").displayLabel, "Ice Crystals");
  assert.strictEqual(engine.getScoringCalculation("missing"), null);
  assert.strictEqual(engine.getScoringCalculation("structure-output-holdings-total"), null);
});

test("structure resource profiles preserve output order and copy data", () => {
  const profile = engine.getStructureResourceProfile("V1");
  assert.deepStrictEqual(profile, [
    { resourceId: "ice-crystals", displayName: "Ice Crystals", unit: "crystals", metricType: "season-resource", value: 100 },
    { resourceId: "holy-water", displayName: "Holy Water", unit: "vials", metricType: "season-resource", value: 2 }
  ]);
  profile[0].value = 999;
  assert.strictEqual(engine.getStructureResourceProfile("V1")[0].value, 100);
  assert.deepStrictEqual(engine.getStructureResourceProfile("missing"), null);
});

test("structure and capture helpers still work", () => {
  assert.strictEqual(engine.isStructureUnlocked("V1"), true);
  assert.strictEqual(engine.canCaptureStructure("V1"), true);
  assert.strictEqual(engine.canCaptureStructure("missing"), false);
});
