/**
 * @file Window management module
 * @module WindowManager
 * @description Handles:
 * - Window creation (normal, fullscreen, modal)
 * - Window lifecycle management
 * - Window IPC communication
 */

const { BrowserWindow } = require('electron');
const settingManager = require('./settingManager');

/**
 * Creates a standard browser window
 * @function createWindow
 * @param {string} template - Template filename
 * @param {Object} [size] - Window size configuration
 * @param {number} [size.width=800] - Window width
 * @param {number} [size.height=600] - Window height
 * @param {number} [size.minWidth=800] - Minimum width
 * @param {number} [size.minHeight=600] - Minimum height
 * @returns {BrowserWindow} Browser window instance
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
 * Creates a fullscreen window
 * @function createFullScreenWindow
 * @param {string} template - Template filename
 * @returns {BrowserWindow} Browser window instance
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
 * Creates a modal window (currently has known issues)
 * @function createModalWindow
 * @param {string} template - Template filename
 * @param {BrowserWindow} parent - Parent window instance
 * @param {Object} [size] - Window size configuration
 * @param {number} [size.width=800] - Window width
 * @param {number} [size.height=600] - Window height
 * @param {number} [size.minWidth=800] - Minimum width
 * @param {number} [size.minHeight=600] - Minimum height
 * @returns {BrowserWindow} Modal window instance
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
 * Sets up window open/close IPC handlers
 * @function setupFileOpenCloseIPC
 * @param {Object} ipc - IPC main process object
 * @param {Object} windows - Collection of window objects
 * @returns {void}
 */
function setupFileOpenCloseIPC(ipc, windows) {
  /**
   * IPC handler for opening a new window
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
   * IPC handler for opening a modal window
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
   * IPC handler for closing a window
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
