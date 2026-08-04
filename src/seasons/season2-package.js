(function initializeSeasonTwoPackage(globalScope) {
  const STRUCTURE_CATALOG = [
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

  const SEASON_2_PACKAGE = {
    packageIdentity: {
      schemaVersion: 2,
      packageVersion: "0.5.0",
      seasonId: "season-2",
      displayName: "Season II: Desert Dynasty",
      seasonStatus: "draft"
    },
    rulesDefinition: {
      seasonIdentity: {
        seasonId: "season-2",
        seasonName: "Season II: Desert Dynasty"
      },
      metadata: {
        timelineModel: "seasonal"
      },
      mapDefinition: {
        baseMapId: "season2-strategic-node-network",
        topologyType: "strategic_node_network",
        dimensions: {
          rows: 12,
          columns: 12
        },
        mapDataContract: {
          nodes: {
            collectionField: "nodes",
            identityField: "nodeId",
            typeRefField: "typeCode",
            positionField: "position"
          },
          connections: {
            collectionField: "connections",
            identityField: "connectionId",
            fromNodeRefField: "fromNodeId",
            toNodeRefField: "toNodeId"
          }
        },
        mapDataRef: "data/season2-map.json"
      },
      structureCatalog: STRUCTURE_CATALOG.map((entry) => ({
        structureTypeId: `structure-type-${entry.code.toLowerCase()}`,
        code: entry.code,
        type: entry.type,
        level: entry.level,
        capturable: true,
        expectedCount: entry.expectedCount
      })),
      resourceModel: {
        resources: [
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
        ],
        structureOutputs: {}
      },
      scoringModel: {
        calculations: [
          {
            calculationId: "red-copper-holdings",
            calculationModelId: "structure-output-holdings-total",
            resourceId: "red-copper",
            configured: false,
            displayLabel: "Red Copper",
            unconfiguredLabel: "Scoring rules not configured"
          },
          {
            calculationId: "holy-water-holdings",
            calculationModelId: "structure-output-holdings-total",
            resourceId: "holy-water",
            configured: false,
            displayLabel: "Holy Water",
            unconfiguredLabel: "Scoring rules not configured"
          }
        ]
      },
      phaseModel: [],
      structureUnlocks: {},
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
        mapDataUrl: "data/season2-map.json",
        seasonServerStateDataUrl: "data/season2-servers.json",
        unionsDataUrl: "data/unions.json"
      },
      workspace: {
        homeId: "command-centre",
        mapLabel: "Season II: Desert Dynasty"
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

  globalScope.SEASON_2_PACKAGE = SEASON_2_PACKAGE;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      SEASON_2_PACKAGE
    };
  }
})(globalThis);
