(function initializeApplicationPersistenceFacade(globalScope) {
  function createApplicationPersistenceFacade(options) {
    const input = options && typeof options === "object" ? options : null;
    if (!input || !input.coordinator || typeof input.coordinator.load !== "function"
        || typeof input.coordinator.execute !== "function"
        || typeof input.coordinator.commitCurrent !== "function") {
      throw new TypeError("Application Persistence Facade requires a coordinator.");
    }

    let recoveryState = null;
    let lastError = null;

    async function load(startupInput) {
      const result = await input.coordinator.load(startupInput);
      recoveryState = result && (result.status === "recovery_required"
        || result.status === "corrupt"
        || result.status === "unsafe_legacy"
        ? result
        : null);
      return result;
    }

    async function execute(mutate, auditIntent) {
      if (recoveryState) {
        const error = new Error(`Persistence recovery is required before changes can be made (${recoveryState.reason}).`);
        error.code = "recovery_required";
        error.recoveryState = recoveryState;
        throw error;
      }
      try {
        const result = await input.coordinator.execute(mutate, auditIntent);
        lastError = null;
        return result;
      } catch (error) {
        lastError = {
          code: error && error.code ? error.code : "commit_failed",
          message: error && error.message ? error.message : String(error),
          recoverable: true
        };
        throw Object.assign(new Error(`The change was not saved and was rolled back. ${lastError.message}`), {
          code: lastError.code,
          recoverable: true,
          cause: error
        });
      }
    }

    async function commitCurrent() {
      if (recoveryState) {
        const error = new Error("Persistence recovery is required before changes can be saved.");
        error.code = "recovery_required";
        throw error;
      }
      try {
        const result = await input.coordinator.commitCurrent();
        lastError = null;
        return result;
      } catch (error) {
        lastError = { code: "commit_failed", message: error.message || String(error), recoverable: true };
        throw error;
      }
    }

    async function repairOwnershipProjection(inputValue) {
      if (recoveryState) return { status: "recovery_required", reason: recoveryState.reason };
      if (typeof input.coordinator.repairOwnershipProjection !== "function") {
        return { status: "recovery_required", reason: "projection_repair_unavailable" };
      }
      try {
        const result = await input.coordinator.repairOwnershipProjection(inputValue);
        lastError = null;
        return result;
      } catch (error) {
        lastError = {
          code: error && error.code ? error.code : "commit_failed",
          message: error && error.message ? error.message : String(error),
          recoverable: true
        };
        throw Object.assign(new Error(`The ownership projection repair was not saved and was rolled back. ${lastError.message}`), {
          code: lastError.code,
          recoverable: true,
          cause: error
        });
      }
    }

    return Object.freeze({
      load,
      execute,
      commitCurrent,
      repairOwnershipProjection,
      isRecoveryRequired: () => recoveryState !== null,
      getRecoveryState: () => recoveryState,
      getLastError: () => lastError
    });
  }

  globalScope.createApplicationPersistenceFacade = createApplicationPersistenceFacade;
  if (typeof module !== "undefined" && module.exports) module.exports = { createApplicationPersistenceFacade };
}(typeof window !== "undefined" ? window : globalThis));