const { app, BrowserWindow } = require("electron");
const IOManager = require("./utils/IOManager");
const winManager = require("./utils/windowManager");
const boardManager = require("./utils/boardManager");
const { file, directory } = require("./classes/io");

let windows = {
  MainMenu: null,
  NewFile: null,
  NewTemplate: null,
  FullScreen: null
};

const ipc = require("electron").ipcMain;

app.whenReady().then(() => {
  IOManager.init(app);
  boardManager.init(app);

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
  IOManager.setupSettingsIPC(ipc, BrowserWindow);
  IOManager.setupFileOperationIPC(ipc, windows);

  // console.log(windows);
});

ipc.on("open-modal-window", (event, windowNow, windowNew, windowNewHTML) => {
  windows[windowNew] = winManager.createModalWindow(windowNewHTML, windows[windowNow], {
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
  });
});

ipc.on("close-window", (event, windowNow) => {
  windows[windowNow].close();
})

app.on("window-all-closed", () => {
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  }, 1000);
});

ipc.on("new-template-result", (event, result) => {
  // result: {texture, backgroundColor, backgroundImage, name}
  console.log(result);
  const templateInfo = IOManager.saveTemplate(result);
  windows.NewFile.webContents.send("new-template-adding",
    { info: templateInfo, result: result });
});

ipc.on("load-buttons", (event, windowNow) => {
  const result = IOManager.loadTemplateAll();
  windows[windowNow].webContents.send("buttons-loaded", result);
});

ipc.on("template-remove", (event, templateID) => {
  IOManager.removeTemplate(templateID);
});

// @param {
//          {string} templateID
//          {file} boardFile
//        } boardInfo
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

