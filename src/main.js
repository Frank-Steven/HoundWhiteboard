const { app, BrowserWindow } = require("electron");
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

app.whenReady().then(() => {
  winMainMenu = createWindow("main-menu.html", 800, 600, 800, 600);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      winMainMenu = createWindow("main-menu.html", 800, 600);
    }
  });
});

ipc.on("new-file", () => {
  winNewFile = createWindow("new-file.html", 800, 600, 800, 600);
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
        console.log(result.filePaths);
      }
    });
  createFullScreenWindow("full-screen.html");
});

ipc.on("settings-changed", () => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("settings-changed");
  })
});

app.on("window-all-closed", () => {
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  }, 1000);
});
