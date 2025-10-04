const {BrowserWindow} = require("electron");
const IOManager = require("./IOManager");
const fs = require("fs");
const path = require("path");
const hidefile = require('hidefile');

function createWindow(
  template,
  size = {width: 800, height: 600, minWidth: 800, minHeight: 600}
) {
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
  win.loadFile(__dirname + "/../templates/" + template);
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
    },
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
  });
  win.loadFile(__dirname + "/../templates/" + template);
  console.log(__dirname + "/../templates/" + template);
  return win;
}

function createModalWindow(
  template,
  parent,
  size = {width: 800, height: 600, minWidth: 800, minHeight: 600}
) {
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
  modalWin.loadFile(__dirname + "/../templates/" + template);

  modalWin.webContents.on("did-finish-load", () => {
    const settings = IOManager.loadSettings();
    modalWin.webContents.send("settings-loaded", settings);
  });

  return modalWin;
}

function openBoard(filePath) {
  let win = createFullScreenWindow("../templates/full-screen.html");
  console.log("open board: " + filePath);

  let fileDir = filePath.replace(".hwb", "");
  let tempDir = path.join(path.dirname(fileDir), "." + path.basename(fileDir));
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
  IOManager.extractFile(filePath, fileDir);
  hidefile.hideSync(fileDir);
  // 在 win 完成加载时，给它发 ipc，内容为 tempDir
  win.webContents.on("did-finish-load", () => {
    // setTimeout(() => {
    // }, 100);
    win.webContents.send("board-opened", tempDir); // 发送 tempDir 给渲染进程
  });
  return win;
}

module.exports = {
  createWindow,
  createFullScreenWindow,
  createModalWindow,
  openBoard,
};
