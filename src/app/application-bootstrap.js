(function initializeApplicationBootstrap(globalScope) {

  function getSeasonDefinition() {
    return globalScope.SEASON_1_DEFINITION || null;
  }

  function createRulesDefinition(seasonDefinition) {
    return {
      seasonIdentity: seasonDefinition.seasonIdentity && typeof seasonDefinition.seasonIdentity === "object"
        ? seasonDefinition.seasonIdentity
        : {},
      metadata: seasonDefinition.metadata && typeof seasonDefinition.metadata === "object"
        ? seasonDefinition.metadata
        : {},
      mapDefinition: seasonDefinition.mapDefinition && typeof seasonDefinition.mapDefinition === "object"
        ? seasonDefinition.mapDefinition
        : {},
      structureCatalog: Array.isArray(seasonDefinition.structureCatalog) ? seasonDefinition.structureCatalog : [],
      scoringModel: seasonDefinition.scoringModel && typeof seasonDefinition.scoringModel === "object"
        ? seasonDefinition.scoringModel
        : {},
      resourceModel: seasonDefinition.resourceModel && typeof seasonDefinition.resourceModel === "object"
        ? seasonDefinition.resourceModel
        : {},
      phaseModel: Array.isArray(seasonDefinition.phaseModel) ? seasonDefinition.phaseModel : [],
      structureUnlocks: seasonDefinition.structureUnlocks && typeof seasonDefinition.structureUnlocks === "object"
        ? seasonDefinition.structureUnlocks
        : {},
      captureRules: seasonDefinition.captureRules && typeof seasonDefinition.captureRules === "object"
        ? seasonDefinition.captureRules
        : {},
      buffDefinitions: Array.isArray(seasonDefinition.buffDefinitions) ? seasonDefinition.buffDefinitions : []
    };
  }

  function requireConfigValue(value, fieldPath) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    }

    return value;
  }

  function resolveApplicationConfig(seasonDefinition) {
    const appConfig = seasonDefinition && typeof seasonDefinition.appConfig === "object"
      ? seasonDefinition.appConfig
      : {};
    const dataSources = appConfig.dataSources && typeof appConfig.dataSources === "object"
      ? appConfig.dataSources
      : {};
    const workspace = appConfig.workspace && typeof appConfig.workspace === "object"
      ? appConfig.workspace
      : {};

    return {
      map: {
        dataUrl: requireConfigValue(dataSources.mapDataUrl, "appConfig.dataSources.mapDataUrl")
      },
      server: {
        stateDataUrl: requireConfigValue(dataSources.seasonServerStateDataUrl, "appConfig.dataSources.seasonServerStateDataUrl")
      },
      union: {
        registryDataUrl: requireConfigValue(dataSources.unionsDataUrl, "appConfig.dataSources.unionsDataUrl")
      },
      workspace: {
        homeId: requireConfigValue(workspace.homeId, "appConfig.workspace.homeId"),
        mapLabel: requireConfigValue(workspace.mapLabel, "appConfig.workspace.mapLabel")
      }
    };
  }

  function resolveBootstrapContext() {
    const seasonDefinition = getSeasonDefinition();

    if (!seasonDefinition) {
      console.error("Unable to start application bootstrap: Season 1 definition is unavailable.");
      return null;
    }

    if (typeof globalScope.createGameRulesEngine !== "function") {
      console.error("Unable to start application bootstrap: Game Rules Engine factory is unavailable.");
      return null;
    }

    const rulesDefinition = createRulesDefinition(seasonDefinition);
    const gameRulesEngine = globalScope.createGameRulesEngine(rulesDefinition);

    return {
      gameRulesEngine,
      applicationConfig: resolveApplicationConfig(seasonDefinition),
      ownershipServiceFactory: typeof globalScope.createOwnershipService === "function"
        ? globalScope.createOwnershipService
        : null
    };
  }

  function startApplication(bootstrapContext) {
    if (typeof globalScope.initializeMapRenderer !== "function") {
      console.error("Unable to start application: map renderer is unavailable.");
      return;
    }

    globalScope.initializeMapRenderer(bootstrapContext);
  }

  function bootstrapApplication() {
    const bootstrapContext = resolveBootstrapContext();

    if (!bootstrapContext) {
      return;
    }

    if (globalScope.document.readyState === "loading") {
      globalScope.document.addEventListener("DOMContentLoaded", () => {
        startApplication(bootstrapContext);
      }, { once: true });
      return;
    }

    startApplication(bootstrapContext);
  }

  bootstrapApplication();
})(window);