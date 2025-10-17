const winManager = require("./windowManager");
const { file, directory, fileNameRandomPool } = require("../classes/io");

let templatesDir, templatePool;
const templateMeta = {
  type: "template",
  version: "0.1.0",
};

/**
 * 初始化模版管理器
 * @param {Object} app - Electron app 对象
 */
function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  const userDataDir = directory.parse(app.getPath("userData"));
  templatesDir = userDataDir.cd("templates").make();
  // 读取模板文件名随机池
  templatePool = new fileNameRandomPool(templatesDir);
}

/**
 * 保存模版
 * @param {Object} template - 模板对象
 * @param {file} template.texture - 还没用到呢,气不气
 * @param {string} template.backgroundColor - RGB 16进制
 * @param {string} template.backgroundImage - 图片文件的地址
 * @param {string} template.name - 模板名称
 * @returns {Object} 返回对象
 * @returns {string} returns.id - templateID
 * @returns {Object} returns.data - 模板数据
 * @returns {string} returns.data.name - 模版名称
 * @returns {string} returns.data.background - RGB 16进制 或 文件后缀名
 * @returns {string} returns.data.backgroundType - "solid" 或 "image"
 * @returns {file} returns.imgFile - 图片文件
 */
function saveTemplate(template) {
  // 创建目录
  const tempDir = templatePool.generate();
  const templateID = tempDir.name;

  let templateData = {
    name: template.name,
    background: template.backgroundColor,
    backgroundType: "solid",
  };

  if (template.backgroundImage) {
    // 从 url 获取图片,复制到 tempDir,文件名改为 backgroundImage
    const imgFile = file.parse(template.backgroundImage);
    const destImgFile = tempDir.peek("backgroundImage", imgFile.extension);
    imgFile.cp(destImgFile);
    templateData.background = imgFile.extension;
    templateData.backgroundType = "image";
    console.log(templateData);
  }

  // 写入文件
  tempDir.peek("meta", "json").writeJSON(templateMeta);
  tempDir.peek("template", "json").writeJSON(templateData);

  return {
    id: templateID,
    data: templateData,
    imgFile: tempDir.cd(templateID).peek("backgroundImage", templateData.background),
  };
}

/**
 * 加载所有的模版
 * @returns {Array<JSON>} 模板数组
 * @returns {string} returns[].id - templateID
 * @returns {JSON} returns[].data - 模板数据
 * @returns {string} returns[].data.name - 模版名称
 * @returns {string} returns[].data.background - RGB 16进制 或 文件后缀名
 * @returns {string} returns[].data.backgroundType - "solid" 或 "image"
 * @returns {string} returns[].imgPath - 图片文件的路径
 */
function loadTemplateAll() {
  // 获取 templatesPath 里所有文件夹,保留文件夹中 meta.json 的 type 是 template 的那些,保存到一个数组中
  const templateDirs = templatesDir.lsDir().filter(dir => {
    const metaFile = dir.peek("meta", "json");
    if (!metaFile.exist()) return false;
    return metaFile.catJSON().type === "template";
  })

  return templateDirs.map(dir => {
    const templateData = dir.peek("template", "json").catJSON();
    return {
      id: dir.name,
      data: templateData,
      imgPath: dir.peek("backgroundImage", templateData.background).getPath(),
    };
  });
}

/**
 * 加载指定 ID 的模版
 * @param {string} templateID 模版 ID
 * @returns {JSON} 模板 JSON
 * @returns {string} returns.id - templateID
 * @returns {JSON} returns.data - 模板数据
 * @returns {string} returns.data.name - 模版名称
 * @returns {string} returns.data.background - RGB 16进制 或 文件后缀名
 * @returns {string} returns.data.backgroundType - "solid" 或 "image"
 * @returns {string} returns.imgPath - 图片文件的路径
 */
function loadTemplateByID(templateID) {
  const tempDir = templatesDir.cd(templateID);
  if (!tempDir.exist()) return null;
  const templateData = tempDir.peek("template", "json").catJSON();
  return {
    id: templateID,
    data: templateData,
    imgPath: tempDir.peek("backgroundImage", templateData.background).getPath(),
  };
}

/**
 * 删除某模版
 * @param {string} templateID - 模板 ID
 */
function removeTemplate(templateID) {
  // templatePool 会自动删除文件夹
  templatePool.remove(templateID);
}

/**
 * 重命名某模版,会换一个 ID
 *
 * BUG: 还是一样,有可能新模版进来占用原 ID,导致用原 ID 的所有白板出问题
 *
 * @param {string} templateID - 原始的模版 ID
 * @param {string} newName - 新文件的名字
 * @returns {string} 新的模版 ID
 */
function renameTemplate(templateID, newName) {
  const newDir = templatePool.rename(templateID);
  const infoFile = newDir.peek("template", "json");
  let templateJSON = infoFile.catJSON();
  templateJSON.name = newName;
  infoFile.writeJSON(templateJSON);
  return newDir.name;
}

function setupTemplateOperationIPC(ipc, windows) {
  ipc.on("new-template-result", (event, result) => {
    // result: {texture, backgroundColor, backgroundImage, name}
    console.log(result);
    const templateInfo = saveTemplate(result);
    windows.NewFile.webContents.send("new-template-adding",
      { info: templateInfo, result: result });
  });

  ipc.handle("template-load-buttons", async (event, windowNow) => {
    return loadTemplateAll();
  });

  ipc.handle("template-remove", async (event, templateID, windowNow) => {
    removeTemplate(templateID);
    return templateID;
  });

  ipc.handle("template-rename", async (event, templateID, name, windowNow) => {
    const newID = renameTemplate(templateID, name);
    return newID;
  });

  ipc.on("template-edit", (event, templateID) => {
    const info = loadTemplateByID(templateID);
    if (info) {
      const pathStr = file.parse(info.imgPath).unPeek().getPath();
      windows.NewTemplate =
        winManager.createModalWindow("new-template.html", windows.NewFile, {
          width: 800,
          height: 600,
          minWidth: 800,
          minHeight: 600,
        });
      setTimeout(() => {
        windows
          .NewTemplate
          .webContents
          .send("init-new-template-from-other-template", info.data, pathStr, templateID);
      }, 100);
    } else {
      console.error("No such file in directory.");
    }
  });

  ipc.on("template-copy", (event, templateID) => {
    const info = loadTemplateByID(templateID);
    if (info) {
      const pathStr = file.parse(info.imgPath).unPeek().getPath();
      windows.NewTemplate =
        winManager.createModalWindow("new-template.html", windows.NewFile, {
          width: 800,
          height: 600,
          minWidth: 800,
          minHeight: 600,
        });
      setTimeout(() => {
        windows
          .NewTemplate
          .webContents
          .send("init-new-template-from-other-template", info.data, pathStr, null);
      }, 100);
    } else {
      console.error("No such file in directory.");
    }
  });
}

module.exports = {
  init,
  saveTemplate,
  loadTemplateByID,
  loadTemplateAll,
  removeTemplate,
  renameTemplate,
  setupTemplateOperationIPC,
};
