const { app, BrowserWindow } = require("electron");
const settingManager = require("./utils/setting-manager");
const foManager = require("./utils/file-open-manager");
const winManager = require("./utils/window-manager");
const boardManager = require("./utils/board-manager");
const templateManager = require("./utils/template-manager");
const { file, directory } = require("./classes/io");
const ipc = require("electron").ipcMain;

let windows = {
  MainMenu: null,
  NewFile: null,
  NewTemplate: null,
  FullScreen: null
};

app.whenReady().then(() => {
  settingManager.init(app);
  boardManager.init(app);
  templateManager.init(app);

  windows.MainMenu = winManager.createWindow("main-menu.html", {
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.MainMenu = winManager.createWindow("main-menu.html", {
        width: 800,
        height: 600,
        minWidth: 800,
        minHeight: 600,
      });
    }
  });

  // 设置进程间通信(IPC)处理器
  settingManager.setupSettingsIPC(ipc, BrowserWindow);  // 设置处理器
  foManager.setupFileOpenIPC(ipc, windows);
  winManager.setupFileOpenCloseIPC(ipc, windows);      // 窗口开关处理器
  templateManager.setupTemplateOperationIPC(ipc, windows); // 模板操作处理器

  // 调试用：打印窗口对象
});

app.on("window-all-closed", () => {
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  }, 1000);
});

// 参数说明:
// {
//   {string} templateID - 模板ID
//   {file} boardFile - 白板文件对象
// } boardInfo - 白板信息对象
ipc.on("create-new-board-templated", (event, boardInfo) => {
  console.log("create-new-board-templated: %s At %s", boardInfo.templateID, boardInfo.filePath);
  boardManager.createEmptyBoard(boardInfo);
  BrowserWindow.getAllWindows().forEach((win) => { win.close(); });
  windows.FullScreen = boardManager.openBoard(file.parse(boardInfo.filePath));
});

ipc.on("open-board-templated", (event, filePath) => {
  console.log(filePath);
  console.log("open-board-templated: At %s", filePath);
  BrowserWindow.getAllWindows().forEach((win) => { win.close(); });
  windows.FullScreen = boardManager.openBoard(file.parse(filePath));
});

ipc.on("save-board-templated", (event, dirPath) => {
  windows.FullScreen.close();
  windows.MainMenu = winManager.createWindow("main-menu.html", {
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
  });
  boardManager.saveBoard(directory.parse(dirPath));
});
