(function initializeServerStatePersistenceController(globalScope) {
  function isNonNullObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireFunction(value, fieldPath) {
    if (typeof value !== "function") {
      throw new TypeError(`createServerStatePersistenceController requires ${fieldPath} to be a function.`);
    }

    return value;
  }

  class ServerStatePersistenceControllerError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ServerStatePersistenceControllerError";
      this.code = code;
    }
  }

  function createControllerError(code, message) {
    return new ServerStatePersistenceControllerError(code, message);
  }

  function createServerStatePersistenceController(dependencies) {
    const resolvedDependencies = dependencies || {};

    if (!isNonNullObject(resolvedDependencies)) {
      throw new TypeError("createServerStatePersistenceController requires a dependency object.");
    }

    if (!isNonNullObject(resolvedDependencies.persistenceService)) {
      throw new TypeError("createServerStatePersistenceController requires persistenceService to be an object.");
    }

    const persistenceService = resolvedDependencies.persistenceService;
    const load = requireFunction(persistenceService.load, "persistenceService.load").bind(persistenceService);
    const save = requireFunction(persistenceService.save, "persistenceService.save").bind(persistenceService);

    let initialized = false;
    let initializing = false;
    let retainedServerStateService = null;
    let saveExecutionChain = Promise.resolve();
    let lastQueuedSave = null;

    async function initialize(serverStateService) {
      if (initialized) {
        throw createControllerError(
          "ALREADY_INITIALIZED",
          "Server state persistence controller has already been initialized."
        );
      }

      if (initializing) {
        throw createControllerError(
          "INITIALIZATION_IN_PROGRESS",
          "Server state persistence controller initialization is already in progress."
        );
      }

      initializing = true;

      try {
        const result = await load(serverStateService);
        retainedServerStateService = serverStateService;
        initialized = true;
        return result;
      } finally {
        initializing = false;
      }
    }

    function requestSave() {
      if (!initialized) {
        return Promise.reject(createControllerError(
          "NOT_INITIALIZED",
          "Server state persistence controller must be initialized before requesting save."
        ));
      }

      const savePromise = saveExecutionChain.then(() => save(retainedServerStateService));
      saveExecutionChain = savePromise.then(
        () => undefined,
        () => undefined
      );
      lastQueuedSave = savePromise;

      return savePromise;
    }

    function flush() {
      if (!lastQueuedSave) {
        return Promise.resolve();
      }

      return lastQueuedSave;
    }

    function isInitialized() {
      return initialized;
    }

    return {
      initialize,
      requestSave,
      flush,
      isInitialized
    };
  }

  globalScope.ServerStatePersistenceControllerError = ServerStatePersistenceControllerError;
  globalScope.createServerStatePersistenceController = createServerStatePersistenceController;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ServerStatePersistenceControllerError,
      createServerStatePersistenceController
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
