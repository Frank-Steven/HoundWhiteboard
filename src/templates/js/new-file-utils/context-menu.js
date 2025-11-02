/**
 * 重命名模板
 * @function templateRename
 * @param {HTMLElement} templateButton - 模板按钮元素
 */
function templateRename(templateButton) {
  if (typeof window.showRenameEditor === 'function') {
    window.showRenameEditor(templateButton);
  }
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
 */
function templateEdit(templateButton) {
  ipc.send('template-edit', templateButton.id);
}

/**
 * 复制模板
 * @function templateCopy
 * @param {HTMLElement} templateButton - 模板按钮元素
 */
function templateCopy(templateButton) {
  ipc.send('template-copy', templateButton.id);
}

/**
 * 显示右键菜单
 * @function showContextMenu
 * @param {HTMLElement} button - 触发右键菜单的按钮元素
 * @param {number} x - 鼠标 X 坐标
 * @param {number} y - 鼠标 Y 坐标
 */
function showContextMenu(button, x, y) {
  window.currentContextButton = button;
  if (window.contextMenuWindow) {
    window.contextMenuWindow.showAt(x, y);
  }
}

/**
 * 隐藏右键菜单
 * @function hideContextMenu
 */
function hideContextMenu() {
  if (window.contextMenuWindow) {
    window.contextMenuWindow.hide();
  }
}

/**
 * 为按钮添加上下文菜单功能
 * @function addContextMenuToButton
 * @param {HTMLElement} button - 要添加上下文菜单的按钮元素
 */
window.addContextMenuToButton = function(button) {
  if (button.id === 'new-file-template-select-new-template') {
    return;
  }

  button.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(button, e.clientX, e.clientY);
  });
}

/**
 * 上下文菜单操作的 IPC 事件监听器
 * @event context-menu-action
 * @listens HTMLElement#click
 */
const contextMenuContent = document.querySelector('#context-menu .context-menu-content');
if (contextMenuContent) {
  contextMenuContent.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (!menuItem) return;

    const action = menuItem.dataset.action;
    
    // 隐藏菜单
    hideContextMenu();

    switch (action) {
      case 'copy':
        templateCopy(window.currentContextButton);
        break;
      case 'edit':
        templateEdit(window.currentContextButton);
        break;
      case 'rename':
        templateRename(window.currentContextButton);
        break;
      case 'remove':
        templateRemove(window.currentContextButton);
        break;
    }
  });
}
