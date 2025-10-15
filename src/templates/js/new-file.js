// const { ipcRenderer } = require("electron")
// const ipc = ipcRenderer
// ipc has been decleared in global.js

const path = require("path");

const newTemplateBtn = document.getElementById("new-file-template-select-new-template");
const input = document.getElementById("new-file-save-form-input");

const filePathSpan = document.getElementById("new-file-save-path");
const choosePathBtn = document.getElementById("new-file-save-choosepath");

const confirmBtn = document.getElementById("yes-or-no-button-yes");
const cancelBtn = document.getElementById("yes-or-no-button-no");

const buttonList = document.getElementById("new-file-template-select-buttons");

let filePath = "";

// NOTE: 由于 IPC 会自动序列化参数，所以此处就不用 file 类型的文件了
let boardInfo = {
  templateID: null,
  filePath: null,
};

// 输入框事件优化（使用 input 事件替代 keydown）
input.addEventListener('input', () => {
  // 文件名过滤配置
  const FILTER_CONFIG = {
    // 增强正则表达式（覆盖所有操作系统非法字符）
    illegalChars: /[<>:"/\\.@|?*~$^'`\u0000-\u001F]/g, // 包含控制字符过滤
    maxLength: 255 - '.hwb'.length, // 保留扩展名空间
    replaceChar: '_' // 非法字符替换符
  };

  // 执行过滤操作
  const sanitizeFilename = (value) => {
    // 阶段1：预处理
    let cleaned = value.trim()
      .normalize('NFC') // 统一 Unicode 格式（重要 macOS 兼容）
      .replace(FILTER_CONFIG.illegalChars, FILTER_CONFIG.replaceChar);

    // 阶段2：长度控制
    cleaned = cleaned.slice(0, FILTER_CONFIG.maxLength);

    // 阶段3：保留系统特殊名称检测
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]?)$/i.test(cleaned)) {
      cleaned = FILTER_CONFIG.replaceChar + cleaned; // 避免保留名称冲突
    }

    return cleaned;
  };

  // 应用过滤
  const newValue = sanitizeFilename(input.value);
  
  // 仅当值变化时更新（避免无限循环）
  if (input.value !== newValue) {
    input.value = newValue;
    blink(input); // 添加视觉反馈
  }

  // 更新文件路径显示
  updateFilePathDisplay(newValue);
});

function blink(element) {
  element.classList.add('blinking');
  setTimeout(() => element.classList.remove('blinking'), 500);
}

// 提取路径更新逻辑
function updateFilePathDisplay(fileName) {
  boardInfo.filePath = path.join(
    filePath, 
    fileName ? `${fileName}.hwb` : ''
  );
  filePathSpan.textContent = boardInfo.filePath || "未选择路径";
}

// 选择保存文件夹
choosePathBtn.addEventListener("click", () => {
  ipc.send("path-choose");
})

ipc.on("path-choose-result", (event, result) => {
  filePath = result[0];

  console.log("Path:" + filePath);
  boardInfo.filePath = path.join(filePath, input.value === "" ? "" : input.value + ".hwb");
  filePathSpan.textContent = boardInfo.filePath;
});

// 新建主题
newTemplateBtn.addEventListener("click", () => {
  ipc.send("open-modal-window", "NewFile", "NewTemplate", "new-template.html");
});

// 取消
cancelBtn.addEventListener("click", () => {
  ipc.send("close-window", "NewFile");
});

// 确认
// TODO: 不能有同名
confirmBtn.addEventListener("click", () => {
  if (boardInfo.templateID === null) {
    console.log("No template selected");
    return;
  }
  if (filePath === "" || input.value === "") {
    if (input.value === "") {
      input.focus();
      blink(input);
      console.log("No file name selected");
    }
    if (filePath === "") {
      choosePathBtn.focus();
      blink(choosePathBtn);
      console.log("No file path selected");
    }
    return;
  }
  console.log(boardInfo);
  ipc.send("create-new-board-templated", boardInfo);
});

function buttonLoadAdd(element) {
  let btn = document.createElement("button");
  let span = document.createElement("span");
  let img = document.createElement("img");
  // 加载按钮（在新建模版按钮后面插入）
  buttonList.insertBefore(btn, buttonList.children[1]);
  btn.appendChild(img);
  btn.appendChild(span);

  btn.className = "big-flex-btn";
  btn.id = element.id;
  span.innerHTML = element.data.name;
  if (element.data.backgroundType === "solid") {
    // 加载背景色
    img.style.background = element.data.background;
  } else {
    // 加载图片
    img.src = element.imgPath;
  }

  const choose = () => {
    console.log("Choose: " + element.id);
    // 当选中这个模版时，result.templateId = element.id
    boardInfo.templateID = element.id;
    // 遍历所有按钮，取消选中
    for (let i = 0; i < buttonList.children.length; i++) {
      buttonList.children[i].style.border = "2px solid transparent";
    }
    // 选中当前按钮
    btn.style.border = "2px solid #007aff";
  };
  choose(); // Init
  btn.addEventListener("click", choose);
}

// 删除模版及其按钮
// @param {Node} templateButton
function templateRemove(templateButton) {
  buttonList.removeChild(templateButton);
  ipc.send("template-remove", templateButton.id);
}

// 重命名模版
function templateRename(templateButton) {
  showRenameEditor(templateButton);
}

// 复制模版
function templateCopy(templateButton) {
}

/// 加载按钮
ipc.send("load-buttons", "NewFile");

ipc.on("buttons-loaded", (event, result) => {
  console.log(result);
  buttonList.innerHTML = "";
  buttonList.appendChild(newTemplateBtn);
  result.forEach((element) => {
    buttonLoadAdd(element);
  });
});

ipc.on("new-template-adding", (event, result) => {
  buttonLoadAdd(result.info);
});
