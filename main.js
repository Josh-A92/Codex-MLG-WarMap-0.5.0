const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const { createPersistenceFileStore } = require("./src/main/persistence-file-store.js");
const { createGenerationStore } = require("./src/main/generation-store.js");
const { createGenerationStorageHandlers } = require("./src/main/generation-storage-ipc.js");
const { PERSISTENCE_IPC_CHANNELS } = require("./src/shared/persistence-ipc-channels.js");

const persistenceStoreDirectory = path.join(app.getPath("userData"), "warmap-state");
const fileStore = createPersistenceFileStore({
  baseDirectory: persistenceStoreDirectory
});
const generationHandlers = createGenerationStorageHandlers(createGenerationStore({
  baseDirectory: path.join(persistenceStoreDirectory, "generations")
}));

function registerPersistenceHandlers() {
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.LOAD_ENVELOPE, (_event, identity) => {
    return fileStore.loadEnvelope(identity);
  });

  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.SAVE_ENVELOPE, (_event, identity, envelope) => {
    return fileStore.saveEnvelope(identity, envelope);
  });
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.LOAD_COMMITTED_GENERATION, () => {
    return generationHandlers.loadCommittedGeneration();
  });
  ipcMain.handle(PERSISTENCE_IPC_CHANNELS.COMMIT_GENERATION, (_event, payload) => {
    return generationHandlers.commitGeneration(payload);
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
  createWindow();
});