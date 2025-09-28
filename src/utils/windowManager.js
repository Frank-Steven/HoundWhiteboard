const { BrowserWindow } = require("electron");

function createWindow(template, width, height, minWidth, minHeight, settingsManager) {
  const win = new BrowserWindow({
    width: width,
    height: height,
    minWidth: minWidth,
    minHeight: minHeight,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(__dirname + "/../templates/" + template);
  // win.webContents.openDevTools();

  win.webContents.on("did-finish-load", () => {
    const settings = settingsManager.loadSettings();
    console.log(settings);
    win.webContents.send("settings-loaded", settings);
  });
  return win;
}

function createFullScreenWindow(template) {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
  });
  win.loadFile(__dirname + "/../templates/" + template);
  return win;
}

function createModalWindow(template, width = 800, height = 600, minWidth = 800, minHeight = 600, parent, settingsManager) {
  const modalWin = new BrowserWindow({
    width: width,
    height: height,
    minWidth: minWidth,
    minHeight: minHeight,
    parent: parent,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  modalWin.loadFile(__dirname + "/../templates/" + template);

  modalWin.webContents.on("did-finish-load", () => {
    const settings = settingsManager.loadSettings();
    console.log(settings);
    modalWin.webContents.send("settings-loaded", settings);
  });

  return modalWin;
}

module.exports = {
  createWindow,
  createFullScreenWindow,
  createModalWindow,
};