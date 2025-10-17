const { dialog } = require("electron");
const { directory } = require("../classes/io");

/**
 * 设置文件操作 IPC 通信
 * @param {Object} ipc - IPC 主进程对象
 * @param {Object} windows - 窗口对象集合
 */
function setupFileOperationIPC(ipc, windows) {
  ipc.handle("open-hwb-file", async (event, windowNow) => {
    // 调用系统默认打开文件对话框
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ["openFile"],
      filters: [
        { name: "All Files", extensions: ["*"] },
        { name: "HoundWhiteboard Files", extensions: ["hwb"] },
      ],
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  ipc.handle("open-hmq-file", async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ["openFile"],
      filters: [
        { name: "All Files", extensions: ["*"] },
        { name: "HoundWhiteboard Module Quark Files", extensions: ["hmq"] },
      ],
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  ipc.handle("open-img-file", async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ["openFile"],
      filters: [
        {
          name: "Image Files",
          extensions: [
            "jpg",
            "jpeg",
            "png",
            "gif",
            "bmp",
            "ico",
            "tif",
            "tiff",
            "svg",
            "webp",
            "apng",
            "avif",
          ],
        },
      ],
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  ipc.handle("path-choose", async (event) => {
    const result = await dialog.showOpenDialog(windows["NewFile"], {
      properties: ["openDirectory"], // 仅选择目录,无文件过滤
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });
}

let userDataDir, settingsFile;
const defaultSettings = { theme: "light", language: "zh-CN" };

/**
 * 初始化 IO 管理器
 * @param {Object} app - Electron app 对象
 */
function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataDir = directory.parse(app.getPath("userData"));
  settingsFile = userDataDir.peek("settings", "json").existOrWriteJSON(defaultSettings);
}

/**
 * 读取设置文件
 * @returns {Object} 设置对象
 */
function loadSettings() {
  return settingsFile.existOrWriteJSON(defaultSettings).catJSON();
}

/**
 * 保存设置文件
 * @param {Object} settings - 设置对象
 * @param {string} settings.theme - 主题
 * @param {string} settings.language - 语言
 */
function saveSettings(settings) {
  try {
    settingsFile.writeJSON(settings);
    console.log("Settings saved successfully");
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

/**
 * 设置设置相关的 IPC 通信
 * @param {Object} ipc - IPC 主进程对象
 * @param {Object} BrowserWindow - BrowserWindow 对象
 */
function setupSettingsIPC(ipc, BrowserWindow) {
  ipc.handle('get-current-settings', async () => { return loadSettings(); });

  ipc.on("settings-changed", (event, settings) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("settings-changed", settings);
    });
    saveSettings(settings);
  });
}

module.exports = {
  init,
  loadSettings,
  saveSettings,
  setupSettingsIPC,
  setupFileOperationIPC,
};
