/// 右键上下文菜单功能

const contextMenu = document.getElementById("context-menu");
let currentContextButton = null;

// 重命名模版
function templateRename(templateButton) {
  showRenameEditor(templateButton);
}

/** 
 * 删除模版及其按钮
 * @param {HTMLElement} templateButton
 */
async function templateRemove(templateButton) {
  // TODO: 添加一个确认删除的提示窗
  const templateID = await ipc.invoke("template-remove", templateButton.id, "NewFile");
  if (templateID) {
    const templateButton = document.getElementById(templateID);
    if(!templateButton) return; // 按钮已移除
    if(boardInfo.templateID === templateButton.id) {
      boardInfo.templateID = null;
    }
    buttonList.removeChild(templateButton);
  }
}

/**
 * 编辑模版
 * @param {HTMLElement} templateButton
 */
function templateEdit(templateButton) {
  ipc.send("template-edit", templateButton.id);
}

// 复制模版
function templateCopy(templateButton) {
}

// 显示上下文菜单
function showContextMenu(x, y, button) {
  // 如果菜单已经显示,先隐藏并等待动画完成
  if (contextMenu.classList.contains("show")) {
    hideContextMenu();
    // 等待淡出动画完成后再显示新菜单
    setTimeout(() => {
      displayContextMenu(x, y, button);
    }, 150); // 与CSS中的transition时间一致
  } else {
    displayContextMenu(x, y, button);
  }
}

// 实际显示菜单的函数
function displayContextMenu(x, y, button) {
  // 保存当前右键点击的按钮
  currentContextButton = button;

  // 移除之前的激活状态
  document.querySelectorAll(".big-flex-btn.context-active").forEach(btn => {
    btn.classList.remove("context-active");
  });

  // 添加当前按钮的激活状态
  if (button) {
    button.classList.add("context-active");
  }

  // 设置菜单位置
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  // 显示菜单
  contextMenu.classList.add("show");

  // 调整菜单位置以防止超出视口
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

// 隐藏上下文菜单
function hideContextMenu() {
  contextMenu.classList.remove("show");

  // 移除激活状态
  if (currentContextButton) {
    currentContextButton.classList.remove("context-active");
    currentContextButton = null;
  }
}

// 为所有按钮添加右键菜单事件
function addContextMenuToButton(button) {
  // 排除新建模板按钮
  if (button.id === "new-file-template-select-new-template") {
    return;
  }

  // 阻止默认右键菜单
  button.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 显示自定义菜单
    showContextMenu(e.clientX, e.clientY, button);
  });
}

// 点击菜单项处理
contextMenu.addEventListener("click", (e) => {
  const menuItem = e.target.closest(".context-menu-item");
  if (!menuItem) return;

  const action = menuItem.dataset.action;

  switch (action) {
    case "copy":
      console.log("copy", currentContextButton);
      templateCopy(currentContextButton);
      break;
    case "rename":
      console.log("rename", currentContextButton);
      templateRename(currentContextButton);
      break;
    case "remove":
      console.log("remove", currentContextButton);
      templateRemove(currentContextButton);
      break;
  }

  // 关闭菜单
  hideContextMenu();
});

// 点击其他地方关闭菜单
document.addEventListener("click", (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// ESC键关闭菜单
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideContextMenu();
  }
});

// 窗口滚动时关闭菜单
window.addEventListener("scroll", hideContextMenu);
document.getElementById("new-file-template-select")
        .addEventListener("scroll", hideContextMenu);

// 窗口大小改变时关闭菜单
window.addEventListener("resize", hideContextMenu);

// 修改 buttonLoadAdd 函数，为动态添加的按钮也添加右键菜单
const originalButtonLoadAdd = buttonLoadAdd;
buttonLoadAdd = function(element) {
  originalButtonLoadAdd(element);

  // 为新添加的按钮添加右键菜单
  const newButton = document.getElementById(element.id);
  if (newButton) {
    addContextMenuToButton(newButton);
  }
};
