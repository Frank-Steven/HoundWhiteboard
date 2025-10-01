const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const { dialog } = require("electron");

function extractFile(file) {
  const zip = new AdmZip(file);
  const directory = file.name.split(".")[0];
  zip.extractAllTo(directory, true);
}

function compressFile(directory) {
  const zip = new AdmZip();
  zip.addLocalFolder(directory);
  zip.writeZip(directory + ".hwb");
  fs.remove(directory);
}

function setupFileOperationIPC(ipc, utils) {
  ipc.on("open-hwb-file", () => {
    // 调用系统默认打开文件对话框
    dialog
      .showOpenDialog(utils.getWinMainMenu(), {
        properties: ["openFile"],
        filters: [
          { name: "All Files", extensions: ["*"] },
          { name: "HoundWhileboard Files", extensions: ["hwb"] },
        ],
      })
      .then((result) => {
        if (!result.canceled) {
          // 先选择文件再打开全屏白板
          utils.createFullScreenWindow("full-screen.html");
        }
      });
  });

  // NOTE: 暂时没用
  // ipc.on("open-hwt-file", () => {
  //   // 调用系统默认打开文件对话框
  //   dialog
  //     .showOpenDialog(utils.getWinMainMenu(), {
  //       properties: ["openFile"],
  //       filters: [
  //         { name: "All Files", extensions: ["*"] },
  //         { name: "HoundWhileboard Texture Files", extensions: ["hwt"] },
  //       ],
  //     })
  //     .then((result) => {
  //       if (!result.canceled) {
  //         // TODO: 打开 hwt 文件
  //       }
  //     });
  // });

  ipc.on("path-choose", (event) => {
    // 调用系统默认打开目录对话框
    dialog
      .showOpenDialog(utils.getWinNewFile(), {
        properties: ["openDirectory"], // 仅选择目录，无文件过滤
      })
      .then((result) => {
        if (!result.canceled) {
          utils
            .getWinNewFile()
            .webContents.send("path-choose-result", result.filePaths);
        }
      });
  });
}

// 创建一个空的白板
function createEmptyBoard(file) {}

module.exports = {
  extractFile,
  compressFile,
  createEmptyBoard,
  setupFileOperationIPC,
};
