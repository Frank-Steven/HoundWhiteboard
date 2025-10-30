/**
 * @file 设置管理模块
 * @module SettingManager
 * @description 功能包括:
 * - 应用设置持久化
 * - 文件操作对话框(打开/保存)
 * - 设置变更通知
 */

const { dialog } = require('electron');
const { directory } = require('../classes/io');

let userDataDir, settingsFile;
const defaultSettings = { theme: 'light', language: 'zh-CN' };

/**
 * 设置文件操作IPC处理器
 * @function setupFileOperationIPC
 * @param {Object} ipc - IPC主进程对象
 * @param {Object} windows - 窗口对象集合
 * @returns {void}
 */
function setupFileOperationIPC(ipc, windows) {
  /**
   * 打开HWB文件的IPC处理器
   * @event open-hwb-file
   * @listens ipc#open-hwb-file
   */
  ipc.handle('open-hwb-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: 'HoundWhiteboard文件', extensions: ['hwb'] }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * 打开HMQ文件的IPC处理器
   * @event open-hmq-file
   * @listens ipc#open-hmq-file
   */
  ipc.handle('open-hmq-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: 'HoundWhiteboard模块文件', extensions: ['hmq'] }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * 打开图片文件的IPC处理器
   * @event open-img-file
   * @listens ipc#open-img-file
   */
  ipc.handle('open-img-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        {
          name: '图片文件',
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
   * 选择目录路径的IPC处理器
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
 * 初始化设置管理器
 * @function init
 * @param {Object} app - Electron应用对象
 * @returns {void}
 */
function init(app) {
  userDataDir = directory.parse(app.getPath('userData'));
  settingsFile = userDataDir.peek('settings', 'json').existOrWriteJSON(defaultSettings);
}

/**
 * 从文件加载设置
 * @function loadSettings
 * @returns {Object} 设置对象
 */
function loadSettings() {
  return settingsFile.existOrWriteJSON(defaultSettings).catJSON();
}

/**
 * 保存设置到文件
 * @function saveSettings
 * @param {Object} settings - 要保存的设置对象
 * @param {string} settings.theme - 当前主题
 * @param {string} settings.language - 当前语言
 * @returns {void}
 */
function saveSettings(settings) {
  try {
    settingsFile.writeJSON(settings);
  } catch (err) {
    console.error('保存设置时出错:', err);
  }
}

/**
 * 设置与设置相关的IPC处理器
 * @function setupSettingsIPC
 * @param {Object} ipc - IPC主进程对象
 * @param {Object} BrowserWindow - BrowserWindow类
 * @returns {void}
 */
function setupSettingsIPC(ipc, BrowserWindow) {
  /**
   * 获取当前设置的IPC处理器
   * @event get-current-settings
   * @listens ipc#get-current-settings
   */
  ipc.handle('get-current-settings', async () => {
    return loadSettings();
  });

  /**
   * 设置变更的IPC处理器
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
