const { contextBridge, ipcRenderer } = require("electron");

const PERSISTENCE_LOAD_ENVELOPE_CHANNEL = "persistence:load-envelope";
const PERSISTENCE_SAVE_ENVELOPE_CHANNEL = "persistence:save-envelope";
const STARTUP_RESULT_CHANNEL = "startup:get-result";

const persistenceApi = {
  loadEnvelope(identity) {
    return ipcRenderer.invoke(PERSISTENCE_LOAD_ENVELOPE_CHANNEL, identity);
  },
  runLegacyWrite(identity, envelope) {
    return ipcRenderer.invoke(PERSISTENCE_SAVE_ENVELOPE_CHANNEL, identity, envelope);
  }
};
contextBridge.exposeInMainWorld("warMapPersistenceStorage", persistenceApi);

const generationApi = {
  loadCommittedGeneration() {
    return ipcRenderer.invoke("generation:load-committed");
  },
  runGenerationWrite(payload) {
    return ipcRenderer.invoke("generation:commit", payload);
  }
};
contextBridge.exposeInMainWorld("warMapGenerationStorage", generationApi);

contextBridge.exposeInMainWorld("warMapEvidenceStorage", Object.freeze({
  selectAndImport() {
    return ipcRenderer.invoke("evidence:select-and-import");
  }
}));

contextBridge.exposeInMainWorld("warMapStartup", {
  getResult() {
    return ipcRenderer.invoke(STARTUP_RESULT_CHANNEL);
  }
});
