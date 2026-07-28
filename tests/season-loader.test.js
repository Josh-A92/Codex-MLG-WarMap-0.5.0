const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createSeasonLoader, SeasonPackageLoadError } = require("../src/services/season-loader.js");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");

function createCanonicalPackage() {
  return {
    packageIdentity: {
      schemaVersion: 1,
      packageVersion: "1.0.0",
      seasonId: "season-1",
      displayName: "Season 1",
      description: "Season 1 canonical package example",
      seasonStatus: "active",
      startDate: "2026-07-01T00:00:00Z",
      endDate: null
    },
    rulesDefinition: {
      seasonIdentity: {
        seasonId: "season-1",
        seasonName: "Season 1",
        kingdomNumber: 1
      },
      metadata: {
        timelineModel: "seasonal"
      },
      mapDefinition: {
        baseMapId: "season1-map",
        dimensions: {
          rows: 20,
          columns: 20
        },
        mapDataContract: {
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
        },
        cellClassification: {
          capturable: true,
          blockedCellRefs: [],
          decorativeCellRefs: [],
          nonPlayableCellRefs: []
        },
        structureFootprints: {},
        mapDataRef: "data/season1-map.json"
      },
      structureCatalog: [
        {
          structureTypeId: "structure-type-v1",
          code: "V1",
          type: "Village",
          level: 1,
          capturable: true
        }
      ],
      resourceModel: {
        resourceId: "ice-crystals",
        displayName: "Ice Crystals",
        unit: "crystals",
        metricType: "season-resource",
        structureOutputs: {}
      },
      scoringModel: {
        calculationModelId: "season1-scoring-model",
        configured: false,
        resourceLabel: "Ice Crystals",
        serverField: "iceCrystals",
        unconfiguredLabel: "Scoring rules not configured"
      },
      phaseModel: [
        {
          id: "phase-1",
          label: "Interactive Map",
          status: "completed"
        }
      ],
      structureUnlocks: {
        V1: true
      },
      captureRules: {
        defaultCapturable: true,
        byCode: {},
        byType: {},
        phaseRestrictions: []
      },
      buffDefinitions: []
    },
    applicationConfig: {
      dataSources: {
        mapDataUrl: "data/season1-map.json",
        seasonServerStateDataUrl: "data/season1-servers.json",
        unionsDataUrl: "data/unions.json"
      },
      workspace: {
        homeId: "command-centre",
        mapLabel: "Season 1 Blueprint"
      }
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createValidatingLoader(resolver) {
  return createSeasonLoader({
    resolvePackage: resolver,
    validateSeasonPackage
  });
}

function assertLoadError(error, code, seasonId) {
  assert.ok(error instanceof SeasonPackageLoadError, "Expected SeasonPackageLoadError");
  assert.strictEqual(error.name, "SeasonPackageLoadError");
  assert.strictEqual(error.code, code);
  assert.strictEqual(error.seasonId, seasonId);
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

runTest("valid canonical package loads successfully", async () => {
  const candidate = createCanonicalPackage();
  const loader = createValidatingLoader(() => candidate);

  const loaded = await loader.load("season-1");

  assert.strictEqual(loaded, candidate);
  assert.deepStrictEqual(loaded, candidate);
});

runTest("asynchronous resolver works", async () => {
  const candidate = createCanonicalPackage();
  const loader = createValidatingLoader(async (seasonId) => {
    assert.strictEqual(seasonId, "season-1");
    return candidate;
  });

  const loaded = await loader.load("season-1");

  assert.strictEqual(loaded, candidate);
});

runTest("empty season ID fails", async () => {
  const loader = createValidatingLoader(() => createCanonicalPackage());

  await assert.rejects(
    () => loader.load("   "),
    (error) => {
      assertLoadError(error, "INVALID_SEASON_ID", "   ");
      return true;
    }
  );
});

runTest("missing resolver dependency fails", () => {
  assert.throws(() => createSeasonLoader({ validateSeasonPackage }), TypeError);
});

runTest("missing validator dependency fails", () => {
  assert.throws(() => createSeasonLoader({ resolvePackage: () => null }), TypeError);
});

runTest("package not found", async () => {
  const loader = createValidatingLoader(() => undefined);

  await assert.rejects(
    () => loader.load("season-1"),
    (error) => {
      assertLoadError(error, "PACKAGE_NOT_FOUND", "season-1");
      return true;
    }
  );
});

runTest("resolver exception is wrapped with cause", async () => {
  const cause = new Error("resolver boom");
  const loader = createValidatingLoader(() => {
    throw cause;
  });

  await assert.rejects(
    () => loader.load("season-1"),
    (error) => {
      assertLoadError(error, "PACKAGE_RESOLUTION_FAILED", "season-1");
      assert.strictEqual(error.cause, cause);
      return true;
    }
  );
});

runTest("invalid package exposes validator errors and warnings", async () => {
  const validationResult = {
    valid: false,
    errors: [{ code: "BAD_PACKAGE", path: "packageIdentity.seasonId", message: "bad" }],
    warnings: [{ code: "WEAK_WARNING", path: "rulesDefinition", message: "warn" }]
  };
  const loader = createSeasonLoader({
    resolvePackage: () => createCanonicalPackage(),
    validateSeasonPackage: () => validationResult
  });

  await assert.rejects(
    () => loader.load("season-1"),
    (error) => {
      assertLoadError(error, "PACKAGE_VALIDATION_FAILED", "season-1");
      assert.deepStrictEqual(error.errors, validationResult.errors);
      assert.deepStrictEqual(error.warnings, validationResult.warnings);
      return true;
    }
  );
});

runTest("requested and packaged season IDs do not match", async () => {
  const candidate = createCanonicalPackage();
  candidate.packageIdentity.seasonId = "season-2";
  candidate.rulesDefinition.seasonIdentity.seasonId = "season-2";
  const loader = createValidatingLoader(() => candidate);

  await assert.rejects(
    () => loader.load("season-1"),
    (error) => {
      assertLoadError(error, "SEASON_ID_MISMATCH", "season-1");
      return true;
    }
  );
});

runTest("candidate remains unchanged", async () => {
  const candidate = createCanonicalPackage();
  const before = clone(candidate);
  const loader = createValidatingLoader(() => candidate);

  const loaded = await loader.load("season-1");

  assert.strictEqual(loaded, candidate);
  assert.deepStrictEqual(candidate, before);
});

runTest("loader contains no built-in Season 1 assumptions", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "season-loader.js"), "utf8");

  assert.ok(!/SEASON_1_DEFINITION/.test(source));
  assert.ok(!/season1/i.test(source));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}