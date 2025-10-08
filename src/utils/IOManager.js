const { randomInt } = require("crypto");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { dialog } = require("electron");
const hidefile = require('hidefile');

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

function extractFile(from, dest) {
  const zip = new AdmZip(from);
  zip.extractAllTo(dest, true);
}

function compressFile(directory, file, remove = false) {
  const zip = new AdmZip();
  zip.addLocalFolder(directory);
  zip.writeZip(file);
  if (remove) {
    fs.rm(directory, {recursive: true, force: true}, (err) => {
      if (err) throw err;
      console.log("Directory deleted");
    });
  }
}

class fileNameRandomPool {
  constructor(directory, filter) {
    this.directory = directory;
    // 读取目录下所有文件名
    const files = fs.readdirSync(directory);
    const filteredFiles = files.filter(filter);
    const numbers = filteredFiles.map(parseInt);
    this.existance = {};
    numbers.forEach((num) => {
      if (!isNaN(num)) {
        this.existance[num] = true;
      }
    });
  }

  //新建文件
  generate() {
    let randomNum;
    while (this.existance[(randomNum = randomInt(0, 1145141919810))]) ;
    this.existance[randomNum] = true;
    return randomNum.toString();
  }

  //删除文件夹
  delete(ID) {
    fs.unlinkSync(path.join(this.directory, ID));
    delete this.existance[parseInt(filename)];
  }
}

let userDataPath, settingsPath, templatesPath;
let templatePool;

function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataPath = app.getPath("userData");
  settingsPath = path.join(userDataPath, "settings.json");
  templatesPath = path.join(userDataPath, "templates");
  // 读取templates目录，如果没有就创建
  fs.mkdirSync(templatesPath, { recursive: true });
  templatePool = new fileNameRandomPool(templatesPath, (_) => true);
}

// 读取设置文件
function loadSettings() {
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, "utf-8");
    return JSON.parse(data);
  } else {
    // 如果文件不存在，创建默认设置
    const defaultSettings = {theme: "light", language: "zh-CN"};
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log("Settings saved successfully");
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

function saveTemplate(template) {
  /*
    template 结构：
    {
      texture;
      backgroundColor;
      backgroundImage;
      name;
    }
   */
  const templateID = templatePool.generate();
  // 创建临时目录
  const tempDir = path.join(templatesPath, templateID);
  fs.mkdirSync(tempDir);

  let templateData = {
    name: template.name,
    background: template.backgroundColor,
    backgroundType: "solid",
  };

  if (template.backgroundImage) {
    // 从 url 获取图片，复制到 tempDir，文件名改为 backgroundImage
    const imgUrl = template.backgroundImage;
    const suffix = imgUrl.split(".").pop();
    const imgName = "backgroundImage." + suffix;
    const imgPath = path.join(tempDir, imgName);
    fs.cpSync(imgUrl, imgPath);
    templateData.background = suffix;
    templateData.backgroundType = "image";
    console.log(templateData);
  }
  // 写入文件
  fs.writeFileSync(
    path.join(tempDir, "meta.json"),
    JSON.stringify(meta = {
      type: "template",
      version: "0.1.0",
    }, null, 2));
  fs.writeFileSync(path.join(tempDir, "template.json"), JSON.stringify(templateData, null, 2));
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
