const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

function createWindow() {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "MLG WarMap",
    backgroundColor: "#111111",
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.maximize();
}

app.whenReady().then(createWindow);