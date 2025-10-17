const { app, BrowserWindow } = require("electron");
const settingManager = require("./utils/settingManager");
const winManager = require("./utils/windowManager");
const boardManager = require("./utils/boardManager");
const templateManager = require("./utils/templateManager");
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

  // 设置 IPC 处理器
  settingManager.setupSettingsIPC(ipc, BrowserWindow);
  settingManager.setupFileOperationIPC(ipc, windows);
  winManager.setupFileOpenCloseIPC(ipc, windows);
  templateManager.setupTemplateOperationIPC(ipc, windows);

  // console.log(windows);
});

app.on("window-all-closed", () => {
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  }, 1000);
});

// {
//   {string} templateID
//   {file} boardFile
// } boardInfo
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

