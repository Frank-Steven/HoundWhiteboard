const fs = require("fs");
const path = require("path");

let settingsPath;

function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  const userDataPath = app.getPath("userData");
  settingsPath = path.join(userDataPath, "settings.json");
}

// 读取设置文件
function loadSettings() {
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, "utf-8");
    return JSON.parse(data);
  } else {
    // 如果文件不存在，创建默认设置
    const defaultSettings = { theme: "light", language: "zh-CN" };
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log("Settings saved successfully");
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

function setupSettingsIPC(ipc, BrowserWindow) {
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
};
