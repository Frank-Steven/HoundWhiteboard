const { BrowserWindow } = require("electron");
const IOManager = require("./IOManager");

function createWindow(template, size = { width: 800, height: 600, minWidth: 800, minHeight: 600 }) {
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(__dirname + "/../templates/html/" + template);
  // win.webContents.openDevTools();

  win.webContents.on("did-finish-load", () => {
    const settings = IOManager.loadSettings();
    win.webContents.send("settings-loaded", settings);
  });
  return win;
}

function createFullScreenWindow(template) {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInSubFrames: true,
    },
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
  });
  win.loadFile(__dirname + "/../templates/html/" + template);
  return win;
}

function createModalWindow(template, parent, size = { width: 800, height: 600, minWidth: 800, minHeight: 600 }) {
  const modalWin = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    parent: parent,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  modalWin.loadFile(__dirname + "/../templates/html/" + template);

  modalWin.webContents.on("did-finish-load", () => {
    const settings = IOManager.loadSettings();
    modalWin.webContents.send("settings-loaded", settings);
  });

  return modalWin;
}

module.exports = {
  createWindow,
  createFullScreenWindow,
  createModalWindow,
};
