const assert = require("assert");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");
const { createSeasonLoader } = require("../src/services/season-loader.js");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");

const EXPECTED_STRUCTURES = [
  { code: "V1", type: "Village", level: 1 },
  { code: "FM1", type: "Frost Mine", level: 1 },
  { code: "FM2", type: "Frost Mine", level: 2 },
  { code: "FM3", type: "Frost Mine", level: 3 },
  { code: "FM4", type: "Frost Mine", level: 4 },
  { code: "FM5", type: "Frost Mine", level: 5 },
  { code: "FM6", type: "Frost Mine", level: 6 },
  { code: "FM7", type: "Frost Mine", level: 7 },
  { code: "FM8", type: "Frost Mine", level: 8 },
  { code: "FM9", type: "Frost Mine", level: 9 },
  { code: "FM10", type: "Frost Mine", level: 10 },
  { code: "C2", type: "City", level: 2 },
  { code: "MN3", type: "Manor", level: 3 },
  { code: "F4", type: "Factory", level: 4 },
  { code: "T5", type: "Town", level: 5 },
  { code: "MP6", type: "Metropolis", level: 6 },
  { code: "RC7", type: "Royal City", level: 7 }
];

const EXPECTED_UNLOCKS = {
  V1: true,
  FM1: true,
  FM2: true,
  FM3: true,
  FM4: true,
  FM5: true,
  FM6: true,
  FM7: true,
  FM8: true,
  FM9: true,
  FM10: true,
  C2: true,
  MN3: true,
  F4: true,
  T5: true,
  MP6: true,
  RC7: true
};

const EXPECTED_PHASES = [
  { id: "phase-1", label: "Interactive Map", status: "completed" },
  { id: "phase-2", label: "Camera", status: "completed" },
  { id: "phase-2-5", label: "Command Centre and Server Workspaces", status: "completed" },
  { id: "phase-3", label: "Territory Ownership", status: "partial" }
];

const EXPECTED_STRUCTURE_FACTS = {
  V1: { expectedCount: 24, firstCaptureReward: 10, unlockWeek: 1, iceCrystalValue: 100000 },
  FM1: { expectedCount: 52, firstCaptureReward: 5, iceCrystalValue: 5000 },
  FM2: { expectedCount: 68, firstCaptureReward: 10, iceCrystalValue: 10000 },
  FM3: { expectedCount: 28, firstCaptureReward: 15, iceCrystalValue: 15000 },
  FM4: { expectedCount: 52, firstCaptureReward: 20, iceCrystalValue: 20000 },
  FM5: { expectedCount: 26, firstCaptureReward: 25, iceCrystalValue: 25000 },
  FM6: { expectedCount: 32, firstCaptureReward: 30, iceCrystalValue: 30000 },
  FM7: { expectedCount: 16, firstCaptureReward: 35, iceCrystalValue: 35000 },
  FM8: { expectedCount: 12, firstCaptureReward: 40, iceCrystalValue: 40000 },
  FM9: { expectedCount: 14, firstCaptureReward: 45, iceCrystalValue: 45000 },
  FM10: { expectedCount: 8, firstCaptureReward: 50, iceCrystalValue: 50000 },
  C2: { expectedCount: 20, firstCaptureReward: 20, unlockWeek: 1, iceCrystalValue: 200000 },
  MN3: { expectedCount: 15, firstCaptureReward: 30, unlockWeek: 2, iceCrystalValue: 300000 },
  F4: { expectedCount: 12, firstCaptureReward: 40, unlockWeek: 2, iceCrystalValue: 400000 },
  T5: { expectedCount: 4, firstCaptureReward: 50, unlockWeek: 3, iceCrystalValue: 500000 },
  MP6: { expectedCount: 4, firstCaptureReward: 60, unlockWeek: 3, iceCrystalValue: 1000000 },
  RC7: { expectedCount: 1, firstCaptureReward: 200, unlockWeek: 4, iceCrystalValue: 0 }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runTest(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      process.stdout.write(`PASS ${name}\n`);
    })
    .catch((error) => {
      process.stderr.write(`FAIL ${name}\n`);
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

runTest("SEASON_1_PACKAGE validates with no errors", () => {
  const result = validateSeasonPackage(SEASON_1_PACKAGE);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("SEASON_1_PACKAGE explicitly uses territory_grid topology", () => {
  assert.strictEqual(SEASON_1_PACKAGE.rulesDefinition.mapDefinition.topologyType, "territory_grid");
});

runTest("createSeasonLoader resolves and loads season-1 package object", async () => {
  const loader = createSeasonLoader({
    resolvePackage: async (seasonId) => {
      assert.strictEqual(seasonId, "season-1");
      return SEASON_1_PACKAGE;
    },
    validateSeasonPackage
  });

  const loaded = await loader.load("season-1");

  assert.strictEqual(loaded, SEASON_1_PACKAGE);
});

runTest("structure catalog and unlocks preserve all current entries", () => {
  const entries = SEASON_1_PACKAGE.rulesDefinition.structureCatalog;
  const actualStructureTriples = entries.map((entry) => ({
    code: entry.code,
    type: entry.type,
    level: entry.level
  }));

  assert.deepStrictEqual(actualStructureTriples, EXPECTED_STRUCTURES);
  assert.deepStrictEqual(SEASON_1_PACKAGE.rulesDefinition.structureUnlocks, EXPECTED_UNLOCKS);

  const typeIds = entries.map((entry) => entry.structureTypeId);
  assert.strictEqual(new Set(typeIds).size, typeIds.length);

  entries.forEach((entry) => {
    assert.strictEqual(entry.structureTypeId, `structure-type-${entry.code.toLowerCase()}`);
    assert.strictEqual(entry.capturable, true);
    assert.strictEqual(entry.expectedCount, EXPECTED_STRUCTURE_FACTS[entry.code].expectedCount);
    assert.strictEqual(entry.firstCaptureReward, EXPECTED_STRUCTURE_FACTS[entry.code].firstCaptureReward);
    if (Object.prototype.hasOwnProperty.call(EXPECTED_STRUCTURE_FACTS[entry.code], "unlockWeek")) {
      assert.strictEqual(entry.unlockWeek, EXPECTED_STRUCTURE_FACTS[entry.code].unlockWeek);
    } else {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(entry, "unlockWeek"), false);
    }
  });
});

runTest("Season 1 structure values are explicit and Royal City scores zero", () => {
  const outputs = SEASON_1_PACKAGE.rulesDefinition.resourceModel.structureOutputs;
  Object.entries(EXPECTED_STRUCTURE_FACTS).forEach(([code, fact]) => {
    assert.deepStrictEqual(outputs[code], {
      resourceId: "ice-crystals",
      value: fact.iceCrystalValue,
      unit: "crystals"
    });
  });
  assert.strictEqual(outputs.RC7.value, 0);
});

runTest("data URLs, workspace, phases, capture rules, and scoring labels are preserved", () => {
  assert.strictEqual(SEASON_1_PACKAGE.applicationConfig.designatedUnionId, "union-0001");

  assert.deepStrictEqual(SEASON_1_PACKAGE.applicationConfig.dataSources, {
    mapDataUrl: "data/season1-map.json",
    seasonServerStateDataUrl: "data/season1-servers.json",
    unionsDataUrl: "data/unions.json"
  });
  assert.deepStrictEqual(SEASON_1_PACKAGE.applicationConfig.workspace, {
    homeId: "command-centre",
    mapLabel: "Season 1 Blueprint"
  });

  assert.deepStrictEqual(SEASON_1_PACKAGE.rulesDefinition.phaseModel, EXPECTED_PHASES);
  assert.deepStrictEqual(SEASON_1_PACKAGE.rulesDefinition.captureRules, {
    defaultCapturable: true,
    byCode: {},
    byType: {},
    phaseRestrictions: []
  });

  assert.deepStrictEqual(SEASON_1_PACKAGE.rulesDefinition.resourceModel, {
    resourceId: "ice-crystals",
    displayName: "Ice Crystals",
    unit: "crystals",
    metricType: "season-resource",
    structureOutputs: Object.fromEntries(Object.entries(EXPECTED_STRUCTURE_FACTS).map(([code, fact]) => [
      code,
      { resourceId: "ice-crystals", value: fact.iceCrystalValue, unit: "crystals" }
    ]))
  });
  assert.deepStrictEqual(SEASON_1_PACKAGE.rulesDefinition.scoringModel, {
    calculationModelId: "season1-scoring-model",
    configured: true,
    resourceLabel: "Ice Crystals",
    serverField: "iceCrystals",
    unconfiguredLabel: "Scoring rules not configured"
  });
});

runTest("package shape is canonical nested and excludes legacy fields", () => {
  const topLevelKeys = Object.keys(SEASON_1_PACKAGE).sort();
  assert.deepStrictEqual(topLevelKeys, ["applicationConfig", "externalRegistries", "packageIdentity", "rulesDefinition"]);

  const mapDefinition = SEASON_1_PACKAGE.rulesDefinition.mapDefinition;
  assert.strictEqual(mapDefinition.topologyType, "territory_grid");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(SEASON_1_PACKAGE, "appConfig"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(mapDefinition, "gridSize"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(SEASON_1_PACKAGE.rulesDefinition.resourceModel, "primaryResource"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(SEASON_1_PACKAGE.rulesDefinition.scoringModel, "territoryRule"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(SEASON_1_PACKAGE.rulesDefinition.scoringModel, "structureRule"), false);

  assert.deepStrictEqual(mapDefinition.mapDataContract, {
    cells: {
      collectionField: "tiles",
      collectionShape: "row_arrays",
      identity: {
        mode: "coordinates",
        rowField: "row",
        columnField: "col"
      },
      structureTypeRefField: "code"
    },
    structures: {
      collectionField: "structures",
      idField: "id",
      typeRefField: "code",
      footprint: {
        mode: "rectangle",
        rowField: "row",
        columnField: "col",
        rowSpanField: "rows",
        columnSpanField: "cols"
      }
    }
  });
});

runTest("validation and loading do not mutate the package", async () => {
  const beforeValidation = clone(SEASON_1_PACKAGE);
  const validationResult = validateSeasonPackage(SEASON_1_PACKAGE);

  assert.strictEqual(validationResult.valid, true);
  assert.deepStrictEqual(SEASON_1_PACKAGE, beforeValidation);

  const loader = createSeasonLoader({
    resolvePackage: () => SEASON_1_PACKAGE,
    validateSeasonPackage
  });

  const beforeLoad = clone(SEASON_1_PACKAGE);
  const loaded = await loader.load("season-1");

  assert.strictEqual(loaded, SEASON_1_PACKAGE);
  assert.deepStrictEqual(SEASON_1_PACKAGE, beforeLoad);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
