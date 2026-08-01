(function initializeSeasonOnePackage(globalScope) {
  const STRUCTURE_CATALOG = [
    { code: "V1", type: "Village", level: 1, expectedCount: 24, firstCaptureReward: 10, unlockWeek: 1, iceCrystalValue: 100000 },
    { code: "FM1", type: "Frost Mine", level: 1, expectedCount: 52, firstCaptureReward: 5, iceCrystalValue: 5000 },
    { code: "FM2", type: "Frost Mine", level: 2, expectedCount: 68, firstCaptureReward: 10, iceCrystalValue: 10000 },
    { code: "FM3", type: "Frost Mine", level: 3, expectedCount: 28, firstCaptureReward: 15, iceCrystalValue: 15000 },
    { code: "FM4", type: "Frost Mine", level: 4, expectedCount: 52, firstCaptureReward: 20, iceCrystalValue: 20000 },
    { code: "FM5", type: "Frost Mine", level: 5, expectedCount: 26, firstCaptureReward: 25, iceCrystalValue: 25000 },
    { code: "FM6", type: "Frost Mine", level: 6, expectedCount: 32, firstCaptureReward: 30, iceCrystalValue: 30000 },
    { code: "FM7", type: "Frost Mine", level: 7, expectedCount: 16, firstCaptureReward: 35, iceCrystalValue: 35000 },
    { code: "FM8", type: "Frost Mine", level: 8, expectedCount: 12, firstCaptureReward: 40, iceCrystalValue: 40000 },
    { code: "FM9", type: "Frost Mine", level: 9, expectedCount: 14, firstCaptureReward: 45, iceCrystalValue: 45000 },
    { code: "FM10", type: "Frost Mine", level: 10, expectedCount: 8, firstCaptureReward: 50, iceCrystalValue: 50000 },
    { code: "C2", type: "City", level: 2, expectedCount: 20, firstCaptureReward: 20, unlockWeek: 1, iceCrystalValue: 200000 },
    { code: "MN3", type: "Manor", level: 3, expectedCount: 15, firstCaptureReward: 30, unlockWeek: 2, iceCrystalValue: 300000 },
    { code: "F4", type: "Factory", level: 4, expectedCount: 12, firstCaptureReward: 40, unlockWeek: 2, iceCrystalValue: 400000 },
    { code: "T5", type: "Town", level: 5, expectedCount: 4, firstCaptureReward: 50, unlockWeek: 3, iceCrystalValue: 500000 },
    { code: "MP6", type: "Metropolis", level: 6, expectedCount: 4, firstCaptureReward: 60, unlockWeek: 3, iceCrystalValue: 1000000 },
    { code: "RC7", type: "Royal City", level: 7, expectedCount: 1, firstCaptureReward: 200, unlockWeek: 4, iceCrystalValue: 0 }
  ];

  const STRUCTURE_UNLOCKS = {
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

  const SEASON_1_PACKAGE = {
    packageIdentity: {
      schemaVersion: 1,
      packageVersion: "0.5.0",
      seasonId: "season-1",
      displayName: "Season 1",
      seasonStatus: "active"
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
      structureCatalog: STRUCTURE_CATALOG.map((entry) => {
        return {
          structureTypeId: `structure-type-${entry.code.toLowerCase()}`,
          code: entry.code,
          type: entry.type,
          level: entry.level,
          capturable: true,
          expectedCount: entry.expectedCount,
          firstCaptureReward: entry.firstCaptureReward,
          ...(entry.unlockWeek ? { unlockWeek: entry.unlockWeek } : {})
        };
      }),
      resourceModel: {
        resourceId: "ice-crystals",
        displayName: "Ice Crystals",
        unit: "crystals",
        metricType: "season-resource",
        structureOutputs: Object.fromEntries(STRUCTURE_CATALOG.map((entry) => [
          entry.code,
          {
            resourceId: "ice-crystals",
            value: entry.iceCrystalValue,
            unit: "crystals"
          }
        ]))
      },
      scoringModel: {
        calculationModelId: "season1-scoring-model",
        configured: true,
        resourceLabel: "Ice Crystals",
        serverField: "iceCrystals",
        unconfiguredLabel: "Scoring rules not configured"
      },
      phaseModel: [
        { id: "phase-1", label: "Interactive Map", status: "completed" },
        { id: "phase-2", label: "Camera", status: "completed" },
        { id: "phase-2-5", label: "Command Centre and Server Workspaces", status: "completed" },
        { id: "phase-3", label: "Territory Ownership", status: "partial" }
      ],
      structureUnlocks: STRUCTURE_UNLOCKS,
      captureRules: {
        defaultCapturable: true,
        byCode: {},
        byType: {},
        phaseRestrictions: []
      },
      buffDefinitions: []
    },
    applicationConfig: {
      designatedUnionId: "union-0001",
      dataSources: {
        mapDataUrl: "data/season1-map.json",
        seasonServerStateDataUrl: "data/season1-servers.json",
        unionsDataUrl: "data/unions.json"
      },
      workspace: {
        homeId: "command-centre",
        mapLabel: "Season 1 Blueprint"
      }
    },
    externalRegistries: [
      {
        registryId: "union-registry",
        registryType: "union-registry",
        sourceRef: "data/unions.json",
        required: true
      }
    ]
  };

  globalScope.SEASON_1_PACKAGE = SEASON_1_PACKAGE;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      SEASON_1_PACKAGE
    };
  }
})(globalThis);
