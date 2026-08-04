const assert = require("assert");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");
const { createSeasonLoader } = require("../src/services/season-loader.js");
const { SEASON_2_PACKAGE } = require("../src/seasons/season2-package.js");
const season2Servers = require("../data/season2-servers.json");

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

runTest("SEASON_2_PACKAGE validates with no errors or warnings", () => {
  const result = validateSeasonPackage(SEASON_2_PACKAGE);
  const seasonIdentity = SEASON_2_PACKAGE.rulesDefinition.seasonIdentity;

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(seasonIdentity, "kingdomNumber"), false);
});

runTest("Season 2 topology, dimensions, catalogue, and expected node count are correct", () => {
  const mapDefinition = SEASON_2_PACKAGE.rulesDefinition.mapDefinition;
  assert.strictEqual(mapDefinition.topologyType, "strategic_node_network");
  assert.deepStrictEqual(mapDefinition.dimensions, { rows: 12, columns: 12 });
  assert.strictEqual(mapDefinition.baseMapId, "season2-strategic-node-network");

  const catalog = SEASON_2_PACKAGE.rulesDefinition.structureCatalog;
  const expectedEntries = [
    { code: "V1", type: "Village", level: 1, expectedCount: 40 },
    { code: "M2", type: "Mine", level: 2, expectedCount: 32 },
    { code: "MN3", type: "Manor", level: 3, expectedCount: 24 },
    { code: "F4", type: "Factory", level: 4, expectedCount: 16 },
    { code: "T5", type: "Town", level: 5, expectedCount: 8 },
    { code: "TC1", type: "Trade Centre", level: 1, expectedCount: 4 },
    { code: "TC2", type: "Trade Centre", level: 2, expectedCount: 4 },
    { code: "TC3", type: "Trade Centre", level: 3, expectedCount: 4 },
    { code: "TC4", type: "Trade Centre", level: 4, expectedCount: 4 },
    { code: "TC5", type: "Trade Centre", level: 5, expectedCount: 4 },
    { code: "BG6", type: "Building Guild", level: 6, expectedCount: 1 },
    { code: "MP6", type: "Metropolis", level: 6, expectedCount: 3 },
    { code: "MP7", type: "Metropolis", level: 7, expectedCount: 1 }
  ];

  const actualEntries = catalog.map((entry) => ({
    code: entry.code,
    type: entry.type,
    level: entry.level,
    expectedCount: entry.expectedCount
  }));

  assert.deepStrictEqual(actualEntries, expectedEntries);
  assert.strictEqual(catalog.reduce((sum, entry) => sum + entry.expectedCount, 0), 145);
});

runTest("resources appear in the required order and no outputs are fabricated", () => {
  const resources = SEASON_2_PACKAGE.rulesDefinition.resourceModel.resources;
  assert.deepStrictEqual(resources, [
    {
      resourceId: "red-copper",
      displayName: "Red Copper",
      unit: "units",
      metricType: "season-resource"
    },
    {
      resourceId: "holy-water",
      displayName: "Holy Water",
      unit: "units",
      metricType: "season-resource"
    }
  ]);

  assert.deepStrictEqual(SEASON_2_PACKAGE.rulesDefinition.resourceModel.structureOutputs, {});
  const outputs = SEASON_2_PACKAGE.rulesDefinition.resourceModel.structureOutputs;
  assert.strictEqual(Object.keys(outputs).length, 0);
  assert.strictEqual(Object.values(outputs).every((entries) => entries.length === 0), true);
});

runTest("both calculations are unconfigured and independently identified", () => {
  const calculations = SEASON_2_PACKAGE.rulesDefinition.scoringModel.calculations;
  assert.strictEqual(calculations.length, 2);
  assert.deepStrictEqual(calculations.map((entry) => entry.resourceId), ["red-copper", "holy-water"]);
  assert.deepStrictEqual(calculations.map((entry) => entry.configured), [false, false]);
  assert.deepStrictEqual(calculations.map((entry) => entry.calculationId), ["red-copper-holdings", "holy-water-holdings"]);
  assert.deepStrictEqual(calculations.map((entry) => entry.displayLabel), ["Red Copper", "Holy Water"]);
  assert.deepStrictEqual(calculations.map((entry) => entry.calculationModelId), ["structure-output-holdings-total", "structure-output-holdings-total"]);
  assert.deepStrictEqual(calculations.map((entry) => Object.prototype.hasOwnProperty.call(entry, "serverField")), [false, false]);
});

runTest("loader can load the package without mutating it", async () => {
  const loader = createSeasonLoader({
    resolvePackage: async (seasonId) => {
      assert.strictEqual(seasonId, "season-2");
      return SEASON_2_PACKAGE;
    },
    validateSeasonPackage
  });

  const snapshotBefore = JSON.stringify(SEASON_2_PACKAGE);
  const loaded = await loader.load("season-2");
  const snapshotAfter = JSON.stringify(SEASON_2_PACKAGE);

  assert.strictEqual(loaded, SEASON_2_PACKAGE);
  assert.strictEqual(snapshotAfter, snapshotBefore);
});

runTest("season 2 server-state data contains no invented servers", () => {
  assert.strictEqual(season2Servers.seasonId, "season-2");
  assert.strictEqual(season2Servers.baseMapId, "season2-strategic-node-network");
  assert.deepStrictEqual(season2Servers.servers, []);
});
