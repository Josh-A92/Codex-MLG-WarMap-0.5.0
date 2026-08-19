const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const { createPersistenceFileStore } = require("./src/main/persistence-file-store.js");
const { createGenerationStore } = require("./src/main/generation-store.js");
const { createGenerationStorageHandlers } = require("./src/main/generation-storage-ipc.js");
const { createEvidenceFileStore } = require("./src/main/evidence-file-store.js");
const { createEvidenceStorageHandlers } = require("./src/main/evidence-storage-ipc.js");
const { createStartupPersistenceGate } = require("./src/main/startup-persistence-gate.js");
const { createWarmapElectronStartup } = require("./src/main/warmap-electron-startup.js");
const { PERSISTENCE_IPC_CHANNELS } = require("./src/shared/persistence-ipc-channels.js");

const persistenceStoreDirectory = path.join(app.getPath("userData"), "warmap-state");
const fileStore = createPersistenceFileStore({
  baseDirectory: persistenceStoreDirectory
});
const generationStore = createGenerationStore({
  baseDirectory: path.join(persistenceStoreDirectory, "generations")
});
const evidenceStorageHandlers = createEvidenceStorageHandlers({
  dialog,
  evidenceFileStore: createEvidenceFileStore({ rootDirectory: persistenceStoreDirectory })
});
const generationHandlers = createGenerationStorageHandlers({
  loadCommittedGeneration: generationStore.loadCommittedGeneration,
  async runGenerationWrite(payload) {
    return startupGate.writeGeneration(() => generationStore.commit(payload));
  }
});
const startupGate = createStartupPersistenceGate();
let startupResult = null;

function registerPersistenceHandlers() {
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.LOAD_ENVELOPE, (_event, identity) => {
    return fileStore.loadEnvelope(identity);
  });

  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.SAVE_ENVELOPE, (_event, identity, envelope) => {
    return startupGate.writeLegacy(() => fileStore.saveEnvelope(identity, envelope));
  });
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.GET_STARTUP_RESULT, () => structuredClone(startupResult));
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.LOAD_COMMITTED_GENERATION, () => {
    return generationHandlers.loadCommittedGeneration();
  });
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.COMMIT_GENERATION, (_event, payload) => {
    return generationHandlers.commitGeneration(payload);
  });
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.SELECT_AND_IMPORT_EVIDENCE, () => {
    return evidenceStorageHandlers.selectAndImportEvidence();
  });
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "MLG WarMap",
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.maximize();
}

app.whenReady().then(() => {
  registerPersistenceHandlers();
  const readiness = createWarmapElectronStartup({ generationStore, fileStore });
  return readiness.resolve().then((result) => {
    startupResult = structuredClone(result);
    startupGate.settle(startupResult);
    if (startupResult.persistenceMode === "unavailable") {
      const error = new Error(`Trusted startup refused (${startupResult.reason}).`);
      error.code = "startup_blocked";
      throw error;
    }
    createWindow();
  });
}).catch((error) => {
  console.error("Unable to complete trusted startup.", error);
});
