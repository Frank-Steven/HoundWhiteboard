const winManager = require("./windowManager");
const { fileNameRandomPool, directory, file } = require("../classes/io");

let templatesDir;

/**
 * 初始化白板管理器
 * @param {Object} app - Electron app 对象
 */
function init(app) {
  // 读取templates目录,如果没有就创建
  templatesDir = new directory(app.getPath("userData"), "templates").make();
}

const boardMeta = {
  type: "board",
  version: "0.1.0",
}

const pageMeta = {
  type: "page",
  version: "0.1.0",
}

/**
 * 创建一个空的白板
 * @param {JSON} boardInfo {
 *    {string} filePath,
 *    {string} templateID
 * }
 */
function createEmptyBoard(boardInfo) {
  /// ROOT DIR
  // 创建临时目录
  const boardFile = file.parse(boardInfo.filePath);
  const tempDir = new directory(boardFile.address, boardFile.name).rmWhenExist().make();

  // 创建 meta.json 文件 和 history.json 文件
  tempDir.peek("meta", "json").writeJSON(boardMeta);
  tempDir.peek("histroy", "json").writeJSON([]);

  /// PAGES
  // 创建 pages 目录
  tempDir.cd("pages").make();

  // 生成 pageID 并创建临时目录
  const pagePool = new fileNameRandomPool(tempDir.cd("pages"));
  const firstPageDir = pagePool.generate();
  const firstPageID = firstPageDir.name;

  // 创建 meta.json（元数据）
  firstPageDir.peek("meta", "json").writeJSON(pageMeta);

  // 创建 page.json（页数据）
  firstPageDir.cd("assets").make();
  firstPageDir.peek("page", "json").writeJSON({
    strokes: [],
    assets: [],
  });

  // 创建 pages.json 文件（page 列表）
  tempDir.peek("pages", "json").writeJSON([
    {
      "templateID": boardInfo.templateID,
      "pageID": firstPageID
    }
  ]);

  /// TEMPLATES
  // 创建 templates 目录
  tempDir.cd("templates");
  // 把样式从 templatesPath 中拷过来
  templatesDir.cd(boardInfo.templateID)
              .cp(tempDir.cd("templates").cd(boardInfo.templateID));
  // 创建 .hmq 文件（打包）
  tempDir.compress(boardFile, false);
  // 隐藏刚刚创建的临时目录
  tempDir.hide();
}

/**
 * 添加新页面
 * 
 * TODO: apply template
 * 
 * BUG: 如果是从其他机器拷过来的 .hwb 文件，它里面的 templateID 可能与本机
 * 的 templateID 一样，此时会有 .hwb 里的 template 被本机 template 覆盖的
 * 可能。
 *
 * @param {fileNameRandomPool} pool
 * @param {string} templateID
 * @returns {JSON} {
 *   {fileNameRandomPool} pool,
 *   {string} pageID
 * }
 */
function addPage(pool, templateID) {
  // 创建新页面文件夹
  // const tempDir = pool.directory.father();
  const newPageDir = pool.generate();

  // 创建 meta.json（元数据）
  newPageDir.peek("meta", "json").writeJSON(pageMeta);

  // 创建 page.json（页数据）
  newPageDir.peek("page", "json").writeJSON({
    strokes: [],
    assets: [],
  })
  newPageDir.cd("assets").make();

  return {
    "pool": pool,
    "pageID": newPageDir.name,
  };
}

/**
 * 打开白板文件
 * @param {file} boardFile - .hwb 文件
 * @returns {BrowserWindow} 浏览器窗口对象
 */
function openBoard(boardFile) {
  let win = winManager.createFullScreenWindow("full-screen.html");
  console.log("open board: " + boardFile.getPath());

  const fileDir = new directory(boardFile.address, boardFile.name);
  directory.getHideResult(fileDir).rmWhenExist();
 
  // 解压临时文件夹
  const tempDir = boardFile.extract(fileDir).hide();

  // 在 win 完成加载时，给渲染进程发送 tempDir 的 pathString
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("board-opened", tempDir.getPath());
  });
  return win;
}

/**
 * 保存白板
 * @param {directory} boardDir - 白板目录
 */
function saveBoard(boardDir) {
  console.log("save board: " + boardDir.getPath());

  const boardFile = new file(boardDir.address, boardDir.name.substring(1), "hwb").rmWhenExist();

  boardDir.compress(boardFile, true);
}

module.exports = {
	openBoard,
	saveBoard,
  createEmptyBoard,
  addPage,
  init,
};
