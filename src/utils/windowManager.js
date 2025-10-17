const { BrowserWindow } = require("electron");
const IOManager = require("./IOManager");

/**
 * 创建窗口
 * @param {string} template - 模板文件名
 * @param {Object} size - 窗口尺寸配置
 * @param {number} size.width - 窗口宽度
 * @param {number} size.height - 窗口高度
 * @param {number} size.minWidth - 最小宽度
 * @param {number} size.minHeight - 最小高度
 * @returns {BrowserWindow} 浏览器窗口对象
 */
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

/**
 * 创建全屏窗口
 * @param {string} template - 模板文件名
 * @returns {BrowserWindow} 浏览器窗口对象
 */
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

/**
 * 创建模态窗口
 * @param {string} template - 模板文件名
 * @param {BrowserWindow} parent - 父窗口对象
 * @param {Object} size - 窗口尺寸配置
 * @param {number} size.width - 窗口宽度
 * @param {number} size.height - 窗口高度
 * @param {number} size.minWidth - 最小宽度
 * @param {number} size.minHeight - 最小高度
 * @returns {BrowserWindow} 模态窗口对象
 */
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
