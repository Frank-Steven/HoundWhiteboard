/**
 * @file 窗口管理模块
 * @module WindowManager
 * @description 功能包括:
 * - 窗口创建(标准窗口、全屏窗口、模态窗口)
 * - 窗口生命周期管理
 * - 窗口进程间通信(IPC)
 */

const { BrowserWindow } = require('electron');
const settingManager = require('./settingManager');

/**
 * 创建一个标准浏览器窗口
 * @function createWindow
 * @param {string} template - 模板文件名
 * @param {Object} [size] - 窗口尺寸配置
 * @param {number} [size.width=800] - 窗口宽度
 * @param {number} [size.height=600] - 窗口高度
 * @param {number} [size.minWidth=800] - 最小宽度
 * @param {number} [size.minHeight=600] - 最小高度
 * @returns {BrowserWindow} 浏览器窗口实例
 */
function createWindow(template, size = { width: 800, height: 600, minWidth: 800, minHeight: 600 }) {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    width: size.width,
    height: size.height,
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    autoHideMenuBar: true
  });
  win.loadFile(__dirname + '/../templates/html/' + template);

  win.webContents.on('did-finish-load', () => {
    const settings = settingManager.loadSettings();
    win.webContents.send('settings-loaded', settings);
  });
  return win;
}

/**
 * 创建一个全屏窗口
 * @function createFullScreenWindow
 * @param {string} template - 模板文件名
 * @returns {BrowserWindow} 浏览器窗口实例
 */
function createFullScreenWindow(template) {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInSubFrames: true
    },
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true
  });
  win.loadFile(__dirname + '/../templates/html/' + template);
  return win;
}

/**
 * 创建一个模态窗口(当前存在已知问题)
 * @function createModalWindow
 * @param {string} template - 模板文件名
 * @param {BrowserWindow} parent - 父窗口实例
 * @param {Object} [size] - 窗口尺寸配置
 * @param {number} [size.width=800] - 窗口宽度
 * @param {number} [size.height=600] - 窗口高度
 * @param {number} [size.minWidth=800] - 最小宽度
 * @param {number} [size.minHeight=600] - 最小高度
 * @returns {BrowserWindow} 模态窗口实例
 */
function createModalWindow(template, parent, size = { width: 800, height: 600, minWidth: 800, minHeight: 600 }) {
  const modalWin = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    width: size.width,
    height: size.height,
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    parent: parent,
    modal: true,
    autoHideMenuBar: true
  });
  modalWin.loadFile(__dirname + '/../templates/html/' + template);

  modalWin.webContents.on('did-finish-load', () => {
    const settings = settingManager.loadSettings();
    modalWin.webContents.send('settings-loaded', settings);
  });

  return modalWin;
}

/**
 * 设置窗口打开/关闭的IPC处理器
 * @function setupFileOpenCloseIPC
 * @param {Object} ipc - IPC主进程对象
 * @param {Object} windows - 窗口对象集合
 * @returns {void}
 */
function setupFileOpenCloseIPC(ipc, windows) {
  /**
   * 打开新窗口的IPC处理器
   * @event open-window
   * @listens ipc#open-window
   */
  ipc.on('open-window', (event, windowNew, windowNewHTML) => {
    windows[windowNew] = createWindow(windowNewHTML, {
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 600
    });
  });

  /**
   * 打开模态窗口的IPC处理器
   * @event open-modal-window
   * @listens ipc#open-modal-window
   */
  ipc.on('open-modal-window', (event, windowNow, windowNew, windowNewHTML) => {
    windows[windowNew] = createModalWindow(
      windowNewHTML,
      windows[windowNow],
      {
        width: 800,
        height: 600,
        minWidth: 800,
        minHeight: 600
      }
    );
  });

  /**
   * 关闭窗口的IPC处理器
   * @event close-window
   * @listens ipc#close-window
   */
  ipc.on('close-window', (event, windowNow) => {
    windows[windowNow].close();
  });
}

module.exports = {
  createWindow,
  createFullScreenWindow,
  createModalWindow,
  setupFileOpenCloseIPC
};
