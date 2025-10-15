/// 内联重命名编辑器功能

const renameEditor = document.getElementById('rename-editor');
const renameInput = document.getElementById('rename-editor-input');
const renameError = document.getElementById('rename-editor-error');
const renameConfirmBtn = document.getElementById('rename-editor-confirm-btn');
const renameCancelBtn = document.getElementById('rename-editor-cancel-btn');

let currentRenameButton = null;
let originalTemplateName = '';
let renameTexts = {}; // 存储国际化文本

// 文件名验证配置（复用输入框的配置）
const RENAME_FILTER_CONFIG = {
  illegalChars: /[<>:"/\\.@|?*~$^'`\u0000-\u001F]/g,
  maxLength: 255 - '.hwb'.length,
  replaceChar: '_'
};


// 加载国际化文本
function loadRenameTexts() {
  const language = require(`../../data/languages/${window.settings.language}.json`);
  renameTexts = language.text['rename-editor'];
}

// 监听语言变化
document.addEventListener('languageChanged', () => {
  loadRenameTexts();
});

// 初始加载（延迟执行以确保settings已加载）
setTimeout(() => {
  if (window.settings) {
    loadRenameTexts();
  }
}, 100);

// 显示重命名编辑器
function showRenameEditor(templateButton) {
  if (!templateButton) return;

  currentRenameButton = templateButton;

  // 获取当前模板名称
  const nameSpan = templateButton.querySelector('span');
  originalTemplateName = nameSpan ? nameSpan.textContent.trim() : '';

  // 设置输入框初始值
  renameInput.value = originalTemplateName;

  // 清除错误状态
  clearRenameError();

  // 显示编辑器
  renameEditor.classList.add('show');

  // 聚焦并选中文本
  setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 100);

  // 隐藏上下文菜单
  hideContextMenu();
}

// 隐藏重命名编辑器
function hideRenameEditor() {
  renameEditor.classList.remove('show');
  currentRenameButton = null;
  originalTemplateName = '';
  renameInput.value = '';
  clearRenameError();
  renameConfirmBtn.classList.remove('loading');
  renameConfirmBtn.disabled = false;
}

// 清除错误提示
function clearRenameError() {
  renameError.textContent = '';
  renameError.classList.remove('show');
  renameInput.classList.remove('error');
}

// 显示错误提示
function showRenameError(message) {
  renameError.textContent = message;
  renameError.classList.add('show');
  renameInput.classList.add('error');

  // 抖动输入框
  renameInput.classList.add('shake');
  setTimeout(() => {
    renameInput.classList.remove('shake');
  }, 300);
}

// 验证文件名
function validateTemplateName(name) {
  // 检查是否为空
  if (!name || name.trim() === '') {
    return { valid: false, error: renameTexts.errors?.empty || 'Template name cannot be empty' };
  }

  // 检查长度
  if (name.length > RENAME_FILTER_CONFIG.maxLength) {
    const errorMsg = renameTexts.errors?.['too-long'] || 'Template name is too long (max {max} characters)';
    return { valid: false, error: errorMsg.replace('{max}', RENAME_FILTER_CONFIG.maxLength) };
  }

  // 检查非法字符
  if (RENAME_FILTER_CONFIG.illegalChars.test(name)) {
    return { valid: false, error: renameTexts.errors?.['illegal-chars'] || 'Template name contains illegal characters' };
  }

  // 检查是否与原名称相同
  if (name.trim() === originalTemplateName) {
    return { valid: false, error: renameTexts.errors?.['same-name'] || 'New name is the same as the original' };
  }

  return { valid: true };
}

// 清理文件名
function sanitizeTemplateName(value) {
  let cleaned = value.trim()
                     .normalize('NFC')
                     .replace(RENAME_FILTER_CONFIG.illegalChars, RENAME_FILTER_CONFIG.replaceChar);

  cleaned = cleaned.slice(0, RENAME_FILTER_CONFIG.maxLength);

  return cleaned;
}

// 执行重命名
function performRename() {
  const newName = renameInput.value.trim();
  
  // 验证名称
  const validation = validateTemplateName(newName);
  if (!validation.valid) {
    showRenameError(validation.error);
    return;
  }

  // 清除错误
  clearRenameError();

  // 显示加载状态
  renameConfirmBtn.classList.add('loading');
  renameConfirmBtn.disabled = true;

  // 更新按钮显示的名称
  const nameSpan = currentRenameButton.querySelector('span');
  if (nameSpan) {
    nameSpan.textContent = newName;
  }

  // 发送IPC消息到主进程执行实际的重命名操作
  ipc.send('template-rename', currentRenameButton.id, newName, "NewFile");
}

ipc.on("template-rename-result", (event, newID) => {
  currentRenameButton.id = newID;
  hideRenameEditor();
  // TODO: 根据实际IPC响应处理成功/失败，添加成功提示
});

// 输入框实时验证和清理
renameInput.addEventListener('input', () => {
  const newValue = sanitizeTemplateName(renameInput.value);
  
  if (renameInput.value !== newValue) {
    renameInput.value = newValue;
  }

  // 清除错误提示（用户正在输入）
  if (renameError.classList.contains('show')) {
    clearRenameError();
  }
});

// 确认按钮点击
renameConfirmBtn.addEventListener('click', () => {
  performRename();
});

// 取消按钮点击
renameCancelBtn.addEventListener('click', () => {
  hideRenameEditor();
});

// 键盘事件处理
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performRename();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideRenameEditor();
  }
});

// 点击背景关闭编辑器
renameEditor.addEventListener('click', (e) => {
  if (e.target.classList.contains('rename-editor-backdrop')) {
    hideRenameEditor();
  }
});

// 防止编辑器内部点击冒泡
document.querySelector('.rename-editor-container').addEventListener('click', (e) => {
  e.stopPropagation();
});