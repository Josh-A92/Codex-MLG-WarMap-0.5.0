(function initializeApplicationBootstrap(globalScope) {
  function requireFunction(value, fieldPath) {
    if (typeof value !== "function") {
      throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    }

    return value;
  }

  function requireConfigValue(value, fieldPath) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    }

    return value;
  }

  function resolveBundledSeasonPackage(scope) {
    const seasonPackage = scope && typeof scope.SEASON_1_PACKAGE === "object"
      ? scope.SEASON_1_PACKAGE
      : null;

    if (!seasonPackage) {
      throw new Error("Application Bootstrap requires SEASON_1_PACKAGE.");
    }

    return seasonPackage;
  }

  function resolveRequestedSeasonId(seasonPackage) {
    const packageIdentity = seasonPackage && typeof seasonPackage.packageIdentity === "object"
      ? seasonPackage.packageIdentity
      : null;
    const seasonId = packageIdentity ? packageIdentity.seasonId : null;

    if (typeof seasonId !== "string" || seasonId.trim() === "") {
      throw new Error("Application Bootstrap requires packageIdentity.seasonId on SEASON_1_PACKAGE.");
    }

    return seasonId;
  }

  function createSeasonPackageResolver(seasonPackage) {
    const requestedSeasonId = resolveRequestedSeasonId(seasonPackage);

    return async function resolvePackage(seasonId) {
      if (seasonId === requestedSeasonId) {
        return seasonPackage;
      }

      return null;
    };
  }

  function resolveApplicationConfig(seasonPackage) {
    const canonicalAppConfig = seasonPackage && typeof seasonPackage.applicationConfig === "object"
      ? seasonPackage.applicationConfig
      : {};
    const dataSources = canonicalAppConfig.dataSources && typeof canonicalAppConfig.dataSources === "object"
      ? canonicalAppConfig.dataSources
      : {};
    const workspace = canonicalAppConfig.workspace && typeof canonicalAppConfig.workspace === "object"
      ? canonicalAppConfig.workspace
      : {};

    return {
      map: {
        dataUrl: requireConfigValue(dataSources.mapDataUrl, "applicationConfig.dataSources.mapDataUrl")
      },
      server: {
        stateDataUrl: requireConfigValue(dataSources.seasonServerStateDataUrl, "applicationConfig.dataSources.seasonServerStateDataUrl")
      },
      union: {
        registryDataUrl: requireConfigValue(dataSources.unionsDataUrl, "applicationConfig.dataSources.unionsDataUrl")
      },
      workspace: {
        homeId: requireConfigValue(workspace.homeId, "applicationConfig.workspace.homeId"),
        mapLabel: requireConfigValue(workspace.mapLabel, "applicationConfig.workspace.mapLabel")
      }
    };
  }

  function createApplicationBootstrap(scope) {
    const safeScope = scope || {};

    async function resolveBootstrapContext() {
      const createSeasonLoader = requireFunction(safeScope.createSeasonLoader, "createSeasonLoader");
      const validateSeasonPackage = requireFunction(safeScope.validateSeasonPackage, "validateSeasonPackage");
      const createGameRulesEngine = requireFunction(safeScope.createGameRulesEngine, "createGameRulesEngine");
      const createOwnershipService = requireFunction(safeScope.createOwnershipService, "createOwnershipService");
      const createServerStateService = requireFunction(safeScope.createServerStateService, "createServerStateService");

      const bundledSeasonPackage = resolveBundledSeasonPackage(safeScope);
      const requestedSeasonId = resolveRequestedSeasonId(bundledSeasonPackage);
      const seasonLoader = createSeasonLoader({
        resolvePackage: createSeasonPackageResolver(bundledSeasonPackage),
        validateSeasonPackage
      });
      const loadedSeasonPackage = await seasonLoader.load(requestedSeasonId);

      if (!loadedSeasonPackage || typeof loadedSeasonPackage !== "object") {
        throw new Error("Application Bootstrap could not load a season package.");
      }

      if (!loadedSeasonPackage.rulesDefinition || typeof loadedSeasonPackage.rulesDefinition !== "object") {
        throw new Error("Application Bootstrap requires rulesDefinition on the loaded season package.");
      }

      return {
        gameRulesEngine: createGameRulesEngine(loadedSeasonPackage.rulesDefinition),
        applicationConfig: resolveApplicationConfig(loadedSeasonPackage),
        ownershipServiceFactory: createOwnershipService,
        serverStateServiceFactory: createServerStateService
      };
    }

    function startApplication(bootstrapContext) {
      const initializeMapRenderer = requireFunction(safeScope.initializeMapRenderer, "initializeMapRenderer");
      initializeMapRenderer(bootstrapContext);
    }

    async function bootstrapApplication() {
      try {
        const bootstrapContext = await resolveBootstrapContext();
        const documentRef = safeScope.document;

        if (documentRef && documentRef.readyState === "loading") {
          documentRef.addEventListener("DOMContentLoaded", () => {
            try {
              startApplication(bootstrapContext);
            } catch (error) {
              console.error("Unable to start application bootstrap.", error);
            }
          }, { once: true });
          return;
        }

        startApplication(bootstrapContext);
      } catch (error) {
        console.error("Unable to start application bootstrap.", error);
      }
    }

    return {
      bootstrapApplication,
      resolveBootstrapContext,
      resolveApplicationConfig
    };
  }

  globalScope.createApplicationBootstrap = createApplicationBootstrap;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createApplicationBootstrap
    };
  }

  if (typeof window !== "undefined" && globalScope === window) {
    const bootstrap = createApplicationBootstrap(globalScope);
    bootstrap.bootstrapApplication();
  }
})(typeof window !== "undefined" ? window : globalThis);