/**
 * @file 设置管理模块
 * @module settings-manager
 * @description 功能:
 * - 应用设置持久化
 * - 文件操作对话框 (打开/保存)
 * - 设置变更通知
 * @author Steven
 */

const { directory, file } = require("../utils/io");
const {
  userDataDirectory,
  DocumentsDirectory,
} = require("../utils/usr");

/**
 * 默认设置
 * 语言
 * 界面尺寸
 * 字体大小
 * 字体系列
 * 深浅色模式
 * 浅色主题
 * 深色主题
 * 白板文件默认存储位置
 */
const defaultSettings = {
  language: "zh-CN",
  uiSize: "default",
  fontSize: 16,
  fontSeries: "Arial",
  colorMode: "light",
  lightTheme: "hound-light",
  darkTheme: "hound-dark",
  whiteboardDir: DocumentsDirectory.getPath(),
};

/**
 * 从文件加载设置
 * @function loadSettings
 * @returns {Object} 设置对象
 */
function loadSettings() {
  return userDataDirectory
    .peek("settings", "json")
    .existOrWriteJSON(defaultSettings)
    .catJSON();
}

/**
 * 保存设置到文件
 * @function saveSettings
 * @param {Object} settings - 要保存的设置对象
 * @param {string} settings.language - 当前语言
 * @param {string} settings.uiSize - 当前界面尺寸
 * @param {number} settings.fontSize - 当前字体大小
 * @param {string} settings.fontSeries - 当前字体系列
 * @param {string} settings.colorMode - 当前深浅色模式
 * @param {string} settings.lightTheme - 当前浅色主题
 * @param {string} settings.darkTheme - 当前深色主题
 * @param {string} settings.whiteboardDir - 当前白板文件默认存储位置
 */
function saveSettings(settings) {
  try {
    userDataDirectory.peek("settings", "json").writeJSON(settings);
  } catch (err) {
    console.error("保存设置时出错:", err);
  }
}

/**
 * 设置与设置相关的IPC处理器
 * @function setupSettingsIPC
 * @param {Object} ipc - IPC主进程对象
 * @param {Object} BrowserWindow - BrowserWindow类
 */
function setupSettingsIPC(ipc, BrowserWindow) {
  /**
   * 获取当前设置的IPC处理器
   * @event get-current-settings
   * @listens ipc#get-current-settings
   */
  ipc.handle("get-current-settings", async () => {
    return loadSettings();
  });

  /**
   * 设置变更的IPC处理器
   * @event settings-changed
   * @listens ipc#settings-changed
   */
  ipc.on("settings-changed", (event, settings) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("settings-changed", settings);
    });
    saveSettings(settings);
  });
}

module.exports = {
  loadSettings,
  saveSettings,
  setupSettingsIPC,
};
