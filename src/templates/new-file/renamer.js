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
  const language = require(`../../../../data/languages/${window.settings.language}.json`);
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
 * 显示重命名编辑器
 * @function showRenameEditor
 * @param {HTMLElement} templateButton - 要重命名的模板按钮
 */
window.showRenameEditor = function(templateButton) {
  currentRenameButton = templateButton;
  const nameSpan = templateButton.querySelector('span');
  originalTemplateName = nameSpan ? nameSpan.textContent : '';
  
  // 设置输入框的值
  renameInput.value = originalTemplateName;
  renameInput.placeholder = renameTexts.placeholder || 'Enter template name';
  
  // 设置标题
  const titleElement = document.getElementById('rename-editor-title');
  if (titleElement) {
    titleElement.textContent = renameTexts.title || 'Rename Template';
  }
  
  // 设置提示文本
  const hintElement = document.getElementById('rename-editor-hint');
  if (hintElement) {
    hintElement.textContent = renameTexts.hint || 'Press Enter to confirm, Esc to cancel';
  }
  
  // 设置按钮文本
  const cancelElement = document.getElementById('rename-editor-cancel');
  const confirmElement = document.getElementById('rename-editor-confirm');
  if (cancelElement) {
    cancelElement.textContent = renameTexts.cancel || 'Cancel';
  }
  if (confirmElement) {
    confirmElement.textContent = renameTexts.confirm || 'Confirm';
  }
  
  // 清除错误
  window.clearRenameError();
  
  // 显示窗口
  if (window.renameEditorWindow) {
    window.renameEditorWindow.show();
    
    // 聚焦并选中输入框
    setTimeout(() => {
      renameInput.focus();
      renameInput.select();
    }, 100);
  }
}

/**
 * 隐藏重命名编辑器
 * @function hideRenameEditor
 */
window.hideRenameEditor = function() {
  if (window.renameEditorWindow) {
    window.renameEditorWindow.hide();
  }
  
  // 清除状态
  currentRenameButton = null;
  originalTemplateName = '';
  renameInput.value = '';
  window.clearRenameError();
  renameConfirmBtn.classList.remove('loading');
  renameConfirmBtn.disabled = false;
}

/**
 * 显示重命名错误
 * @function showRenameError
 * @param {string} message - 错误消息
 */
window.showRenameError = function(message) {
  renameError.textContent = message;
  renameError.style.display = 'block';
  renameInput.classList.add('error');
}

/**
 * 清除重命名错误
 * @function clearRenameError
 */
window.clearRenameError = function() {
  renameError.textContent = '';
  renameError.style.display = 'none';
  renameInput.classList.remove('error');
}

/**
 * 执行重命名操作
 * @function performRename
 * @returns {Promise<void>}
 */
async function performRename() {
  if (typeof window.chooseButton === 'function') {
    window.chooseButton(currentRenameButton.id);
  }
  const newName = renameInput.value.trim();
  
  const validation = validateTemplateName(newName);
  if (!validation.valid) {
    window.showRenameError(validation.error);
    return;
  }

  window.clearRenameError();
  renameConfirmBtn.classList.add('loading');
  renameConfirmBtn.disabled = true;

  const nameSpan = currentRenameButton.querySelector('span');
  if (nameSpan) {
    nameSpan.textContent = newName;
  }

  try {
    const newID = await ipc.invoke('template-rename', currentRenameButton.id, newName, "NewFile");
    if (newID) {
      currentRenameButton.id = newID;
      window.hideRenameEditor();
    } else {
      window.showRenameError(renameTexts.errors?.failed || 'Rename failed');
      renameConfirmBtn.classList.remove('loading');
      renameConfirmBtn.disabled = false;
    }
  } catch (error) {
    window.showRenameError(error.message || renameTexts.errors?.failed || 'Rename failed');
    renameConfirmBtn.classList.remove('loading');
    renameConfirmBtn.disabled = false;
  }
}

// 事件监听器
if (renameConfirmBtn) {
  renameConfirmBtn.addEventListener('click', performRename);
}

if (renameCancelBtn) {
  renameCancelBtn.addEventListener('click', () => {
    window.hideRenameEditor();
  });
}

// 输入框事件
if (renameInput) {
  renameInput.addEventListener('input', () => {
    const sanitized = sanitizeTemplateName(renameInput.value);
    if (renameInput.value !== sanitized) {
      renameInput.value = sanitized;
    }
    window.clearRenameError();
  });

  // 键盘事件
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      window.hideRenameEditor();
    }
  });
}
