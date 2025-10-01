const print = console.log;
const { randomInt } = require("crypto");
const fs = require("fs");
const { version } = require("os");
const path = require("path");
const { threadId } = require("worker_threads");
const AdmZip = require("adm-zip");
const { dialog } = require("electron");

function setupFileOperationIPC(ipc, windows) {
  ipc.on("open-hwb-file", (event, windowNow) => {
    // 调用系统默认打开文件对话框
    dialog
      .showOpenDialog(windows[windowNow], {
        properties: ["openFile"],
        filters: [
          { name: "All Files", extensions: ["*"] },
          { name: "HoundWhileboard Files", extensions: ["hwb"] },
        ],
      })
      .then((result) => {
        if (!result.canceled) {
          // 先选择文件再打开全屏白板
          // TODO: 再发回去
        }
      });
  });
  ipc.on("open-hmq-file", (event, windowNow) => {
    dialog
      .showOpenDialog(windows[windowNow], {
        properties: ["openFile"],
        filters: [
          { name: "All Files", extensions: ["*"] },
          { name: "HoundWhileboard Module Quark Files", extensions: ["hmq"] },
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
          { name: "All Files", extensions: ["*"] },
          { name: "Image Files", extensions: ["jpg", "png", "jpeg"] },
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

// 创建一个空的白板
function createEmptyBoard(file) {}

function extractFile(directory, file) {
  const zip = new AdmZip(path.join(directory, file.name + "." + file.suffix));
  const dest = path.join(directory, file.name);
  zip.extractAllTo(dest, true);
}

function compressFile(directory, destDirectory, file) {
  const zip = new AdmZip();
  zip.addLocalFolder(directory);
  zip.writeZip(path.join(destDirectory, file.name + "." + file.suffix));
  fs.rm(directory, { recursive: true, force: true }, (err) => {
    if (err) throw err;
    console.log("Directory deleted");
  });
}

let userDataPath, settingsPath, templatesPath;

let templatePool;

class fileNameRandomPool {
  constructor(directory, suffix) {
    this.directory = directory;
    this.suffix = suffix;
    // 读取目录下所有文件名
    const files = fs.readdirSync(directory);
    const filteredFiles = files.filter((file) => path.extname(file) === suffix);
    const numbers = filteredFiles.map((file) =>
      parseInt(path.basename(file, suffix))
    );
    this.existance = {};
    numbers.forEach((num) => {
      if (!isNaN(num)) {
        this.existance[num] = true;
      }
    });
    console.log(this.existance);
  }

  //新建文件
  generate() {
    let randomNum;
    while (this.existance[(randomNum = randomInt(0, 1145141919810))]);
    this.existance[randomNum] = true;
    return { name: randomNum.toString(), suffix: this.suffix };
  }

  //删除文件
  delete(fileID) {
    fs.unlinkSync(path.join(this.directory, fileID + "." + this.suffix));
    this.existance[parseInt(path.basename(filename, this.suffix))] = null;
  }
}

function init(app) {
  // 获取用户数据目录（类似 VSCode 的 ~/.config/YourApp/）
  userDataPath = app.getPath("userData");
  settingsPath = path.join(userDataPath, "settings.json");
  templatesPath = path.join(userDataPath, "templates");
  // 读取templates目录
  templatePool = new fileNameRandomPool(templatesPath, "hmq");
}

// 读取设置文件
function loadSettings() {
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, "utf-8");
    return JSON.parse(data);
  } else {
    // 如果文件不存在，创建默认设置
    const defaultSettings = { theme: "light", language: "zh-CN" };
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
  const templateID = templatePool.generate();
  // 创建临时目录
  const tempDir = path.join(templatesPath, templateID.name);
  fs.mkdirSync(tempDir);
  let meta = {
    type: "template",
    version: "0.1.0",
  };
  let templateData = {
    name: template.name,
    background: template.backgroundColor,
  };
  if (template.backgroundImage) {
    // 从urljson获取图片，copy to tempDir as backgroundImage.[suffix] use fs.cpSync
    const imgUrl = template.backgroundImage;
    const imgName = "backgroundImage." + imgUrl.split(".").pop();
    const imgPath = path.join(tempDir, imgName);
    fs.cpSync(imgUrl, imgPath);
    templateData.background = "image";
    print(templateData);
  }
  // 写入文件
  fs.writeFileSync(
    path.join(tempDir, "meta.json"),
    JSON.stringify(meta, null, 2)
  );
  fs.writeFileSync(
    path.join(tempDir, "template.json"),
    JSON.stringify(templateData, null, 2)
  );
}

function loadTemplate(template) {
  // 获取 templatesPath 里所有文件夹，保留文件夹中 meta.json 的 type 是 template 的那些，保存到一个数组中
  const templateDirs = fs.readdirSync(templatesPath).filter((dir) => {
    const metaPath = path.join(templatesPath, dir, "meta.json");
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    return meta.type === "template";
  });
  // 遍历数组，读取每个文件夹中的 {ID:[dir], data: template.json}，组成一个对象数组返回
  const templates = templateDirs.map((dir) => {
    const templatePath = path.join(templatesPath, dir, "template.json");
    const templateData = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    return {
      id: dir,
      data: templateData,
    };
  });
  return templates;
}

function setupSettingsIPC(ipc, BrowserWindow) {
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
  setupFileOperationIPC,
  extractFile,
  compressFile,
};
