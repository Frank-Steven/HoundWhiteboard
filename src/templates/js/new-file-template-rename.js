/**
 * @file 新建文件中的模板重命名
 * @requires new-file.js
 * @description 功能:
 * - 内联模板重命名功能
 * - 名称验证和清理
 * - 国际化错误消息
 * - 重命名操作执行
 */

// DOM 元素
const renameEditor = document.getElementById('rename-editor');
const renameInput = document.getElementById('rename-editor-input');
const renameError = document.getElementById('rename-editor-error');
const renameConfirmBtn = document.getElementById('rename-editor-confirm-btn');
const renameCancelBtn = document.getElementById('rename-editor-cancel-btn');

let currentRenameButton = null;
let originalTemplateName = '';
let renameTexts = {};

/**
 * 文件名验证配置
 * @constant RENAME_FILTER_CONFIG
 * @type {Object}
 * @property {RegExp} illegalChars - 非法字符的正则表达式
 * @property {number} maxLength - 最大允许长度
 * @property {string} replaceChar - 非法字符的替换字符
 */
const RENAME_FILTER_CONFIG = {
  illegalChars: /[<>:"/\\.@|?*~$^'`\u0000-\u001F]/g,
  maxLength: 255 - '.hwb'.length,
  replaceChar: '_'
};

/**
 * 为重命名编辑器加载国际化文本
 * @function loadRenameTexts
 */
function loadRenameTexts() {
  const language = require(`../../../data/languages/${window.settings.language}.json`);
  renameTexts = language.text['rename-editor'];
}

/**
 * 语言更改的 IPC 事件监听器
 * @event languageChanged
 * @listens document#languageChanged
 */
document.addEventListener('languageChanged', () => {
  loadRenameTexts();
});

// 初始加载
setTimeout(() => {
  if (window.settings) {
    loadRenameTexts();
  }
}, 100);

/**
 * 为模板按钮显示重命名编辑器
 * @function showRenameEditor
 * @param {HTMLElement} templateButton - 模板按钮元素
 */
function showRenameEditor(templateButton) {
  if (!templateButton) return;

  currentRenameButton = templateButton;
  const nameSpan = templateButton.querySelector('span');
  originalTemplateName = nameSpan ? nameSpan.textContent.trim() : '';

  renameInput.value = originalTemplateName;
  clearRenameError();
  renameEditor.classList.add('show');

  setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 100);

  hideContextMenu();
}

/**
 * 隐藏重命名编辑器
 * @function hideRenameEditor
 */
function hideRenameEditor() {
  renameEditor.classList.remove('show');
  currentRenameButton = null;
  originalTemplateName = '';
  renameInput.value = '';
  clearRenameError();
  renameConfirmBtn.classList.remove('loading');
  renameConfirmBtn.disabled = false;
}

/**
 * 清除重命名错误状态
 * @function clearRenameError
 */
function clearRenameError() {
  renameError.textContent = '';
  renameError.classList.remove('show');
  renameInput.classList.remove('error');
}

/**
 * 显示重命名错误消息
 * @function showRenameError
 * @param {string} message - 要显示的错误消息
 */
function showRenameError(message) {
  renameError.textContent = message;
  renameError.classList.add('show');
  renameInput.classList.add('error');
  renameInput.classList.add('shake');
  setTimeout(() => {
    renameInput.classList.remove('shake');
  }, 300);
}

/**
 * 验证模板名称
 * @function validateTemplateName
 * @param {string} name - 要验证的模板名称
 * @returns {Object} 验证结果
 * @property {boolean} valid - 名称是否有效
 * @property {string} [error] - 如果无效则返回错误消息
 */
function validateTemplateName(name) {
  if (!name || name.trim() === '') {
    return { valid: false, error: renameTexts.errors?.empty || 'Template name cannot be empty' };
  }

  if (name.length > RENAME_FILTER_CONFIG.maxLength) {
    const errorMsg = renameTexts.errors?.['too-long'] || 'Template name is too long (max {max} characters)';
    return { valid: false, error: errorMsg.replace('{max}', RENAME_FILTER_CONFIG.maxLength) };
  }

  if (RENAME_FILTER_CONFIG.illegalChars.test(name)) {
    return { valid: false, error: renameTexts.errors?.['illegal-chars'] || 'Template name contains illegal characters' };
  }

  if (name.trim() === originalTemplateName) {
    return { valid: false, error: renameTexts.errors?.['same-name'] || 'New name is the same as the original' };
  }

  return { valid: true };
}

/**
 * 清理模板名称
 * @function sanitizeTemplateName
 * @param {string} value - 原始模板名称
 * @returns {string} 清理后的模板名称
 */
function sanitizeTemplateName(value) {
  let cleaned = value.trim()
                     .normalize('NFC')
                     .replace(RENAME_FILTER_CONFIG.illegalChars, RENAME_FILTER_CONFIG.replaceChar);

  cleaned = cleaned.slice(0, RENAME_FILTER_CONFIG.maxLength);

  return cleaned;
}

/**
 * 执行重命名操作
 * @function performRename
 * @returns {Promise<void>}
 */
async function performRename() {
  chooseButton(currentRenameButton.id);
  const newName = renameInput.value.trim();
  
  const validation = validateTemplateName(newName);
  if (!validation.valid) {
    showRenameError(validation.error);
    return;
  }

  clearRenameError();
  renameConfirmBtn.classList.add('loading');
  renameConfirmBtn.disabled = true;

  const nameSpan = currentRenameButton.querySelector('span');
  if (nameSpan) {
    nameSpan.textContent = newName;
  }

  const newID = await ipc.invoke('template-rename', currentRenameButton.id, newName, "NewFile");
  if (newID) {
    currentRenameButton.id = newID;
    hideRenameEditor();
  }
}

/**
 * 实时验证的输入事件监听器
 * @event input
 * @listens HTMLElement#input
 */
renameInput.addEventListener('input', () => {
  const newValue = sanitizeTemplateName(renameInput.value);
  
  if (renameInput.value !== newValue) {
    renameInput.value = newValue;
  }

  if (renameError.classList.contains('show')) {
    clearRenameError();
  }
});

/**
 * 确认按钮的 IPC 事件监听器
 * @event confirm-click
 * @listens HTMLElement#click
 */
renameConfirmBtn.addEventListener('click', () => {
  performRename();
});

/**
 * 取消按钮的 IPC 事件监听器
 * @event cancel-click
 * @listens HTMLElement#click
 */
renameCancelBtn.addEventListener('click', () => {
  hideRenameEditor();
});

/**
 * 重命名输入的键盘事件监听器
 * @event keydown
 * @listens HTMLElement#keydown
 */
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performRename();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideRenameEditor();
  }
});

/**
 * 编辑器背景的点击事件监听器
 * @event click
 * @listens HTMLElement#click
 */
renameEditor.addEventListener('click', (e) => {
  if (e.target.classList.contains('rename-editor-backdrop')) {
    hideRenameEditor();
  }
});

// 阻止点击传播
document.querySelector('.rename-editor-container').addEventListener('click', (e) => {
  e.stopPropagation();
});
