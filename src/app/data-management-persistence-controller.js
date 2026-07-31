(function initializeDataManagementPersistenceControllerFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["persistenceService"]);

  class DataManagementPersistenceControllerError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "DataManagementPersistenceControllerError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new DataManagementPersistenceControllerError(code, message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function createDataManagementPersistenceController(options) {
    if (!isRecord(options)) {
      fail("invalid_factory", "Data Management Persistence Controller requires options.");
    }
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Data Management Persistence Controller does not recognize options.${unknown[0]}.`);
    }
    if (!Object.prototype.hasOwnProperty.call(options, "persistenceService")) {
      fail("invalid_factory", "Data Management Persistence Controller requires options.persistenceService.");
    }
    const persistence = options.persistenceService;
    if (persistence === null || typeof persistence !== "object" || Array.isArray(persistence)) {
      fail("invalid_factory", "Data Management Persistence Controller requires a persistence service.");
    }
    if (typeof persistence.load !== "function" || typeof persistence.save !== "function") {
      fail("invalid_factory", "Data Management Persistence Controller requires persistence load and save methods.");
    }
    const load = persistence.load.bind(persistence);
    const save = persistence.save.bind(persistence);

    let initialized = false;
    let initializing = false;
    let retainedState = null;
    let saveTail = Promise.resolve();

    async function initialize(input) {
      if (initialized) {
        fail("already_initialized", "Data Management Persistence Controller is already initialized.");
      }
      if (initializing) {
        fail("initialization_in_progress", "Data Management Persistence Controller initialization is in progress.");
      }
      initializing = true;
      try {
        const result = await load(input);
        if (
          !result
          || typeof result !== "object"
          || !result.unionRegistryService
          || !result.strategicDomainRuntime
          || !result.evidenceDomainRuntime
        ) {
          fail("invalid_load_result", "Data Management persistence returned an invalid runtime set.");
        }
        retainedState = {
          seasonId: input.seasonId,
          unionRegistryService: result.unionRegistryService,
          strategicDomainRuntime: result.strategicDomainRuntime,
          evidenceDomainRuntime: result.evidenceDomainRuntime
        };
        initialized = true;
        return result;
      } finally {
        initializing = false;
      }
    }

    function requestSave() {
      if (!initialized || retainedState === null) {
        return Promise.reject(new DataManagementPersistenceControllerError(
          "not_initialized",
          "Data Management Persistence Controller is not initialized."
        ));
      }
      const queued = saveTail.then(
        () => save(retainedState),
        () => save(retainedState)
      );
      saveTail = queued.catch(() => undefined);
      return queued;
    }

    function flush() {
      return saveTail;
    }

    function isInitialized() {
      return initialized;
    }

    return Object.freeze({
      initialize,
      requestSave,
      flush,
      isInitialized
    });
  }

  const exportsObject = {
    createDataManagementPersistenceController,
    DataManagementPersistenceControllerError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
