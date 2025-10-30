/**
 * @file New file creation module
 * @module NewFile
 * @description Handles:
 * - File name validation and sanitization
 * - Save path selection
 * - Template selection
 * - New file creation confirmation
 */

const path = require('path');
const { file, directory } = require('../../classes/io');
const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;

const Toast = require('../../utils/ui/toast');
const toast = new Toast();

// DOM elements
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
 * Applies visual feedback by blinking an element
 * @function blink
 * @param {HTMLElement} element - The element to apply blink effect
 * @returns {void}
 */
function blink(element) {
  element.classList.add('blinking');
  setTimeout(() => element.classList.remove('blinking'), 500);
}

/**
 * Sanitizes filename input according to OS restrictions
 * @function sanitizeFilename
 * @param {string} value - Raw filename input
 * @returns {string} Sanitized filename
 * @example
 * sanitizeFilename('my<file>.hwb'); // Returns 'my_file_.hwb'
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
 * Updates the file path display based on current input
 * @function updateFilePathDisplay
 * @param {string} fileName - Current filename input
 * @returns {void}
 */
function updateFilePathDisplay(fileName) {
  boardInfo.filePath = path.join(
    filePath, 
    fileName ? `${fileName}.hwb` : ''
  );
  filePathSpan.textContent = boardInfo.filePath || "未选择路径";
}

// Input validation
input.addEventListener('input', () => {
  const newValue = sanitizeFilename(input.value);
  
  if (input.value !== newValue) {
    input.value = newValue;
    blink(input);
  }

  updateFilePathDisplay(newValue);
});

/**
 * IPC event listener for path selection
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
 * IPC event listener for new template button
 * @event new-template-click
 * @listens HTMLElement#click
 */
newTemplateBtn.addEventListener('click', () => {
  ipc.send('open-modal-window', 'NewFile', 'NewTemplate', 'new-template.html');
});

/**
 * IPC event listener for cancel button
 * @event cancel-click
 * @listens HTMLElement#click
 */
cancelBtn.addEventListener('click', () => {
  ipc.send('close-window', 'NewFile');
});

/**
 * IPC event listener for confirm button
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
 * Selects a template button visually
 * @function chooseButton
 * @param {string} templateID - ID of the selected template
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
 * Creates and adds a template selection button
 * @function buttonLoadAdd
 * @param {Object} element - Template data object
 * @property {string} element.id - Template ID
 * @property {Object} element.data - Template metadata
 * @property {string} element.imgPath - Template preview image path
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

// Initialize template buttons
(async () => {
  const result = await ipc.invoke('template-load-buttons', 'NewFile');
  buttonList.innerHTML = '';
  buttonList.appendChild(newTemplateBtn);
  result.forEach((element) => {
    buttonLoadAdd(element);
  });
})();

/**
 * IPC event listener for new template addition
 * @event new-template-adding
 * @listens ipc#new-template-adding
 */
ipc.on('new-template-adding', (event, result) => {
  buttonLoadAdd(result.info);
});
