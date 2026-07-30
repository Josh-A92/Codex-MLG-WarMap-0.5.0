(function initializeApplicationBootstrap(globalScope) {
  function requireFunction(value, fieldPath) {
    if (typeof value !== "function") {
      throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    }

    return value;
  }

  function requireBridge(value, fieldPath) {
    if (!value || typeof value !== "object") {
      throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    }

    requireFunction(value.loadEnvelope, `${fieldPath}.loadEnvelope`);
    requireFunction(value.saveEnvelope, `${fieldPath}.saveEnvelope`);
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
    const designatedUnionId = typeof canonicalAppConfig.designatedUnionId === "string"
      && canonicalAppConfig.designatedUnionId.trim() !== ""
      ? canonicalAppConfig.designatedUnionId
      : null;

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
      },
      summary: {
        designatedUnionId
      }
    };
  }

  function createApplicationBootstrap(scope) {
    const safeScope = scope || {};

    async function resolveBootstrapContext() {
      const createSeasonLoader = requireFunction(safeScope.createSeasonLoader, "createSeasonLoader");
      const validateSeasonPackage = requireFunction(safeScope.validateSeasonPackage, "validateSeasonPackage");
      const createGameRulesEngine = requireFunction(safeScope.createGameRulesEngine, "createGameRulesEngine");
      const createUnionRegistryService = requireFunction(
        safeScope.createUnionRegistryService,
        "createUnionRegistryService"
      );
      const createStrategicDomainModuleRegistry = requireFunction(
        safeScope.createStrategicDomainModuleRegistry,
        "createStrategicDomainModuleRegistry"
      );
      const createOwnershipService = requireFunction(safeScope.createOwnershipService, "createOwnershipService");
      const createSummaryService = requireFunction(safeScope.createSummaryService, "createSummaryService");
      const createServerStateService = requireFunction(safeScope.createServerStateService, "createServerStateService");
      const serializeServerState = requireFunction(safeScope.serializeServerState, "serializeServerState");
      const deserializePersistenceEnvelope = requireFunction(
        safeScope.deserializePersistenceEnvelope,
        "deserializePersistenceEnvelope"
      );
      const createPersistenceService = requireFunction(safeScope.createPersistenceService, "createPersistenceService");
      const createElectronFileStorageAdapter = requireFunction(
        safeScope.createElectronFileStorageAdapter,
        "createElectronFileStorageAdapter"
      );
      const createServerStatePersistenceController = requireFunction(
        safeScope.createServerStatePersistenceController,
        "createServerStatePersistenceController"
      );
      const warMapPersistenceStorage = requireBridge(
        safeScope.warMapPersistenceStorage,
        "warMapPersistenceStorage"
      );

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

      const storageAdapter = createElectronFileStorageAdapter(warMapPersistenceStorage);

      const persistenceService = createPersistenceService({
        storageAdapter,
        serializeServerState,
        deserializePersistenceEnvelope,
        clock: () => new Date()
      });

      const serverStatePersistenceController = createServerStatePersistenceController({
        persistenceService
      });

      return {
        gameRulesEngine: createGameRulesEngine(loadedSeasonPackage.rulesDefinition),
        applicationConfig: resolveApplicationConfig(loadedSeasonPackage),
        strategicDomainModules: createStrategicDomainModuleRegistry(safeScope),
        unionRegistryServiceFactory: createUnionRegistryService,
        ownershipServiceFactory: createOwnershipService,
        summaryServiceFactory: createSummaryService,
        serverStateServiceFactory: createServerStateService,
        serverStatePersistenceController
      };
    }

    function startApplication(bootstrapContext) {
      const initializeMapRenderer = requireFunction(safeScope.initializeMapRenderer, "initializeMapRenderer");
      return Promise.resolve(initializeMapRenderer(bootstrapContext));
    }

    async function bootstrapApplication() {
      try {
        const bootstrapContext = await resolveBootstrapContext();
        const documentRef = safeScope.document;

        if (documentRef && documentRef.readyState === "loading") {
          documentRef.addEventListener("DOMContentLoaded", () => {
            startApplication(bootstrapContext).catch((error) => {
              console.error("Unable to start application bootstrap.", error);
            });
          }, { once: true });
          return;
        }

        await startApplication(bootstrapContext);
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
