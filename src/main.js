const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
let winMainMenu, winNewFile, win;
const ipc = require("electron").ipcMain;
function createWindow(template, width, height, minWidth, minHeight) {
  win = new BrowserWindow({
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
  win.loadFile(__dirname + "/templates/" + template);
  // win.webContents.openDevTools();

  win.webContents.on("did-finish-load", () => {
    const settings = loadSettings();
    console.log(settings);
    win.webContents.send("settings-loaded", settings);
  });
  return win;
}
function createFullScreenWindow(template) {
  win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
  });
  win.loadFile(__dirname + "/templates/" + template);
  return win;
}

// 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
const userDataPath = app.getPath("userData");
const settingsPath = path.join(userDataPath, "settings.json");

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

app.whenReady().then(() => {
  winMainMenu = createWindow("main-menu.html", 800, 600, 800, 600);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      winMainMenu = createWindow("main-menu.html", 800, 600);
    }
  });
});

ipc.on("new-file", () => {
  winNewFile = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    parent: winMainMenu,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  winNewFile.loadFile(__dirname + "/templates/new-file.html");
  
  winNewFile.webContents.on("did-finish-load", () => {
    const settings = loadSettings();
    console.log(settings);
    winNewFile.webContents.send("settings-loaded", settings);
  });
});

ipc.on("new-file-edit", () => {
  winNewFile = createWindow("new-file-edit.html", 800, 600, 800, 600);
});

ipc.on("open-file", () => {
  // 调用系统默认打开文件对话框
  const { dialog } = require("electron");
  dialog
    .showOpenDialog(winMainMenu, {
      properties: ["openFile"],
      filters: [
        { name: "All Files", extensions: ["*"] },
        { name: "Zipped Files", extensions: ["zip"] },
        { name: "HoundWhileboard Files", extensions: ["hwb"] },
      ],
    })
    .then((result) => {
      if (!result.canceled) {
        // 先选择文件再打开全屏白板
        createFullScreenWindow("full-screen.html");
      }
    });
});

ipc.on("settings-changed", (event, settings) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("settings-changed", settings);
  });
  saveSettings(settings);
});

app.on("window-all-closed", () => {
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  }, 1000);
});
