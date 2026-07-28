(function initializeSeasonOneDefinition(globalScope) {
  globalScope.SEASON_1_DEFINITION = {
    appConfig: {
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
      gridSize: 20
    },
    structureCatalog: [
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
    ],
    scoringModel: {
      configured: false,
      resourceLabel: "Ice Crystals",
      serverField: "iceCrystals",
      unconfiguredLabel: "Scoring rules not configured",
      territoryRule: "ownedTiles / totalTiles",
      structureRule: "fully-owned footprint counts as captured"
    },
    resourceModel: {
      primaryResource: "Ice Crystals",
      structureOutputs: {}
    },
    phaseModel: [
      { id: "phase-1", label: "Interactive Map", status: "completed" },
      { id: "phase-2", label: "Camera", status: "completed" },
      { id: "phase-2-5", label: "Command Centre and Server Workspaces", status: "completed" },
      { id: "phase-3", label: "Territory Ownership", status: "partial" }
    ],
    captureRules: {
      defaultCapturable: true,
      byCode: {},
      byType: {}
    },
    buffDefinitions: [],
    structureUnlocks: {
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
    }
  };
})(window);
