const { dialog } = require("electron");
const { directory, file, fileNameRandomPool } = require("../classes/io");

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
            result.filePaths // NOTE: IPC 会自动序列化，所以这里就不 parse 了
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
            result.filePaths // NOTE: IPC 会自动序列化，所以这里就不 parse 了
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
            result.filePaths // NOTE: IPC 会自动序列化，所以这里就不 parse 了
          );
        }
      });
  });

  ipc.on("path-choose", (event) => {
    dialog
      .showOpenDialog(windows["NewFile"], {
        properties: ["openDirectory"], // 仅选择目录，无文件过滤
      })
      .then((result) => {
        if (!result.canceled) {
          windows["NewFile"].webContents.send(
            "path-choose-result",
            result.filePaths // NOTE: IPC 会自动序列化，所以这里就不 parse 了
          );
        }
      });
  });
}

let userDataDir, settingsFile, templatesDir, templatePool;
const defaultSettings = {theme: "light", language: "zh-CN"};
const templateMeta = {
  type: "template",
  version: "0.1.0",
};

// 初始化
function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataDir = directory.parse(app.getPath("userData"));
  settingsFile = userDataDir.peek("settings", "json").existOrWriteJSON(defaultSettings);
  templatesDir = userDataDir.cd("templates").make();
  // 读取模板文件名随机池
  templatePool = new fileNameRandomPool(templatesDir);
}

// 读取设置文件
function loadSettings() {
  return settingsFile.existOrWriteJSON(defaultSettings).catJSON();
}

// 保存设置文件
// @param {
//          {string} theme: 主题;
//          {string} language: 语言;
//        }
function saveSettings(settings) {
  try {
    settingsFile.WriteJSON(settings);
    console.log("Settings saved successfully");
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

// @param {
//          {file} texture: 还没用到呢，气不气
//          {string} backgroundColor: RGB 16进制
//          {string} backgroundImage: 图片文件的地址
//          {string} name: 模板名称
//        } template
//
// @return {
//           {string} id: templateID
//           {
//             {string} name: 模版名称
//             {string} background: RGB 16进制 或 文件后缀名
//             {string} backgroundType: "solid" 或 "image"
//           } data
//           {file} imgFile: 图片文件
//         }
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
    // 从 url 获取图片，复制到 tempDir，文件名改为 backgroundImage
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

// @return {
//           {string} id: templateID
//           {
//             {string} name: 模版名称
//             {string} background: RGB 16进制 或 文件后缀名
//             {string} backgroundType: "solid" 或 "image"
//           } data
//           {string} imgPath: 图片文件的路径
//         }
function loadTemplateAll() {
  // 获取 templatesPath 里所有文件夹，保留文件夹中 meta.json 的 type 是 template 的那些，保存到一个数组中
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
  loadTemplateAll,
  setupFileOperationIPC,
};
