const { randomInt } = require("crypto");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { dialog } = require("electron");
const { dir } = require("console");
const { directory, file, fp } = require("../classes/io");

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
        properties: ["openDirectory"], // 仅选择目录，无文件过滤
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

// 初始化
function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataDir = new directory(app.getPath("userData"));
  settingsFile = new file(userDataDir.getPath(), "settings", "json");
  templatesDir = new directory(userDataDir.getPath(), "templates");
  // 读取templates目录，如果没有就创建
  fp.mkdir(templatesDir);
  // 读取模板文件名随机池
  templatePool = new fileNameRandomPool(templatesDir);
}

// 读取设置文件
function loadSettings() {
  if (fp.lsFile(userDataDir).includes(settingsFile)) {
    // 如果文件存在，读取设置
    const data = fp.readFile(settingsFile);
    return JSON.parse(data);
  } else {
    // 如果文件不存在，创建默认设置
    const defaultSettings = {theme: "light", language: "zh-CN"};
    fp.writeFile(settingsFile, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
}

// 保存设置文件
// @param {
//          {string} theme: 主题;
//          {string} language: 语言;
//        }
function saveSettings(settings) {
  try {
    fp.writeFile(settingsFile, settings);
    console.log("Settings saved successfully");
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

// @param {
//          {file} texture: 还没用到呢，气不气;
//          {string} backgroundColor: RGB 16进制;
//          {string} backgroundImage: 图片文件的后缀名;
//          {string} name: 模板名称;
//        } template
// @return {
//           {string} id: templateID;
//           {
//             {string} name: 模版名称;
//             {string} background: RGB 16进制 或 文件后缀名
//             {string} backgroundType: solid 或 image
//           } data:;
//           {file} imgPath:;
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
    const imgUrl = template.backgroundImage;
    const imgFile = new file(imgUrl);
    const destImgFile = new file(tempDir.getPath(), "backgroundImage", imgFile.extension);
    fp.cp(imgFile, destImgFile);
    templateData.background = imgFile.extension;
    templateData.backgroundType = "image";
    console.log(templateData);
  }

  // 写入文件
  fp.writeFile(
    new file(tempDir.getPath(), "meta.json"),
    JSON.stringify(meta = {
      type: "template",
      version: "0.1.0",
    }, null, 2));
  fs.writeFileSync(
    path.join(tempDir, "template.json"),
    JSON.stringify(templateData, null, 2));

  return {
    id: templateID,
    data: templateData,
    imgPath: path.join(
      templatesPath,
      templateID,
      `backgroundImage.${templateData.background}`
    ),
  };
}

function loadTemplateAll() {
  // 获取 templatesPath 里所有文件夹，保留文件夹中 meta.json 的 type 是 template 的那些，保存到一个数组中
  const templateDirs = fs.readdirSync(templatesPath).filter((dir) => {
    const metaPath = path.join(templatesPath, dir, "meta.json");
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    return meta.type === "template";
  });
  // 遍历数组，读取每个文件夹中的 {id, data: template.json, imgPath}，组成一个对象数组返回
  const templates = templateDirs.map((dir) => {
    const templatePath = path.join(templatesPath, dir, "template.json");
    const templateData = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    return {
      id: dir,
      data: templateData,
      imgPath: path.join(
        templatesPath,
        dir,
        `backgroundImage.${templateData.background}`
      ),
    };
  });
  return templates;
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
  extractFile,
  compressFile,
  fileNameRandomPool,
};
