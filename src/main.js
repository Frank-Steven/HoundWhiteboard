const { app, BrowserWindow } = require("electron");
const fileOperation = require("./utils/fileOperation");
const settingsManager = require("./utils/settingsManager");
const {
  createWindow,
  createFullScreenWindow,
  createModalWindow,
} = require("./utils/windowManager");

let winMainMenu, winNewFile, winNewTheme; 
const ipc = require("electron").ipcMain;

app.whenReady().then(() => {
  settingsManager.init(app);

  winMainMenu = createWindow("main-menu.html", 800, 600, 800, 600, settingsManager);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      winMainMenu = createWindow("main-menu.html", 800, 600, 800, 600, settingsManager);
    }
  });

  // 设置 IPC 处理器
  settingsManager.setupSettingsIPC(ipc, BrowserWindow);
  fileOperation.setupFileOperationIPC(ipc, {
    getWinMainMenu: () => winMainMenu,
    getWinNewFile: () => winNewFile,
    createFullScreenWindow: createFullScreenWindow,
  });
});

ipc.on("new-file", () => {
  winNewFile = createModalWindow("new-file.html", 800, 600, 800, 600, winMainMenu, settingsManager);
});

ipc.on("new-theme", () => {
  winNewTheme = createModalWindow("new-theme.html", 800, 600, 800, 600, winNewFile, settingsManager);
});

ipc.on("new-file-edit", () => {
  winNewFile = createWindow("new-file-edit.html", 800, 600, 800, 600, settingsManager);
});

app.on("window-all-closed", () => {
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  }, 1000);
});
