const { contextBridge, ipcRenderer } = require("electron");
const { PERSISTENCE_IPC_CHANNELS } = require("./src/shared/persistence-ipc-channels.js");

contextBridge.exposeInMainWorld("warMapPersistenceStorage", {
  loadEnvelope(identity) {
    return ipcRenderer.invoke(PERSISTENCE_IPC_CHANNELS.LOAD_ENVELOPE, identity);
  },
  saveEnvelope(identity, envelope) {
    return ipcRenderer.invoke(PERSISTENCE_IPC_CHANNELS.SAVE_ENVELOPE, identity, envelope);
  }
});
