const { contextBridge, ipcRenderer } = require("electron");

const PERSISTENCE_LOAD_ENVELOPE_CHANNEL = "persistence:load-envelope";
const PERSISTENCE_SAVE_ENVELOPE_CHANNEL = "persistence:save-envelope";

contextBridge.exposeInMainWorld("warMapPersistenceStorage", {
  loadEnvelope(identity) {
    return ipcRenderer.invoke(PERSISTENCE_LOAD_ENVELOPE_CHANNEL, identity);
  },
  saveEnvelope(identity, envelope) {
    return ipcRenderer.invoke(PERSISTENCE_SAVE_ENVELOPE_CHANNEL, identity, envelope);
  }
});
