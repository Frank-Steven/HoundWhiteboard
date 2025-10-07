const winManager = require("./windowManager");
const IOManager = require("./IOManager");
const path = require("path");
const fs = require("fs");
const hidefile = require("hidefile");

function openBoard(filePath) {
  let win = winManager.createFullScreenWindow("../templates/full-screen.html");
  console.log("open board: " + filePath);

  let fileDir = filePath.replace(".hwb", "");
  let tempDir = path.join(path.dirname(fileDir), "." + path.basename(fileDir));
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
 
  // 解压临时文件夹
  IOManager.extractFile(filePath, fileDir);
  hidefile.hideSync(fileDir);

  // 在 win 完成加载时，给渲染进程发送 tempDir
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("board-opened", tempDir);
  });
  return win;
}

function saveBoard(dirPath) {
  console.log("save board: " + dirPath);

  let filePath = path.join(path.dirname(dirPath), path.basename(dirPath).substring(1) + ".hwb");

  if(fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }

  IOManager.compressFile(dirPath, filePath, true);
}

module.exports = {
	openBoard,
	saveBoard,
};