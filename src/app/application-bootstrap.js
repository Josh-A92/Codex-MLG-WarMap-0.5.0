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

  function createPackageValidationError(message) {
    if (globalScope && typeof globalScope.SeasonPackageLoadError === "function") {
      return new globalScope.SeasonPackageLoadError("PACKAGE_VALIDATION_FAILED", message, null);
    }

    return new Error(message);
  }

  function requireConfigValue(value, fieldPath) {
    if (typeof value !== "string" || value.trim() === "") {
      throw createPackageValidationError(`Application Bootstrap requires ${fieldPath}.`);
    }

    return value;
  }

  function requireSeasonPackage(value, fieldPath) {
    if (!value || typeof value !== "object") {
      throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    }

    const packageIdentity = value.packageIdentity && typeof value.packageIdentity === "object"
      ? value.packageIdentity
      : null;
    const rulesDefinition = value.rulesDefinition && typeof value.rulesDefinition === "object"
      ? value.rulesDefinition
      : null;
    const applicationConfig = value.applicationConfig && typeof value.applicationConfig === "object"
      ? value.applicationConfig
      : null;

    if (!packageIdentity || !rulesDefinition || !applicationConfig) {
      throw createPackageValidationError(`Application Bootstrap requires ${fieldPath} to be a complete package definition.`);
    }

    if (typeof packageIdentity.seasonId !== "string" || packageIdentity.seasonId.trim() === "") {
      throw createPackageValidationError(`Application Bootstrap requires packageIdentity.seasonId on ${fieldPath}.`);
    }

    return value;
  }

  function resolveBundledSeasonPackages(scope) {
    const seasonPackage = requireSeasonPackage(
      scope && typeof scope.SEASON_1_PACKAGE === "object" ? scope.SEASON_1_PACKAGE : null,
      "SEASON_1_PACKAGE"
    );
    const seasonTwoPackage = requireSeasonPackage(
      scope && typeof scope.SEASON_2_PACKAGE === "object" ? scope.SEASON_2_PACKAGE : null,
      "SEASON_2_PACKAGE"
    );

    return [seasonPackage, seasonTwoPackage];
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

  function createSeasonPackageResolver(preparedPackages) {
    const packageLookup = new Map();

    preparedPackages.forEach((candidatePackage) => {
      if (!candidatePackage || typeof candidatePackage !== "object") {
        return;
      }

      const packageIdentity = candidatePackage.packageIdentity && typeof candidatePackage.packageIdentity === "object"
        ? candidatePackage.packageIdentity
        : null;
      const seasonId = packageIdentity && typeof packageIdentity.seasonId === "string"
        ? packageIdentity.seasonId.trim()
        : "";

      if (seasonId !== "") {
        packageLookup.set(seasonId, candidatePackage);
      }
    });

    return async function resolvePackage(seasonId) {
      if (typeof seasonId !== "string" || seasonId.trim() === "") {
        return null;
      }

      return packageLookup.get(seasonId) || null;
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
      const createSeasonAdministrationService = requireFunction(
        safeScope.createSeasonAdministrationService,
        "createSeasonAdministrationService"
      );
      const validateStrategicNodeNetworkMap = requireFunction(
        safeScope.validateStrategicNodeNetworkMap,
        "validateStrategicNodeNetworkMap"
      );
      const createStrategicNodeNetworkProjectionService = requireFunction(
        safeScope.createStrategicNodeNetworkProjectionService,
        "createStrategicNodeNetworkProjectionService"
      );
      const createStrategicNodeNetworkSvgRenderer = requireFunction(
        safeScope.createStrategicNodeNetworkSvgRenderer,
        "createStrategicNodeNetworkSvgRenderer"
      );
      const createAuthorizationPolicyService = requireFunction(
        safeScope.createAuthorizationPolicyService,
        "createAuthorizationPolicyService"
      );
      const createGameRulesEngine = requireFunction(safeScope.createGameRulesEngine, "createGameRulesEngine");
      const createUnionRegistryService = requireFunction(
        safeScope.createUnionRegistryService,
        "createUnionRegistryService"
      );
      const createStrategicDomainModuleRegistry = requireFunction(
        safeScope.createStrategicDomainModuleRegistry,
        "createStrategicDomainModuleRegistry"
      );
      const createStrategicDomainRuntime = requireFunction(
        safeScope.createStrategicDomainRuntime,
        "createStrategicDomainRuntime"
      );
      const createEvidenceDomainModuleRegistry = requireFunction(
        safeScope.createEvidenceDomainModuleRegistry,
        "createEvidenceDomainModuleRegistry"
      );
      const createEvidenceDomainRuntime = requireFunction(
        safeScope.createEvidenceDomainRuntime,
        "createEvidenceDomainRuntime"
      );
      const createDataManagementModuleRegistry = requireFunction(
        safeScope.createDataManagementModuleRegistry,
        "createDataManagementModuleRegistry"
      );
      const createDataManagementRuntime = requireFunction(
        safeScope.createDataManagementRuntime,
        "createDataManagementRuntime"
      );
      const createTrustedLocalActor = requireFunction(
        safeScope.createTrustedLocalActor,
        "createTrustedLocalActor"
      );
      const serializeUnionRegistry = requireFunction(
        safeScope.serializeUnionRegistry,
        "serializeUnionRegistry"
      );
      const deserializeUnionRegistryEnvelope = requireFunction(
        safeScope.deserializeUnionRegistryEnvelope,
        "deserializeUnionRegistryEnvelope"
      );
      const serializeStrategicDomainRuntime = requireFunction(
        safeScope.serializeStrategicDomainRuntime,
        "serializeStrategicDomainRuntime"
      );
      const deserializeStrategicDomainEnvelope = requireFunction(
        safeScope.deserializeStrategicDomainEnvelope,
        "deserializeStrategicDomainEnvelope"
      );
      const createEvidenceDomainStateSerializer = requireFunction(
        safeScope.createEvidenceDomainStateSerializer,
        "createEvidenceDomainStateSerializer"
      );
      const createDataManagementStatePersistenceService = requireFunction(
        safeScope.createDataManagementStatePersistenceService,
        "createDataManagementStatePersistenceService"
      );
      const createDataManagementPersistenceController = requireFunction(
        safeScope.createDataManagementPersistenceController,
        "createDataManagementPersistenceController"
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

      const [bundledSeasonPackage, bundledSeasonTwoPackage] = resolveBundledSeasonPackages(safeScope);
      const preparedPackages = [bundledSeasonPackage, bundledSeasonTwoPackage];
      preparedPackages.forEach((candidatePackage) => {
        const validationResult = validateSeasonPackage(candidatePackage);
        if (!validationResult || validationResult.valid !== true) {
          throw createPackageValidationError("Application Bootstrap requires valid season package dependencies.");
        }
      });
      const strategicNodeNetworkProjectionService = createStrategicNodeNetworkProjectionService({
        validateStrategicNodeNetworkMap
      });
      const strategicNodeNetworkSvgRenderer = createStrategicNodeNetworkSvgRenderer();
      const storageAdapter = createElectronFileStorageAdapter(warMapPersistenceStorage);
      const seasonAdministrationService = createSeasonAdministrationService({
        preparedPackages,
        validateSeasonPackage,
        authorizationPolicyService: createAuthorizationPolicyService(),
        storageAdapter,
        clock: () => new Date()
      });
      const activeSeasonActivation = await seasonAdministrationService.initialize();
      const activeSeasonId = activeSeasonActivation && typeof activeSeasonActivation.seasonId === "string"
        ? activeSeasonActivation.seasonId.trim()
        : "";
      const requestedSeasonId = activeSeasonId !== ""
        ? activeSeasonId
        : resolveRequestedSeasonId(bundledSeasonPackage);
      const seasonLoader = createSeasonLoader({
        resolvePackage: createSeasonPackageResolver(preparedPackages),
        validateSeasonPackage
      });

      let loadedSeasonPackage;
      try {
        loadedSeasonPackage = await seasonLoader.load(requestedSeasonId);
      } catch (error) {
        if (error && error.name === "SeasonPackageLoadError" && error.code === "PACKAGE_NOT_FOUND") {
          throw new Error(`Application Bootstrap does not recognize active seasonId '${requestedSeasonId}'.`);
        }

        throw error;
      }

      if (!loadedSeasonPackage || typeof loadedSeasonPackage !== "object") {
        throw new Error("Application Bootstrap could not load a season package.");
      }

      if (!loadedSeasonPackage.rulesDefinition || typeof loadedSeasonPackage.rulesDefinition !== "object") {
        throw new Error("Application Bootstrap requires rulesDefinition on the loaded season package.");
      }

      const strategicDomainModules = createStrategicDomainModuleRegistry(safeScope);
      const evidenceDomainModules = createEvidenceDomainModuleRegistry(safeScope);
      const dataManagementModules = createDataManagementModuleRegistry(safeScope);

      const persistenceService = createPersistenceService({
        storageAdapter,
        serializeServerState,
        deserializePersistenceEnvelope,
        clock: () => new Date()
      });

      const serverStatePersistenceController = createServerStatePersistenceController({
        persistenceService
      });
      const evidenceStateSerializer = createEvidenceDomainStateSerializer({
        validateEvidenceAssetHistory: evidenceDomainModules.validateEvidenceAssetHistory,
        validateEvidenceRecordHistory: evidenceDomainModules.validateEvidenceRecordHistory
      });
      const dataManagementStatePersistenceService =
        createDataManagementStatePersistenceService({
          storageAdapter,
          serializeUnionRegistry,
          deserializeUnionRegistryEnvelope,
          serializeStrategicDomainRuntime,
          deserializeStrategicDomainEnvelope,
          evidenceStateSerializer,
          createUnionRegistryService,
          createStrategicDomainRuntime,
          createEvidenceDomainRuntime,
          strategicDomainModules,
          evidenceDomainModules,
          clock: () => new Date()
        });
      const dataManagementPersistenceController =
        createDataManagementPersistenceController({
          persistenceService: dataManagementStatePersistenceService
        });

      return {
        gameRulesEngine: createGameRulesEngine(loadedSeasonPackage.rulesDefinition),
        applicationConfig: resolveApplicationConfig(loadedSeasonPackage),
        seasonAdministrationService,
        strategicNodeNetworkProjectionService,
        strategicNodeNetworkSvgRenderer,
        seasonContext: {
          seasonId: requestedSeasonId,
          activated: activeSeasonActivation !== null,
          serverIds: activeSeasonActivation === null
            ? null
            : activeSeasonActivation.serverIds.slice()
        },
        dataManagementModules,
        dataManagementRuntimeFactory: createDataManagementRuntime,
        trustedLocalActorFactory: createTrustedLocalActor,
        ownershipServiceFactory: createOwnershipService,
        summaryServiceFactory: createSummaryService,
        serverStateServiceFactory: createServerStateService,
        serverStatePersistenceController,
        dataManagementPersistenceController
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
