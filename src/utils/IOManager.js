const { dialog } = require("electron");
const { directory, file, fileNameRandomPool } = require("../classes/io");

/**
 * 设置文件操作 IPC 通信
 * @param {Object} ipc - IPC 主进程对象
 * @param {Object} windows - 窗口对象集合
 */
function setupFileOperationIPC(ipc, windows) {
  ipc.on("open-hwb-file", (event, windowNow) => {
    // 调用系统默认打开文件对话框
    dialog
      .showOpenDialog(windows[windowNow], {
        properties: ["openFile"],
        filters: [
          { name: "All Files", extensions: ["*"] },
          { name: "HoundWhiteboard Files", extensions: ["hwb"] },
        ],
      })
      .then((result) => {
        if (!result.canceled) {
          windows[windowNow].webContents.send(
            "open-hwb-file-result",
            result.filePaths
          );
        }
      });
  });

  ipc.on("open-hmq-file", (event, windowNow) => {
    dialog
      .showOpenDialog(windows[windowNow], {
        properties: ["openFile"],
        filters: [
          { name: "All Files", extensions: ["*"] },
          { name: "HoundWhiteboard Module Quark Files", extensions: ["hmq"] },
        ],
      })
      .then((result) => {
        if (!result.canceled) {
          windows[windowNow].webContents.send(
            "open-hmq-file-result",
            result.filePaths
          );
        }
      });
  });

  ipc.on("open-img-file", (event, windowNow) => {
    dialog
      .showOpenDialog(windows[windowNow], {
        properties: ["openFile"],
        filters: [
          {
            name: "Image Files",
            extensions: [
              "jpg",
              "jpeg",
              "png",
              "gif",
              "bmp",
              "ico",
              "tif",
              "tiff",
              "svg",
              "webp",
              "apng",
              "avif",
            ],
          },
        ],
      })
      .then((result) => {
        if (!result.canceled) {
          windows[windowNow].webContents.send(
            "open-hmq-file-result",
            result.filePaths
          );
        }
      });
  });

  ipc.on("path-choose", (event) => {
    dialog
      .showOpenDialog(windows["NewFile"], {
        properties: ["openDirectory"], // 仅选择目录,无文件过滤
      })
      .then((result) => {
        if (!result.canceled) {
          windows["NewFile"].webContents.send(
            "path-choose-result",
            result.filePaths
          );
        }
      });
  });
}

let userDataDir, settingsFile, templatesDir, templatePool;
const defaultSettings = { theme: "light", language: "zh-CN" };
const templateMeta = {
  type: "template",
  version: "0.1.0",
};

/**
 * 初始化 IO 管理器
 * @param {Object} app - Electron app 对象
 */
function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataDir = directory.parse(app.getPath("userData"));
  settingsFile = userDataDir.peek("settings", "json").existOrWriteJSON(defaultSettings);
  templatesDir = userDataDir.cd("templates").make();
  // 读取模板文件名随机池
  templatePool = new fileNameRandomPool(templatesDir);
}

/**
 * 读取设置文件
 * @returns {Object} 设置对象
 */
function loadSettings() {
  return settingsFile.existOrWriteJSON(defaultSettings).catJSON();
}

/**
 * 保存设置文件
 * @param {Object} settings - 设置对象
 * @param {string} settings.theme - 主题
 * @param {string} settings.language - 语言
 */
function saveSettings(settings) {
  try {
    settingsFile.writeJSON(settings);
    console.log("Settings saved successfully");
  } catch (err) {
    console.error("Error saving settings:", err);
  }
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
  /** 获取 templatesPath 里所有文件夹,保留文件夹中 meta.json 的 type 是 template 的那些,保存到一个数组中 */
  const templateDirs = templatesDir.lsDir()
                                   .filter(dir => {
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

/**
 * 设置设置相关的 IPC 通信
 * @param {Object} ipc - IPC 主进程对象
 * @param {Object} BrowserWindow - BrowserWindow 对象
 */
function setupSettingsIPC(ipc, BrowserWindow) {
  ipc.handle('get-current-settings', async () => { return loadSettings(); });

  ipc.on("settings-changed", (event, settings) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("settings-changed", settings);
    });
    saveSettings(settings);
  });
}

module.exports = {
  init,
  loadSettings,
  saveSettings,
  setupSettingsIPC,
  saveTemplate,
  removeTemplate,
  renameTemplate,
  loadTemplateAll,
  loadTemplateByID,
  setupFileOperationIPC,
};
