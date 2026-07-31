const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createSeasonLoader } = require("../src/services/season-loader.js");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");
const { createApplicationBootstrap } = require("../src/app/application-bootstrap.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDocumentStub(readyState) {
  const listeners = [];

  return {
    readyState,
    listeners,
    addEventListener(eventName, handler, options) {
      listeners.push({ eventName, handler, options });
    }
  };
}

function createValidScope(options) {
  const values = options || {};
  const callLog = [];
  const rendererCalls = [];

  const seasonPackage = values.seasonPackage || SEASON_1_PACKAGE;
  const documentStub = values.document || createDocumentStub("complete");
  const dependencyOverrides = values.dependencies || {};
  const persistenceBridge = values.warMapPersistenceStorage || {
    async loadEnvelope() {
      return null;
    },
    async saveEnvelope() {
      return undefined;
    }
  };

  const createElectronFileStorageAdapter = dependencyOverrides.createElectronFileStorageAdapter || ((bridge) => {
    callLog.push("createElectronFileStorageAdapter");
    return {
      async loadEnvelope(identity) {
        return bridge.loadEnvelope(identity);
      },
      async saveEnvelope(identity, envelope) {
        return bridge.saveEnvelope(identity, envelope);
      }
    };
  });

  const createPersistenceService = dependencyOverrides.createPersistenceService || ((dependencies) => {
    callLog.push("createPersistenceService");
    return {
      async load(serverStateService) {
        return dependencies.storageAdapter.loadEnvelope({
          seasonId: serverStateService.getSeasonId(),
          baseMapId: serverStateService.getBaseMapId()
        });
      },
      async save(serverStateService) {
        return dependencies.storageAdapter.saveEnvelope(
          {
            seasonId: serverStateService.getSeasonId(),
            baseMapId: serverStateService.getBaseMapId()
          },
          dependencies.serializeServerState(serverStateService, dependencies.clock().toISOString())
        );
      }
    };
  });

  const createServerStatePersistenceController = dependencyOverrides.createServerStatePersistenceController || (({ persistenceService }) => {
    callLog.push("createServerStatePersistenceController");
    return {
      async initialize(serverStateService) {
        return persistenceService.load(serverStateService);
      },
      requestSave() {
        return Promise.resolve();
      },
      flush() {
        return Promise.resolve();
      },
      isInitialized() {
        return true;
      }
    };
  });

  const scope = {
    document: documentStub,
    SEASON_1_PACKAGE: seasonPackage,
    SEASON_1_DEFINITION: {
      appConfig: {
        dataSources: {
          mapDataUrl: "legacy/map.json",
          seasonServerStateDataUrl: "legacy/servers.json",
          unionsDataUrl: "legacy/unions.json"
        },
        workspace: {
          homeId: "legacy-home",
          mapLabel: "Legacy Label"
        }
      }
    },
    createSeasonLoader: dependencyOverrides.createSeasonLoader || ((dependencies) => {
      callLog.push("createSeasonLoader");
      return createSeasonLoader({
        resolvePackage: async (seasonId) => {
          callLog.push("resolvePackage");
          return dependencies.resolvePackage(seasonId);
        },
        validateSeasonPackage: (candidate) => {
          callLog.push("validateSeasonPackage");
          return dependencies.validateSeasonPackage(candidate);
        }
      });
    }),
    validateSeasonPackage: dependencyOverrides.validateSeasonPackage || ((candidate) => {
      callLog.push("validateSeasonPackage-call");
      return validateSeasonPackage(candidate);
    }),
    createGameRulesEngine: dependencyOverrides.createGameRulesEngine || ((definition) => {
      callLog.push("createGameRulesEngine");
      return {
        inputDefinition: definition,
        getSeasonIdentity() {
          return (definition && definition.seasonIdentity) || {};
        },
        getSeasonMetadata() {
          return (definition && definition.metadata) || {};
        }
      };
    }),
    createOwnershipService: dependencyOverrides.createOwnershipService || (() => {
      callLog.push("createOwnershipService");
      return {};
    }),
    createUnionRegistryService: dependencyOverrides.createUnionRegistryService || (() => {
      callLog.push("createUnionRegistryService");
      return {};
    }),
    createStrategicDomainModuleRegistry:
      dependencyOverrides.createStrategicDomainModuleRegistry || ((inputScope) => {
        callLog.push("createStrategicDomainModuleRegistry");
        return Object.freeze({
          sourceScope: inputScope
        });
      }),
    createStrategicDomainRuntime:
      dependencyOverrides.createStrategicDomainRuntime || ((runtimeOptions) => {
        callLog.push("createStrategicDomainRuntime");
        return Object.freeze({ runtimeOptions });
      }),
    createEvidenceDomainModuleRegistry:
      dependencyOverrides.createEvidenceDomainModuleRegistry || ((inputScope) => {
        callLog.push("createEvidenceDomainModuleRegistry");
        return Object.freeze({ sourceScope: inputScope });
      }),
    createEvidenceDomainRuntime:
      dependencyOverrides.createEvidenceDomainRuntime || ((runtimeOptions) => {
        callLog.push("createEvidenceDomainRuntime");
        return Object.freeze({ runtimeOptions });
      }),
    createDataManagementModuleRegistry:
      dependencyOverrides.createDataManagementModuleRegistry || ((inputScope) => {
        callLog.push("createDataManagementModuleRegistry");
        return Object.freeze({ sourceScope: inputScope });
      }),
    createDataManagementRuntime:
      dependencyOverrides.createDataManagementRuntime || ((runtimeOptions) => {
        callLog.push("createDataManagementRuntime");
        return Object.freeze({ runtimeOptions });
      }),
    createSummaryService: dependencyOverrides.createSummaryService || (() => {
      callLog.push("createSummaryService");
      return {};
    }),
    createServerStateService: dependencyOverrides.createServerStateService || (() => {
      callLog.push("createServerStateService");
      return {};
    }),
    serializeServerState: dependencyOverrides.serializeServerState || (() => {
      callLog.push("serializeServerState");
      return {
        schemaVersion: 1,
        seasonId: "season-1",
        baseMapId: "season1-map",
        savedAt: "2026-07-29T00:00:00.000Z",
        servers: []
      };
    }),
    deserializePersistenceEnvelope: dependencyOverrides.deserializePersistenceEnvelope || ((candidate) => {
      callLog.push("deserializePersistenceEnvelope");
      return candidate;
    }),
    createPersistenceService,
    createElectronFileStorageAdapter,
    createServerStatePersistenceController,
    warMapPersistenceStorage: persistenceBridge,
    initializeMapRenderer: dependencyOverrides.initializeMapRenderer || ((context) => {
      callLog.push("initializeMapRenderer");
      rendererCalls.push(context);
    })
  };

  return {
    scope,
    callLog,
    rendererCalls,
    documentStub
  };
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

runTest("valid canonical Season 1 package initializes renderer exactly once", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
});

runTest("loader and validator run before renderer initialization", async () => {
  const { scope, callLog } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  const firstValidateIndex = callLog.findIndex((entry) => entry === "validateSeasonPackage");
  const rendererIndex = callLog.findIndex((entry) => entry === "initializeMapRenderer");

  assert.notStrictEqual(firstValidateIndex, -1);
  assert.notStrictEqual(rendererIndex, -1);
  assert.ok(firstValidateIndex < rendererIndex);
});

runTest("Game Rules Engine receives rulesDefinition only", async () => {
  const { scope, rendererCalls } = createValidScope();
  let receivedDefinition = null;

  scope.createGameRulesEngine = (definition) => {
    receivedDefinition = definition;
    return {
      getSeasonIdentity() {
        return {};
      },
      getSeasonMetadata() {
        return {};
      }
    };
  };

  const bootstrap = createApplicationBootstrap(scope);
  await bootstrap.bootstrapApplication();

  assert.strictEqual(receivedDefinition, scope.SEASON_1_PACKAGE.rulesDefinition);
  assert.strictEqual(rendererCalls.length, 1);
});

runTest("renderer receives exact existing applicationConfig translation", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.deepStrictEqual(rendererCalls[0].applicationConfig, {
    map: {
      dataUrl: "data/season1-map.json"
    },
    server: {
      stateDataUrl: "data/season1-servers.json"
    },
    union: {
      registryDataUrl: "data/unions.json"
    },
    workspace: {
      homeId: "command-centre",
      mapLabel: "Season 1 Blueprint"
    },
    summary: {
      designatedUnionId: "union-0001"
    }
  });
});

runTest("renderer receives exact union registry service factory", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(rendererCalls[0].unionRegistryServiceFactory, scope.createUnionRegistryService);
});

runTest("renderer receives the grouped strategic domain module registry", async () => {
  const { scope, rendererCalls, callLog } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);
  await bootstrap.bootstrapApplication();
  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(rendererCalls[0].strategicDomainModules.sourceScope, scope);
  assert.ok(callLog.includes("createStrategicDomainModuleRegistry"));
  assert.strictEqual(Object.isFrozen(rendererCalls[0].strategicDomainModules), true);
});

runTest("renderer receives the strategic domain runtime factory unchanged", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);
  await bootstrap.bootstrapApplication();
  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(
    rendererCalls[0].strategicDomainRuntimeFactory,
    scope.createStrategicDomainRuntime
  );
});

runTest("renderer receives evidence and data-management runtime composition", async () => {
  const { scope, rendererCalls, callLog } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);
  await bootstrap.bootstrapApplication();

  const context = rendererCalls[0];
  assert.strictEqual(context.evidenceDomainModules.sourceScope, scope);
  assert.strictEqual(context.evidenceDomainRuntimeFactory, scope.createEvidenceDomainRuntime);
  assert.strictEqual(context.dataManagementModules.sourceScope, scope);
  assert.strictEqual(context.dataManagementRuntimeFactory, scope.createDataManagementRuntime);
  assert.ok(callLog.includes("createEvidenceDomainModuleRegistry"));
  assert.ok(callLog.includes("createDataManagementModuleRegistry"));
});

runTest("bootstrap fails clearly when evidence or data-management composition is missing", async () => {
  for (const field of [
    "createEvidenceDomainModuleRegistry",
    "createEvidenceDomainRuntime",
    "createDataManagementModuleRegistry",
    "createDataManagementRuntime"
  ]) {
    const { scope, rendererCalls } = createValidScope();
    delete scope[field];
    await assert.rejects(
      () => createApplicationBootstrap(scope).resolveBootstrapContext(),
      new RegExp(field)
    );
    assert.strictEqual(rendererCalls.length, 0);
  }
});

runTest("bootstrap fails clearly when strategic domain module registry factory is missing", async () => {
  const { scope, rendererCalls } = createValidScope();
  delete scope.createStrategicDomainModuleRegistry;
  await assert.rejects(
    () => createApplicationBootstrap(scope).resolveBootstrapContext(),
    /createStrategicDomainModuleRegistry/
  );
  assert.strictEqual(rendererCalls.length, 0);
});

runTest("bootstrap fails clearly when strategic domain runtime factory is missing", async () => {
  const { scope, rendererCalls } = createValidScope();
  delete scope.createStrategicDomainRuntime;
  await assert.rejects(
    () => createApplicationBootstrap(scope).resolveBootstrapContext(),
    /createStrategicDomainRuntime/
  );
  assert.strictEqual(rendererCalls.length, 0);
});

runTest("bootstrap fails clearly when union registry factory is missing", async () => {
  const { scope } = createValidScope();
  delete scope.createUnionRegistryService;
  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(() => bootstrap.resolveBootstrapContext(), /createUnionRegistryService/);
});

runTest("renderer receives designated union summary config with null when omitted", async () => {
  const seasonPackage = clone(SEASON_1_PACKAGE);
  delete seasonPackage.applicationConfig.designatedUnionId;
  const { scope, rendererCalls } = createValidScope({ seasonPackage });
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
  assert.deepStrictEqual(rendererCalls[0].applicationConfig.summary, {
    designatedUnionId: null
  });
});

runTest("renderer context receives exact summary service factory", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(rendererCalls[0].summaryServiceFactory, scope.createSummaryService);
});

runTest("renderer context receives exact server state service factory", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(rendererCalls[0].serverStateServiceFactory, scope.createServerStateService);
});

runTest("bootstrap composes persistence adapter service and controller in order", async () => {
  const bridge = {
    async loadEnvelope() {
      return null;
    },
    async saveEnvelope() {
      return undefined;
    }
  };
  const observed = {
    adapterBridge: null,
    persistenceArgs: null,
    controllerArg: null,
    clockValue: null,
    controllerInstance: null
  };

  const { scope, rendererCalls } = createValidScope({
    warMapPersistenceStorage: bridge,
    dependencies: {
      createElectronFileStorageAdapter(inputBridge) {
        observed.adapterBridge = inputBridge;
        return {
          async loadEnvelope() {
            return null;
          },
          async saveEnvelope() {
            return undefined;
          }
        };
      },
      createPersistenceService(args) {
        observed.persistenceArgs = args;
        observed.clockValue = args.clock();
        return {
          async load() {
            return { status: "missing" };
          },
          async save() {
            return { status: "saved" };
          }
        };
      },
      createServerStatePersistenceController({ persistenceService }) {
        observed.controllerArg = persistenceService;
        observed.controllerInstance = {
          initialize() {
            return Promise.resolve({ status: "missing" });
          },
          requestSave() {
            return Promise.resolve();
          }
        };
        return observed.controllerInstance;
      }
    }
  });

  const bootstrap = createApplicationBootstrap(scope);
  await bootstrap.bootstrapApplication();

  assert.strictEqual(observed.adapterBridge, bridge);
  assert.strictEqual(observed.persistenceArgs.storageAdapter.loadEnvelope instanceof Function, true);
  assert.strictEqual(observed.persistenceArgs.storageAdapter.saveEnvelope instanceof Function, true);
  assert.strictEqual(observed.persistenceArgs.serializeServerState, scope.serializeServerState);
  assert.strictEqual(observed.persistenceArgs.deserializePersistenceEnvelope, scope.deserializePersistenceEnvelope);
  assert.ok(observed.clockValue instanceof Date);
  assert.strictEqual(Number.isNaN(observed.clockValue.getTime()), false);
  assert.ok(observed.controllerArg);
  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(rendererCalls[0].serverStatePersistenceController, observed.controllerInstance);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(rendererCalls[0], "warMapPersistenceStorage"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(rendererCalls[0], "storageAdapter"), false);
});

runTest("legacy SEASON_1_DEFINITION is not used", async () => {
  const { scope, rendererCalls } = createValidScope();
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
  assert.strictEqual(rendererCalls[0].applicationConfig.map.dataUrl, "data/season1-map.json");
  assert.strictEqual(rendererCalls[0].applicationConfig.workspace.homeId, "command-centre");
});

runTest("invalid package prevents renderer initialization", async () => {
  const { scope, rendererCalls } = createValidScope();

  scope.validateSeasonPackage = () => ({
    valid: false,
    errors: [{ code: "BAD_PACKAGE", path: "packageIdentity", message: "Invalid" }],
    warnings: []
  });

  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(() => bootstrap.resolveBootstrapContext(), (error) => {
    assert.strictEqual(error.name, "SeasonPackageLoadError");
    assert.strictEqual(error.code, "PACKAGE_VALIDATION_FAILED");
    return true;
  });

  assert.strictEqual(rendererCalls.length, 0);
});

runTest("missing required dependency prevents renderer initialization", async () => {
  const { scope, rendererCalls } = createValidScope();
  delete scope.createOwnershipService;

  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(
    () => bootstrap.resolveBootstrapContext(),
    /createOwnershipService/
  );

  assert.strictEqual(rendererCalls.length, 0);
});

runTest("missing summary service factory prevents renderer initialization", async () => {
  const { scope, rendererCalls } = createValidScope();
  delete scope.createSummaryService;

  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(
    () => bootstrap.resolveBootstrapContext(),
    /createSummaryService/
  );

  assert.strictEqual(rendererCalls.length, 0);
});

runTest("missing server state service factory prevents renderer initialization", async () => {
  const { scope, rendererCalls } = createValidScope();
  delete scope.createServerStateService;

  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(
    () => bootstrap.resolveBootstrapContext(),
    /createServerStateService/
  );

  assert.strictEqual(rendererCalls.length, 0);
});

runTest("missing persistence dependencies and bridge prevent renderer initialization", async () => {
  const requiredFields = [
    "serializeServerState",
    "deserializePersistenceEnvelope",
    "createPersistenceService",
    "createElectronFileStorageAdapter",
    "createServerStatePersistenceController",
    "warMapPersistenceStorage"
  ];

  for (const field of requiredFields) {
    const { scope, rendererCalls } = createValidScope();
    delete scope[field];

    const bootstrap = createApplicationBootstrap(scope);
    await assert.rejects(() => bootstrap.resolveBootstrapContext(), new RegExp(field));
    assert.strictEqual(rendererCalls.length, 0);
  }
});

runTest("missing SEASON_1_PACKAGE prevents renderer initialization", async () => {
  const { scope, rendererCalls } = createValidScope();
  delete scope.SEASON_1_PACKAGE;

  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(
    () => bootstrap.resolveBootstrapContext(),
    /Application Bootstrap requires SEASON_1_PACKAGE\./
  );

  assert.strictEqual(rendererCalls.length, 0);
});

runTest("missing required application configuration prevents renderer initialization", async () => {
  const seasonPackage = clone(SEASON_1_PACKAGE);
  delete seasonPackage.applicationConfig.dataSources.mapDataUrl;

  const { scope, rendererCalls } = createValidScope({ seasonPackage });
  const bootstrap = createApplicationBootstrap(scope);

  await assert.rejects(() => bootstrap.resolveBootstrapContext(), (error) => {
    assert.strictEqual(error.name, "SeasonPackageLoadError");
    assert.strictEqual(error.code, "PACKAGE_VALIDATION_FAILED");
    return true;
  });

  assert.strictEqual(rendererCalls.length, 0);
});

runTest("loader and validation failures are reported through console.error", async () => {
  const { scope } = createValidScope();
  const consoleErrors = [];
  const originalConsoleError = console.error;

  scope.validateSeasonPackage = () => ({
    valid: false,
    errors: [{ code: "BAD_PACKAGE", path: "packageIdentity", message: "Invalid" }],
    warnings: []
  });

  console.error = (...args) => {
    consoleErrors.push(args);
  };

  try {
    const bootstrap = createApplicationBootstrap(scope);
    await bootstrap.bootstrapApplication();
  } finally {
    console.error = originalConsoleError;
  }

  assert.ok(consoleErrors.length > 0);
  assert.strictEqual(String(consoleErrors[0][0]).includes("Unable to start application bootstrap"), true);
});

runTest("package validation/loading and bootstrap do not mutate SEASON_1_PACKAGE", async () => {
  const seasonPackage = clone(SEASON_1_PACKAGE);
  const before = clone(seasonPackage);

  const { scope, rendererCalls } = createValidScope({ seasonPackage });
  const bootstrap = createApplicationBootstrap(scope);
  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 1);
  assert.deepStrictEqual(seasonPackage, before);
});

runTest("index.html loads canonical dependencies in order and no season1-definition startup script", () => {
  const indexPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(indexPath, "utf8");

  assert.ok(!html.includes('src="src/seasons/season1-definition.js"'));

  const expectedOrder = [
    'src="src/services/season-package-validator.js"',
    'src="src/services/season-loader.js"',
    'src="src/seasons/season1-package.js"',
    'src="src/services/game-rules-engine.js"',
    'src="src/services/union-registry-service.js"',
    'src="src/services/union-matching-service.js"',
    'src="src/services/union-server-season-relation-service.js"',
    'src="src/services/native-union-assignment-validator.js"',
    'src="src/services/native-union-assignment-service.js"',
    'src="src/services/active-union-status-validator.js"',
    'src="src/services/active-union-status-evaluator.js"',
    'src="src/services/active-union-status-service.js"',
    'src="src/services/combat-strength-observation-validator.js"',
    'src="src/services/combat-strength-observation-service.js"',
    'src="src/services/server-observation-validator.js"',
    'src="src/services/server-observation-service.js"',
    'src="src/services/ownership-record-validator.js"',
    'src="src/services/ownership-record-service.js"',
    'src="src/services/target-verification-validator.js"',
    'src="src/services/target-verification-service.js"',
    'src="src/services/confirmed-server-snapshot-validator.js"',
    'src="src/services/confirmed-server-snapshot-service.js"',
    'src="src/services/confirmed-server-snapshot-coordinator.js"',
    'src="src/services/snapshot-activity-fact-resolver.js"',
    'src="src/services/activity-fact-history-service.js"',
    'src="src/services/active-union-status-update-coordinator.js"',
    'src="src/services/active-union-status-projection-service.js"',
    'src="src/services/union-server-season-view-service.js"',
    'src="src/services/union-server-season-intelligence-view-service.js"',
    'src="src/services/server-intelligence-view-service.js"',
    'src="src/services/server-data-completeness-service.js"',
    'src="src/services/confirmed-snapshot-change-service.js"',
    'src="src/services/server-history-service.js"',
    'src="src/app/strategic-domain-module-registry.js"',
    'src="src/app/strategic-domain-runtime.js"',
    'src="src/services/evidence-asset-validator.js"',
    'src="src/services/evidence-asset-service.js"',
    'src="src/services/evidence-record-validator.js"',
    'src="src/services/evidence-record-service.js"',
    'src="src/app/evidence-domain-module-registry.js"',
    'src="src/app/evidence-domain-runtime.js"',
    'src="src/services/authorization-policy-service.js"',
    'src="src/services/atomic-operation-executor.js"',
    'src="src/services/union-registry-management-service.js"',
    'src="src/services/server-intelligence-management-service.js"',
    'src="src/services/union-registration-coordinator.js"',
    'src="src/services/evidence-management-service.js"',
    'src="src/services/proposal-review-management-service.js"',
    'src="src/services/review-queue-service.js"',
    'src="src/services/data-management-query-service.js"',
    'src="src/app/data-management-module-registry.js"',
    'src="src/app/data-management-runtime.js"',
    'src="src/services/ownership-service.js"',
    'src="src/services/server-state-service.js"',
    'src="src/services/persistence-state-serializer.js"',
    'src="src/services/persistence-service.js"',
    'src="src/services/electron-file-storage-adapter.js"',
    'src="src/app/server-state-persistence-controller.js"',
    'src="src/services/summary-service.js"',
    'src="src/map-renderer.js"',
    'src="src/app/application-bootstrap.js"'
  ];

  let lastIndex = -1;
  expectedOrder.forEach((scriptRef) => {
    const scriptIndex = html.indexOf(scriptRef);
    assert.ok(scriptIndex > -1, `Missing script ${scriptRef}`);
    assert.ok(scriptIndex > lastIndex, `Script order violation at ${scriptRef}`);
    lastIndex = scriptIndex;
  });
});

runTest("DOMContentLoaded path initializes renderer once after event", async () => {
  const documentStub = createDocumentStub("loading");
  const { scope, rendererCalls, documentStub: trackedDocument } = createValidScope({ document: documentStub });
  const bootstrap = createApplicationBootstrap(scope);

  await bootstrap.bootstrapApplication();

  assert.strictEqual(rendererCalls.length, 0);
  assert.strictEqual(trackedDocument.listeners.length, 1);
  assert.strictEqual(trackedDocument.listeners[0].eventName, "DOMContentLoaded");

  trackedDocument.listeners[0].handler();
  assert.strictEqual(rendererCalls.length, 1);
});

async function executeTests() {
  for (const test of runTest.tests) {
    try {
      await test.fn();
      process.stdout.write(`PASS ${test.name}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${test.name}\n`);
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

executeTests();
