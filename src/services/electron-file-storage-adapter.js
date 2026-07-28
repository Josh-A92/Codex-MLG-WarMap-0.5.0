(function initializeElectronFileStorageAdapter(globalScope) {
  function isValidBridge(value) {
    return value !== null
      && typeof value === "object"
      && !Array.isArray(value)
      && typeof value.loadEnvelope === "function"
      && typeof value.saveEnvelope === "function";
  }

  function createElectronFileStorageAdapter(bridge) {
    if (!isValidBridge(bridge)) {
      throw new TypeError("createElectronFileStorageAdapter requires a bridge object with loadEnvelope and saveEnvelope functions.");
    }

    const loadEnvelope = bridge.loadEnvelope.bind(bridge);
    const saveEnvelope = bridge.saveEnvelope.bind(bridge);

    return {
      async loadEnvelope(identity) {
        return loadEnvelope(identity);
      },
      async saveEnvelope(identity, envelope) {
        return saveEnvelope(identity, envelope);
      }
    };
  }

  globalScope.createElectronFileStorageAdapter = createElectronFileStorageAdapter;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createElectronFileStorageAdapter
    };
  }
})(globalThis);
