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
  NewTemplate: null
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

ipc.on("new-file", () => {
  windows.NewFile = createModalWindow("new-file.html", windows.MainMenu, {
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
  });
});

ipc.on("new-template", () => {
  windows.NewTemplate = createModalWindow("new-template.html", windows.NewFile, {
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
  console.log(result);
  IOManager.saveTemplate(result);
});

// ipc.on("load-buttons", (event, windowNow) => {
//   const buttons = IOManager.loadTemplates();
//   windows[windowNow].webContents.send("buttons-loaded", buttons);
// });