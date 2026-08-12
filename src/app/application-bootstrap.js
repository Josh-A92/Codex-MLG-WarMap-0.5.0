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

  function requireGenerationBridge(value, fieldPath) {
    if (!value || typeof value !== "object") throw new Error(`Application Bootstrap requires ${fieldPath}.`);
    requireFunction(value.loadCommittedGeneration, `${fieldPath}.loadCommittedGeneration`);
    requireFunction(value.commitGeneration, `${fieldPath}.commitGeneration`);
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
      const createOwnershipService = requireFunction(safeScope.createOwnershipService, "createOwnershipService");
      const createSummaryService = requireFunction(safeScope.createSummaryService, "createSummaryService");
      const createServerStateService = requireFunction(safeScope.createServerStateService, "createServerStateService");
      const serializeServerState = requireFunction(safeScope.serializeServerState, "serializeServerState");
      const deserializePersistenceEnvelope = requireFunction(
        safeScope.deserializePersistenceEnvelope,
        "deserializePersistenceEnvelope"
      );
      const createApplicationMutationCoordinator = requireFunction(
        safeScope.createApplicationMutationCoordinator,
        "createApplicationMutationCoordinator"
      );
      const createWarMapApplicationPersistenceCoordinator = requireFunction(
        safeScope.createWarMapApplicationPersistenceCoordinator,
        "createWarMapApplicationPersistenceCoordinator"
      );
      const createApplicationPersistenceCoordinator = requireFunction(
        safeScope.createApplicationPersistenceCoordinator,
        "createApplicationPersistenceCoordinator"
      );
      const createApplicationPersistenceFacade = requireFunction(
        safeScope.createApplicationPersistenceFacade,
        "createApplicationPersistenceFacade"
      );
      const createLegacyStateClassifier = requireFunction(
        safeScope.createLegacyStateClassifier,
        "createLegacyStateClassifier"
      );
      const warMapPersistenceStorage = requireBridge(
        safeScope.warMapPersistenceStorage,
        "warMapPersistenceStorage"
      );
      const warMapGenerationStorage = requireGenerationBridge(
        safeScope.warMapGenerationStorage,
        "warMapGenerationStorage"
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
      const generationStore = {
        async loadCommittedGeneration() {
          const response = await warMapGenerationStorage.loadCommittedGeneration();
          if (!response || response.ok !== true) {
            const error = new Error(response && response.error ? response.error.message : "Generation load failed.");
            error.code = response && response.error ? response.error.code : "generation_load_failed";
            throw error;
          }
          return response.result;
        },
        async commit(payload) {
          const response = await warMapGenerationStorage.commitGeneration(payload);
          if (!response || response.ok !== true) {
            const error = new Error(response && response.error ? response.error.message : "Generation commit failed.");
            error.code = response && response.error ? response.error.code : "generation_commit_failed";
            throw error;
          }
          return response.result;
        }
      };
      const generationStartup = await generationStore.loadCommittedGeneration();
      const legacyActivation = generationStartup.status === "missing"
        ? await warMapPersistenceStorage.loadEnvelope({ scope: "season_activation" })
        : null;
      const generationAdministration = generationStartup.status === "committed"
        ? generationStartup.documents.find((document) => document.documentId === "season-administration")
        : null;
      const persistedAdministration = generationAdministration && generationAdministration.value
        ? generationAdministration.value
        : legacyActivation;
      const initialActiveSeason = persistedAdministration && persistedAdministration.activeSeason
        ? persistedAdministration.activeSeason
        : persistedAdministration && persistedAdministration.schemaVersion === 1
          ? persistedAdministration
          : null;
      let activePersistenceFacade = null;
      const persistenceBoundary = {
        execute(...args) {
          if (!activePersistenceFacade) throw new Error("Persistence coordinator is not initialized.");
          return activePersistenceFacade.execute(...args);
        }
      };
      const seasonAdministrationService = createSeasonAdministrationService({
        preparedPackages,
        validateSeasonPackage,
        authorizationPolicyService: createAuthorizationPolicyService(),
        persistenceCoordinator: persistenceBoundary,
        initialState: persistedAdministration || { schemaVersion: 2, activeSeason: null, completedSeasons: [] },
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

      const evidenceStateSerializer = createEvidenceDomainStateSerializer({
        validateEvidenceAssetHistory: evidenceDomainModules.validateEvidenceAssetHistory,
        validateEvidenceRecordHistory: evidenceDomainModules.validateEvidenceRecordHistory
      });
      const legacyEvidenceSerializer = createEvidenceDomainStateSerializer({
        validateEvidenceAssetHistory: evidenceDomainModules.validateEvidenceAssetHistory,
        validateEvidenceRecordHistory: evidenceDomainModules.validateEvidenceRecordHistory
      });
      const deserializeDataManagementEnvelope = (envelope) => ({
        seasonId: envelope.seasonId,
        unionRegistry: deserializeUnionRegistryEnvelope(envelope.unionRegistry),
        strategicDomain: deserializeStrategicDomainEnvelope(envelope.strategicDomain),
        evidenceDomain: legacyEvidenceSerializer.deserializeEnvelope(envelope.evidenceDomain)
      });
      const legacyStateClassifier = createLegacyStateClassifier({
        deserializeDataManagementEnvelope,
        deserializeServerStateEnvelope: deserializePersistenceEnvelope
      });
      let dataManagementEnvelope = null;
      let serverStateEnvelope = null;
      let legacyInput = { seasonId: requestedSeasonId, baseMapId: loadedSeasonPackage.rulesDefinition.mapDefinition.baseMapId };
      if (generationStartup.status === "missing") {
        dataManagementEnvelope = await warMapPersistenceStorage.loadEnvelope({ scope: "data_management", seasonId: requestedSeasonId });
        serverStateEnvelope = await warMapPersistenceStorage.loadEnvelope({
          seasonId: requestedSeasonId,
          baseMapId: loadedSeasonPackage.rulesDefinition.mapDefinition.baseMapId
        });
        const classification = legacyStateClassifier.classify({
          seasonId: requestedSeasonId,
          baseMapId: loadedSeasonPackage.rulesDefinition.mapDefinition.baseMapId,
          dataManagementEnvelope,
          serverStateEnvelope,
          unionRegistryEnvelopes: dataManagementEnvelope ? [dataManagementEnvelope.unionRegistry] : []
        });
        legacyInput = {
          seasonId: requestedSeasonId,
          baseMapId: loadedSeasonPackage.rulesDefinition.mapDefinition.baseMapId,
          classification,
          dataManagementEnvelope,
          serverStateEnvelope,
          legacyDocuments: dataManagementEnvelope && serverStateEnvelope
            ? [
              { documentId: "union-registry-global", scope: "global", type: "union-registry", value: dataManagementEnvelope.unionRegistry },
              { documentId: `strategic-${requestedSeasonId}`, scope: requestedSeasonId, type: "strategic-domain", value: dataManagementEnvelope.strategicDomain },
              { documentId: `evidence-${requestedSeasonId}`, scope: requestedSeasonId, type: "evidence-domain", value: dataManagementEnvelope.evidenceDomain },
              { documentId: `projection-${requestedSeasonId}-${loadedSeasonPackage.rulesDefinition.mapDefinition.baseMapId}`, scope: `${requestedSeasonId}/${loadedSeasonPackage.rulesDefinition.mapDefinition.baseMapId}`, type: "server-state", value: serverStateEnvelope },
              { documentId: "season-administration", scope: "global", type: "season-administration", value: persistedAdministration || { schemaVersion: 2, activeSeason: null, completedSeasons: [] } }
            ]
            : []
        };
      }

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
        generationStore
        ,generationStartup
        ,legacyInput
        ,persistenceBoundary
        ,setApplicationPersistenceFacade: (facade) => { activePersistenceFacade = facade; }
        ,persistenceStartup: { generationStore, legacyInput, persistenceBoundary }
        ,createApplicationMutationCoordinator
        ,createWarMapApplicationPersistenceCoordinator
        ,createApplicationPersistenceCoordinator
        ,createApplicationPersistenceFacade
        ,strategicDomainModules
        ,evidenceDomainModules
        ,createUnionRegistryService
        ,createStrategicDomainRuntime
        ,createEvidenceDomainRuntime
        ,serializeUnionRegistry
        ,deserializeUnionRegistryEnvelope
        ,serializeStrategicDomainRuntime
        ,deserializeStrategicDomainEnvelope
        ,evidenceStateSerializer
        ,serializeServerState
        ,deserializeServerState: deserializePersistenceEnvelope
        ,legacyStateClassifier
      };
    }

    function displayBootstrapError(error) {
      console.error("Unable to start application bootstrap.", error);
      const errorName = error && typeof error.name === "string" ? error.name : "Error";
      const errorMessage = error && typeof error.message === "string" ? error.message : String(error);
      if (typeof document !== "undefined" && document && document.body) {
        const bootstrapError = document.createElement("div");
        bootstrapError.className = "app-bootstrap-error";
        bootstrapError.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;padding:12px 16px;background:#b00020;color:#ffffff;font:14px/1.4 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);";
        bootstrapError.textContent = `Application bootstrap failed (${errorName}): ${errorMessage}`;
        document.body.prepend(bootstrapError);
      }
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
              displayBootstrapError(error);
            });
          }, { once: true });
          return;
        }

        await startApplication(bootstrapContext);
      } catch (error) {
        displayBootstrapError(error);
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
