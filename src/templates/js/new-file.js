/**
 * @file 新建文件创建模块
 * @module NewFile
 * @description 处理:
 * - 文件名验证和清理
 * - 保存路径选择
 * - 模板选择
 * - 新建文件创建确认
 */

const path = require('path');
const { file, directory } = require('../../classes/io');

const Toast = require('../../utils/ui/toast');
const toast = new Toast();

// DOM 元素
const newTemplateBtn = document.getElementById('new-file-template-select-new-template');
const input = document.getElementById('new-file-save-form-input');
const filePathSpan = document.getElementById('new-file-save-path');
const choosePathBtn = document.getElementById('new-file-save-choosepath');
const confirmBtn = document.getElementById('yes-or-no-button-yes');
const cancelBtn = document.getElementById('yes-or-no-button-no');
const buttonList = document.getElementById('new-file-template-select-buttons');

let filePath = '';
const boardInfo = {
  templateID: null,
  filePath: null
};

/**
 * 通过闪烁元素来应用视觉反馈
 * @function blink
 * @param {HTMLElement} element - 要应用闪烁效果的元素
 * @returns {void}
 */
function blink(element) {
  element.classList.add('blinking');
  setTimeout(() => element.classList.remove('blinking'), 500);
}

/**
 * 根据操作系统限制清理文件名输入
 * @function sanitizeFilename
 * @param {string} value - 原始文件名输入
 * @returns {string} 清理后的文件名
 * @example
 * sanitizeFilename('my<file>.hwb'); // 返回 'my_file_.hwb'
 */
function sanitizeFilename(value) {
  const FILTER_CONFIG = {
    illegalChars: /[<>:"/\\.@|?*~$^'`\u0000-\u001F]/g,
    maxLength: 255 - '.hwb'.length,
    replaceChar: '_'
  };

  let cleaned = value.trim()
    .normalize('NFC')
    .replace(FILTER_CONFIG.illegalChars, FILTER_CONFIG.replaceChar);

  cleaned = cleaned.slice(0, FILTER_CONFIG.maxLength);

  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]?)$/i.test(cleaned)) {
    cleaned = FILTER_CONFIG.replaceChar + cleaned;
  }

  return cleaned;
}

/**
 * 根据当前输入更新文件路径显示
 * @function updateFilePathDisplay
 * @param {string} fileName - 当前文件名输入
 * @returns {void}
 */
function updateFilePathDisplay(fileName) {
  boardInfo.filePath = path.join(
    filePath, 
    fileName ? `${fileName}.hwb` : ''
  );
  filePathSpan.textContent = boardInfo.filePath || "未选择路径";
}

// 输入验证
input.addEventListener('input', () => {
  const newValue = sanitizeFilename(input.value);
  
  if (input.value !== newValue) {
    input.value = newValue;
    blink(input);
  }

  updateFilePathDisplay(newValue);
});

/**
 * 路径选择的 IPC 事件监听器
 * @event path-choose
 * @listens HTMLElement#click
 */
choosePathBtn.addEventListener('click', async () => {
  const result = await ipc.invoke('path-choose');
  if (result) {
    filePath = result[0];
    boardInfo.filePath = path.join(filePath, input.value === '' ? '' : input.value + '.hwb');
    filePathSpan.textContent = boardInfo.filePath;
  }
});

/**
 * 新建模板按钮的 IPC 事件监听器
 * @event new-template-click
 * @listens HTMLElement#click
 */
newTemplateBtn.addEventListener('click', () => {
  ipc.send('open-modal-window', 'NewFile', 'NewTemplate', 'new-template.html');
});

/**
 * 取消按钮的 IPC 事件监听器
 * @event cancel-click
 * @listens HTMLElement#click
 */
cancelBtn.addEventListener('click', () => {
  ipc.send('close-window', 'NewFile');
});

/**
 * 确认按钮的 IPC 事件监听器
 * @event confirm-click
 * @listens HTMLElement#click
 */
confirmBtn.addEventListener('click', () => {
  let canConfirm = true;
  
  if (!boardInfo.templateID) {
    blink(buttonList);
    toast.warning('请选择样式');
    canConfirm = false;
  }
  
  if (input.value === '') {
    input.focus();
    blink(input);
    toast.warning('请填写文件名');
    canConfirm = false;
  }
  
  if (filePath === '') {
    choosePathBtn.focus();
    blink(choosePathBtn);
    toast.warning('请选择路径');
    canConfirm = false;
  }
  
  if (input.value !== '' && filePath !== '') {
    if (directory.parse(boardInfo.filePath).peek(input.value, 'hwb').exist()) {
      input.focus();
      blink(input);
      toast.warning('已有同名文件存在');
      canConfirm = false;
    }
  }
  
  if (!canConfirm) return;
  ipc.send('create-new-board-templated', boardInfo);
});

/**
 * 可视化地选择模板按钮
 * @function chooseButton
 * @param {string} templateID - 所选模板的 ID
 * @returns {void}
 */
function chooseButton(templateID) {
  const button = document.getElementById(templateID);
  if (boardInfo.templateID) {
    document.getElementById(boardInfo.templateID)
            .style.border = '2px solid transparent';
  }
  boardInfo.templateID = templateID;
  button.style.border = '2px solid #007aff';
}

/**
 * 创建并添加模板选择按钮
 * @function buttonLoadAdd
 * @param {Object} element - 模板数据对象
 * @property {string} element.id - 模板 ID
 * @property {Object} element.data - 模板元数据
 * @property {string} element.imgPath - 模板预览图片路径
 * @returns {void}
 */
function buttonLoadAdd(element) {
  let btn = document.createElement('button');
  let span = document.createElement('span');
  let img = document.createElement('img');
  
  buttonList.insertBefore(btn, buttonList.children[1]);
  btn.appendChild(img);
  btn.appendChild(span);

  btn.className = 'big-flex-btn';
  btn.id = element.id;
  span.innerHTML = element.data.name;
  
  if (element.data.backgroundType === 'solid') {
    img.style.background = element.data.background;
  } else {
    img.src = element.imgPath;
  }

  const choose = () => {
    boardInfo.templateID = element.id;
    for (let i = 0; i < buttonList.children.length; i++) {
      buttonList.children[i].style.border = '2px solid transparent';
    }
    btn.style.border = '2px solid #007aff';
  };
  
  choose();
  btn.addEventListener('click', choose);
}

// 初始化模板按钮
(async () => {
  const result = await ipc.invoke('template-load-buttons', 'NewFile');
  buttonList.innerHTML = '';
  buttonList.appendChild(newTemplateBtn);
  result.forEach((element) => {
    buttonLoadAdd(element);
  });
})();

/**
 * 新建模板添加的 IPC 事件监听器
 * @event new-template-adding
 * @listens ipc#new-template-adding
 */
ipc.on('new-template-adding', (event, result) => {
  buttonLoadAdd(result.info);
});
