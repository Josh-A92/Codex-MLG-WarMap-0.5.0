const assert = require("assert");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");

function createMinimalValidPackage() {
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

function assertError(result, code, path) {
  assert.ok(result.errors.some((error) => error.code === code && error.path === path), `Expected ${code} at ${path}`);
}

function runTest(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

runTest("existing canonical minimal example remains valid", () => {
  const candidate = createMinimalValidPackage();
  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("valid Season 1 source contract shown above", () => {
  const candidate = createMinimalValidPackage();
  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("valid field-based cell identity", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.collectionShape = "flat_array";
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.identity = {
    mode: "field",
    idField: "cellId"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("valid coordinate-based cell identity", () => {
  const candidate = createMinimalValidPackage();

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("valid cell-reference footprint", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.structures.footprint = {
    mode: "cell_refs",
    cellRefsField: "footprintCellIds"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("valid rectangle footprint", () => {
  const candidate = createMinimalValidPackage();

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("missing required structure code", () => {
  const candidate = createMinimalValidPackage();
  delete candidate.rulesDefinition.structureCatalog[0].code;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "rulesDefinition.structureCatalog[0].code");
});

runTest("valid Season 1 source contract appears in documentation and tests", () => {
  const candidate = createMinimalValidPackage();

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("missing required top-level section", () => {
  const candidate = createMinimalValidPackage();
  delete candidate.applicationConfig;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "applicationConfig");
});

runTest("unsupported schema version", () => {
  const candidate = createMinimalValidPackage();
  candidate.packageIdentity.schemaVersion = 2;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNSUPPORTED_SCHEMA_VERSION", "packageIdentity.schemaVersion");
});

runTest("invalid season status", () => {
  const candidate = createMinimalValidPackage();
  candidate.packageIdentity.seasonStatus = "broken";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_SEASON_STATUS", "packageIdentity.seasonStatus");
});

runTest("mismatched season ids", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.seasonIdentity.seasonId = "season-2";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISMATCHED_SEASON_ID", "rulesDefinition.seasonIdentity.seasonId");
});

runTest("missing application-config field", () => {
  const candidate = createMinimalValidPackage();
  delete candidate.applicationConfig.dataSources.mapDataUrl;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "applicationConfig.dataSources.mapDataUrl");
});

runTest("valid configured designated union id", () => {
  const candidate = createMinimalValidPackage();
  candidate.applicationConfig.designatedUnionId = "union-0001";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("omitted designated union id remains valid", () => {
  const candidate = createMinimalValidPackage();

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("present undefined designated union id is rejected", () => {
  const candidate = createMinimalValidPackage();
  candidate.applicationConfig.designatedUnionId = undefined;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "applicationConfig.designatedUnionId");
});

runTest("empty designated union id is rejected", () => {
  const candidate = createMinimalValidPackage();
  candidate.applicationConfig.designatedUnionId = "";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "applicationConfig.designatedUnionId");
});

runTest("whitespace-only designated union id is rejected", () => {
  const candidate = createMinimalValidPackage();
  candidate.applicationConfig.designatedUnionId = "   \t   ";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "applicationConfig.designatedUnionId");
});

runTest("non-string designated union id is rejected", () => {
  const candidate = createMinimalValidPackage();
  candidate.applicationConfig.designatedUnionId = 1001;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "applicationConfig.designatedUnionId");
});

runTest("unknown applicationConfig field is rejected", () => {
  const candidate = createMinimalValidPackage();
  candidate.applicationConfig.unknownField = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "applicationConfig.unknownField");
});

runTest("invalid map dimensions", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.dimensions.rows = 0;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_INTEGER", "rulesDefinition.mapDefinition.dimensions.rows");
});

runTest("invalid collection shape", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.collectionShape = "nested_objects";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_COLLECTION_SHAPE", "rulesDefinition.mapDefinition.mapDataContract.cells.collectionShape");
});

runTest("unknown identity mode", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.identity.mode = "hybrid";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_IDENTITY_MODE", "rulesDefinition.mapDefinition.mapDataContract.cells.identity.mode");
});

runTest("missing mode-specific identity field", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.identity = {
    mode: "coordinates",
    rowField: "row"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.mapDataContract.cells.identity.columnField");
});

runTest("field from the wrong identity mode", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.identity = {
    mode: "field",
    idField: "cellId",
    rowField: "row"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "FIELD_NOT_ALLOWED_FOR_MODE", "rulesDefinition.mapDefinition.mapDataContract.cells.identity.rowField");
});

runTest("unknown footprint mode", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.structures.footprint.mode = "polygon";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FOOTPRINT_MODE", "rulesDefinition.mapDefinition.mapDataContract.structures.footprint.mode");
});

runTest("missing mode-specific footprint field", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.structures.footprint = {
    mode: "rectangle",
    rowField: "row",
    columnField: "col",
    rowSpanField: "rows"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.mapDataContract.structures.footprint.columnSpanField");
});

runTest("field from the wrong footprint mode", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.structures.footprint = {
    mode: "cell_refs",
    cellRefsField: "footprintCellIds",
    rowField: "row"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "FIELD_NOT_ALLOWED_FOR_MODE", "rulesDefinition.mapDefinition.mapDataContract.structures.footprint.rowField");
});

runTest("unknown nested contract field", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract.cells.unexpected = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.mapDataContract.cells.unexpected");
});

runTest("flat map contract is rejected with unknown-field errors", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.mapDefinition.mapDataContract = {
    cellIdField: "cellId",
    structureIdField: "structureId",
    structureTypeRefField: "structureTypeRef",
    footprintCellIdsField: "footprintCellIds"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.mapDataContract.cellIdField");
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.mapDataContract.structureIdField");
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.mapDataContract.structureTypeRefField");
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.mapDataContract.footprintCellIdsField");
});

runTest("duplicate structure-type id", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureCatalog.push({
    structureTypeId: "structure-type-v1",
    code: "V2",
    type: "Village II",
    level: 2,
    capturable: false
  });

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_IDENTIFIER", "rulesDefinition.structureCatalog[1].structureTypeId");
});

runTest("duplicate structure code", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureCatalog.push({
    structureTypeId: "structure-type-v2",
    code: "V1",
    type: "Village II",
    level: 2,
    capturable: false
  });

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_IDENTIFIER", "rulesDefinition.structureCatalog[1].code");
});

runTest("valid optional phase fields", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.phaseModel[0] = {
    id: "phase-1",
    label: "Interactive Map",
    status: "completed",
    activationMode: "manual",
    startAt: "2026-07-01T00:00:00Z",
    endAt: null,
    notes: "Optional phase notes"
  };

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("invalid phase activation mode", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.phaseModel[0].activationMode = "automatic";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_PHASE_ACTIVATION_MODE", "rulesDefinition.phaseModel[0].activationMode");
});

runTest("invalid phase timestamp", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.phaseModel[0].startAt = "not-a-timestamp";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_TIMESTAMP", "rulesDefinition.phaseModel[0].startAt");
});

runTest("phase end before start", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.phaseModel[0].startAt = "2026-07-02T00:00:00Z";
  candidate.rulesDefinition.phaseModel[0].endAt = "2026-07-01T00:00:00Z";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_DATE_ORDER", "rulesDefinition.phaseModel[0].endAt");
});

runTest("unknown phase field", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.phaseModel[0].unexpectedField = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.phaseModel[0].unexpectedField");
});

runTest("invalid optional catalogue-field type", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureCatalog[0].categories = "villages";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_ARRAY", "rulesDefinition.structureCatalog[0].categories");
});

runTest("catalogue count, reward, and unlock fields use strict integer rules", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureCatalog[0].expectedCount = 0;
  candidate.rulesDefinition.structureCatalog[0].firstCaptureReward = -1;
  candidate.rulesDefinition.structureCatalog[0].unlockWeek = 1.5;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_INTEGER", "rulesDefinition.structureCatalog[0].expectedCount");
  assertError(result, "INVALID_INTEGER", "rulesDefinition.structureCatalog[0].firstCaptureReward");
  assertError(result, "INVALID_INTEGER", "rulesDefinition.structureCatalog[0].unlockWeek");
});

runTest("catalogue permits zero first-capture reward", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureCatalog[0].expectedCount = 1;
  candidate.rulesDefinition.structureCatalog[0].firstCaptureReward = 0;
  candidate.rulesDefinition.structureCatalog[0].unlockWeek = 1;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
});

runTest("catalogue entry containing structureTypeRef", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureCatalog[0].structureTypeRef = "structure-type-v1";

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "rulesDefinition.structureCatalog[0].structureTypeRef");
});

runTest("unlock referencing an unknown structure", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.structureUnlocks.UNKNOWN = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNRESOLVED_UNLOCK_REFERENCE", "rulesDefinition.structureUnlocks.UNKNOWN");
});

runTest("invalid capture override reference", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.captureRules.byCode.UNKNOWN = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNRESOLVED_CAPTURE_OVERRIDE_REFERENCE", "rulesDefinition.captureRules.byCode.UNKNOWN");
});

runTest("duplicate phase id", () => {
  const candidate = createMinimalValidPackage();
  candidate.rulesDefinition.phaseModel.push({
    id: "phase-1",
    label: "Second Phase",
    status: "planned"
  });

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_IDENTIFIER", "rulesDefinition.phaseModel[1].id");
});

runTest("duplicate external-registry id", () => {
  const candidate = createMinimalValidPackage();
  candidate.externalRegistries = [
    {
      registryId: "union-registry",
      registryType: "union-registry",
      sourceRef: "data/unions.json",
      required: true
    },
    {
      registryId: "union-registry",
      registryType: "union-registry",
      sourceRef: "data/unions-copy.json",
      required: false
    }
  ];

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_IDENTIFIER", "externalRegistries[1].registryId");
});

runTest("unknown top-level field", () => {
  const candidate = createMinimalValidPackage();
  candidate.unexpectedTopLevel = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "unexpectedTopLevel");
});

runTest("candidate remains unchanged after validation", () => {
  const candidate = createMinimalValidPackage();
  const before = clone(candidate);

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(candidate, before);
});

runTest("multiple independent errors returned together", () => {
  const candidate = createMinimalValidPackage();
  delete candidate.applicationConfig.dataSources.mapDataUrl;
  candidate.packageIdentity.seasonStatus = "invalid-status";
  candidate.rulesDefinition.mapDefinition.dimensions.rows = 0;
  candidate.rulesDefinition.structureCatalog.push({
    structureTypeId: "structure-type-v1",
    code: "V1",
    type: "Village II",
    level: 2,
    capturable: false,
    structureTypeRef: "structure-type-v2"
  });
  candidate.unexpectedTopLevel = true;

  const result = validateSeasonPackage(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "applicationConfig.dataSources.mapDataUrl");
  assertError(result, "INVALID_SEASON_STATUS", "packageIdentity.seasonStatus");
  assertError(result, "INVALID_INTEGER", "rulesDefinition.mapDefinition.dimensions.rows");
  assertError(result, "DUPLICATE_IDENTIFIER", "rulesDefinition.structureCatalog[1].structureTypeId");
  assertError(result, "UNKNOWN_FIELD", "unexpectedTopLevel");
  assert.ok(result.errors.length >= 5);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
