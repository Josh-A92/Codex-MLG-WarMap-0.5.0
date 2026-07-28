(function initializeSeasonOnePackage(globalScope) {
  const STRUCTURE_CATALOG = [
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
          capturable: true
        };
      }),
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