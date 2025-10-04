const { app, BrowserWindow } = require("electron");
const IOManager = require("./utils/IOManager");
const {
  createWindow,
  createFullScreenWindow,
  createModalWindow,
} = require("./utils/windowManager");

let windows = {
  MainMenu: null,
  NewFile: null,
  NewTemplate: null,
  FullScreen: null
};

const ipc = require("electron").ipcMain;

app.whenReady().then(() => {
  IOManager.init(app);

  windows.MainMenu = createWindow("main-menu.html", {
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.MainMenu = createWindow("main-menu.html", {
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
  windows[windowNew] = createModalWindow(windowNewHTML, windows[windowNow], {
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
  })
})

ipc.on("close-window", (event, windowNow) => {
  windows[windowNow].close();
})

// app.on("window-all-closed", () => {
//   setTimeout(() => {
//     if (BrowserWindow.getAllWindows().length === 0) {
//       app.quit();
//     }
//   }, 1000);
// });

ipc.on("new-template-result", (event, result) => {
  // result: {texture, backgroundColor, backgroundImage, name}
  console.log(result);
  const templateInfo = IOManager.saveTemplate(result);
  windows.NewFile.webContents.send("new-template-adding", 
    {info: templateInfo, result: result});
});

ipc.on("load-buttons", (event, windowNow) => {
  const result = IOManager.loadTemplate();
  windows[windowNow].webContents.send("buttons-loaded", result);
});

ipc.on("create-new-board-templated", (event, boardInfo) => {
  IOManager.createEmptyBoard(boardInfo);
  BrowserWindow.getAllWindows().forEach((win) => {
    win.close();
  });
  windows.FullScreen = createFullScreenWindow("full-screen.html");
  console.log(windows.FullScreen);
});