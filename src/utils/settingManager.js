/**
 * @file Settings management module
 * @module SettingManager
 * @description Handles:
 * - Application settings persistence
 * - File operation dialogs (open/save)
 * - Settings change notifications
 */

const { dialog } = require('electron');
const { directory } = require('../classes/io');

let userDataDir, settingsFile;
const defaultSettings = { theme: 'light', language: 'zh-CN' };

/**
 * Sets up file operation IPC handlers
 * @function setupFileOperationIPC
 * @param {Object} ipc - IPC main process object
 * @param {Object} windows - Collection of window objects
 * @returns {void}
 */
function setupFileOperationIPC(ipc, windows) {
  /**
   * IPC handler for opening HWB files
   * @event open-hwb-file
   * @listens ipc#open-hwb-file
   */
  ipc.handle('open-hwb-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'HoundWhiteboard Files', extensions: ['hwb'] }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * IPC handler for opening HMQ files
   * @event open-hmq-file
   * @listens ipc#open-hmq-file
   */
  ipc.handle('open-hmq-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'HoundWhiteboard Module Quark Files', extensions: ['hmq'] }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * IPC handler for opening image files
   * @event open-img-file
   * @listens ipc#open-img-file
   */
  ipc.handle('open-img-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        {
          name: 'Image Files',
          extensions: [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 
            'tif', 'tiff', 'svg', 'webp', 'apng', 'avif'
          ]
        }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * IPC handler for choosing directory path
   * @event path-choose
   * @listens ipc#path-choose
   */
  ipc.handle('path-choose', async (event) => {
    const result = await dialog.showOpenDialog(windows['NewFile'], {
      properties: ['openDirectory']
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });
}

/**
 * Initializes the settings manager
 * @function init
 * @param {Object} app - Electron app object
 * @returns {void}
 */
function init(app) {
  userDataDir = directory.parse(app.getPath('userData'));
  settingsFile = userDataDir.peek('settings', 'json').existOrWriteJSON(defaultSettings);
}

/**
 * Loads settings from file
 * @function loadSettings
 * @returns {Object} Settings object
 */
function loadSettings() {
  return settingsFile.existOrWriteJSON(defaultSettings).catJSON();
}

/**
 * Saves settings to file
 * @function saveSettings
 * @param {Object} settings - Settings object to save
 * @param {string} settings.theme - Current theme
 * @param {string} settings.language - Current language
 * @returns {void}
 */
function saveSettings(settings) {
  try {
    settingsFile.writeJSON(settings);
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

/**
 * Sets up settings-related IPC handlers
 * @function setupSettingsIPC
 * @param {Object} ipc - IPC main process object
 * @param {Object} BrowserWindow - BrowserWindow class
 * @returns {void}
 */
function setupSettingsIPC(ipc, BrowserWindow) {
  /**
   * IPC handler for getting current settings
   * @event get-current-settings
   * @listens ipc#get-current-settings
   */
  ipc.handle('get-current-settings', async () => {
    return loadSettings();
  });

  /**
   * IPC handler for settings changed
   * @event settings-changed
   * @listens ipc#settings-changed
   */
  ipc.on('settings-changed', (event, settings) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('settings-changed', settings);
    });
    saveSettings(settings);
  });
}

module.exports = {
  init,
  loadSettings,
  saveSettings,
  setupSettingsIPC,
  setupFileOperationIPC
};
