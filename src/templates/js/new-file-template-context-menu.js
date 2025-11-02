/**
 * @file 新建文件中的模板上下文菜单
 * @requires new-file.js
 * @description 功能:
 * - 模板的右键上下文菜单
 * - 模板操作（重命名、删除、编辑、复制）
 * - 菜单定位和可见性
 */

const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;

// DOM 元素
const contextMenu = document.getElementById('context-menu');
let currentContextButton = null;

/**
 * 重命名模板
 * @function templateRename
 * @param {HTMLElement} templateButton - 模板按钮元素
 * @returns {void}
 */
function templateRename(templateButton) {
  showRenameEditor(templateButton);
}

/**
 * 删除模板及其按钮
 * @function templateRemove
 * @param {HTMLElement} templateButton - 模板按钮元素
 * @returns {Promise<void>}
 */
async function templateRemove(templateButton) {
  const templateID = await ipc.invoke('template-remove', templateButton.id, 'NewFile');
  if (templateID) {
    const templateButton = document.getElementById(templateID);
    if (!templateButton) return; // 按钮已被删除
    if (boardInfo.templateID === templateButton.id) {
      boardInfo.templateID = null;
    }
    buttonList.removeChild(templateButton);
  }
}

/**
 * 编辑模板
 * @function templateEdit
 * @param {HTMLElement} templateButton - 模板按钮元素
 * @returns {void}
 */
function templateEdit(templateButton) {
  ipc.send('template-edit', templateButton.id);
}

/**
 * 复制模板
 * @function templateCopy
 * @param {HTMLElement} templateButton - 模板按钮元素
 * @returns {void}
 */
function templateCopy(templateButton) {
  ipc.send('template-copy', templateButton.id);
}

/**
 * 在指定坐标显示上下文菜单
 * @function showContextMenu
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {HTMLElement} button - 触发菜单的按钮元素
 * @returns {void}
 */
function showContextMenu(x, y, button) {
  if (contextMenu.classList.contains('show')) {
    hideContextMenu();
    setTimeout(() => {
      displayContextMenu(x, y, button);
    }, 150);
  } else {
    displayContextMenu(x, y, button);
  }
}

/**
 * 显示上下文菜单并调整位置
 * @function displayContextMenu
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {HTMLElement} button - 触发菜单的按钮元素
 * @returns {void}
 */
function displayContextMenu(x, y, button) {
  currentContextButton = button;

  document.querySelectorAll('.big-flex-btn.context-active').forEach(btn => {
    btn.classList.remove('context-active');
  });

  if (button) {
    button.classList.add('context-active');
  }

  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.add('show');

  const rect = contextMenu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (rect.right > viewportWidth) {
    contextMenu.style.left = `${viewportWidth - rect.width - 10}px`;
  }

  if (rect.bottom > viewportHeight) {
    contextMenu.style.top = `${viewportHeight - rect.height - 10}px`;
  }
}

/**
 * 隐藏上下文菜单
 * @function hideContextMenu
 * @returns {void}
 */
function hideContextMenu() {
  contextMenu.classList.remove('show');

  if (currentContextButton) {
    currentContextButton.classList.remove('context-active');
    currentContextButton = null;
  }
}

/**
 * 为按钮添加上下文菜单功能
 * @function addContextMenuToButton
 * @param {HTMLElement} button - 要添加上下文菜单的按钮元素
 * @returns {void}
 */
function addContextMenuToButton(button) {
  if (button.id === 'new-file-template-select-new-template') {
    return;
  }

  button.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, button);
  });
}

/**
 * 上下文菜单操作的 IPC 事件监听器
 * @event context-menu-action
 * @listens HTMLElement#click
 */
contextMenu.addEventListener('click', (e) => {
  const menuItem = e.target.closest('.context-menu-item');
  if (!menuItem) return;

  const action = menuItem.dataset.action;

  switch (action) {
    case 'copy':
      templateCopy(currentContextButton);
      break;
    case 'edit':
      templateEdit(currentContextButton);
      break;
    case 'rename':
      templateRename(currentContextButton);
      break;
    case 'remove':
      templateRemove(currentContextButton);
      break;
  }

  hideContextMenu();
});

// 全局事件监听器
document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideContextMenu();
  }
});

window.addEventListener('scroll', hideContextMenu);
document.getElementById('new-file-template-select')
        .addEventListener('scroll', hideContextMenu);

window.addEventListener('resize', hideContextMenu);

// 扩展 buttonLoadAdd 以为新按钮包含上下文菜单
const originalButtonLoadAdd = buttonLoadAdd;
buttonLoadAdd = function(element) {
  originalButtonLoadAdd(element);

  const newButton = document.getElementById(element.id);
  if (newButton) {
    addContextMenuToButton(newButton);
  }
};
