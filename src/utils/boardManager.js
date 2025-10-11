const winManager = require("./windowManager");
const IOManager = require("./IOManager");
const { fileNameRandomPool } = require("../../classes/io");
const path = require("path");
const fs = require("fs");
const hidefile = require("hidefile");

let userDataPath, templatesPath;

function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataPath = app.getPath("userData");
  templatesPath = path.join(userDataPath, "templates");
  // 读取templates目录，如果没有就创建
  fs.mkdirSync(templatesPath, { recursive: true });
}

const boardMeta = {
  type: "board",
  version: "0.1.0",
}

const pageMeta = {
  type: "page",
  version: "0.1.0",
}

// 创建一个空的白板
// @param boardInfo
// JSON: {
//    filePath: string,
//    templateID: string
// }
function createEmptyBoard(boardInfo) {
  /// ROOT DIR ///
  // 创建临时目录
  const tempDir = boardInfo.filePath.replace(".hwb", "");
  fs.mkdirSync(tempDir, { recursive: true });

  // 创建 meta.json 文件
  fs.writeFileSync(
    path.join(tempDir, "meta.json"),
    JSON.stringify(boardMeta, null, 2)
  );

  // 创建 history.json 文件
  fs.writeFileSync(
    path.join(tempDir, "history.json"),
    JSON.stringify([], null, 2)
  );

  /// PAGES ///
  // 创建 pages 目录
  fs.mkdirSync(path.join(tempDir, "pages"), { recursive: true });

  // 生成 pageID
  let pagePool = new fileNameRandomPool(path.join(tempDir, "pages"), (_) => true)
  let firstPageID = pagePool.generate();
  fs.mkdirSync(path.join(tempDir, "pages", firstPageID), { recursive: true });

  // 创建 meta.json（元数据）
  fs.writeFileSync(
    path.join(tempDir, "pages", firstPageID, "meta.json"),
    JSON.stringify(pageMeta, null, 2)
  );

  // 创建 page.json（页数据）
  fs.mkdirSync(path.join(tempDir, "pages", firstPageID, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "pages", firstPageID, "page.json"),
    JSON.stringify({
      strokes: [],
      assets: [],
    }, null, 2)
  );

  // 创建 pages.json 文件（page 列表）
  fs.writeFileSync(
    path.join(tempDir, "pages.json"),
    JSON.stringify([
      {
        "templateID": boardInfo.templateID,
        "pageID": firstPageID
      }
    ], null, 2)
  );

  /// TEMPLATES ///
  // 创建 templates 目录
  fs.mkdirSync(path.join(tempDir, "templates"), { recursive: true });
  // 把样式从 templatesPath 中拷过来，不需要 Pool
  // let tpltPool = new fileNameRandomPool(path.join(tempDir, "templates"), (_) => true)
  fs.mkdirSync(path.join(tempDir, "templates", boardInfo.templateID), { recursive: true });
  fs.cpSync(
    path.join(templatesPath, boardInfo.templateID),
    path.join(tempDir, "templates", boardInfo.templateID),
    { recursive: true }
  );
  // 创建 .hmq 文件（打包）
  IOManager.compressFile(tempDir, boardInfo.filePath);
  // 隐藏刚刚创建的临时目录
  hidefile.hideSync(tempDir);
}

// @param pool
// type: fileNameRandomPool
// @return
// JSON: {
//   pool: fileNameRandomPool,
//   pageID: string
// }
function addPage(pool, templateID) {
  // 创建新页面文件夹
  const tempDir = path.join(pool.directory, "..");
  const newPageID = pool.generate();
  fs.mkdirSync(path.join(tempDir, "pages", newPageID), { recursive: true });

  // 创建 meta.json（元数据）
  fs.writeFileSync(
    path.join(tempDir, "pages", newPageID, "meta.json"),
    JSON.stringify(pageMeta, null, 2)
  );

  // 创建 page.json（页数据）
  fs.mkdirSync(path.join(tempDir, "pages", newPageID, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "pages", newPageID, "page.json"),
    JSON.stringify({
      strokes: [],
      assets: [],
    }, null, 2)
  );


  return {
    "pool": pool,
    "pageID": newPageID,
  };
}

function openBoard(filePath) {
  let win = winManager.createFullScreenWindow("full-screen.html");
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
  createEmptyBoard,
  addPage,
  init,
};
