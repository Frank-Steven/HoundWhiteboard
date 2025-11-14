/**
 * @file 应用程序导航和设置的主菜单
 * @description 功能:
 * - 侧边栏导航
 * - 开始屏幕操作（新建/打开文件）
 * - 设置管理（主题/语言选择）
 */

const fs = require('fs');

// 侧边栏元素
const sidebarButtons = document.querySelectorAll('.sidebar-button');
const contentScreens = document.querySelectorAll('.content-screen');

/**
 * 通过添加 'content-active' 类来激活内容屏幕
 *
 * @param {HTMLElement} screen - 要激活的屏幕元素
 */
function activateScreen(screen) {
  contentScreens.forEach((scr) => {
    scr.classList.remove('content-active');
  });
  screen.classList.add('content-active');
}

/**
 * 通过添加 'content-active' 类来激活侧边栏按钮
 *
 * @param {HTMLElement} button - 要激活的按钮元素
 */
function activateButton(button) {
  sidebarButtons.forEach((btn) => {
    btn.classList.remove('content-active');
  });
  button.classList.add('content-active');
}

// 设置侧边栏导航
sidebarButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const scr = document.getElementById(btn.dataset.targetScreen);
    activateScreen(scr);
    activateButton(btn);
  });
});

// 激活默认屏幕
sidebarButtons[0].classList.add('content-active');
contentScreens[0].classList.add('content-active');

// 开始屏幕元素
const startNewBtn = document.getElementById('main-menu-content-start-buttons-new');
const startOpenBtn = document.getElementById('main-menu-content-start-buttons-open');

/**
 * 新建文件按钮点击的 IPC 事件监听器
 * @event new-file-click
 * @listens HTMLElement#click
 */
startNewBtn.addEventListener('click', () => {
  ipc.send('open-modal-window', 'MainMenu', 'NewFile', 'new-file');
});

/**
 * 打开文件按钮点击的 IPC 事件监听器
 * @event open-file-click
 * @listens HTMLElement#click
 */
startOpenBtn.addEventListener('click', async () => {
  const filePath = await ipc.invoke('open-hwb-file', 'MainMenu');
  if (filePath) {
    ipc.send('open-board-templated', filePath[0]);
  }
});

// 设置屏幕元素
const themeSelect = document.getElementById('main-menu-content-settings-theme-select');
const languageSelect = document.getElementById('main-menu-content-settings-language-select');

// FIXME: 这个应从这里移走
// 填充主题选项
const themes = fs.readdirSync('./data/themes');
themes.forEach((theme) => {
  const option = document.createElement('option');
  option.value = theme.replace('.css', '');
  option.text = theme.replace('.css', '');
  themeSelect.add(option);
});

// 填充语言选项
const languages = fs.readdirSync('./data/languages');
languages.forEach((lang) => {
  const option = document.createElement('option');
  option.value = lang.replace('.json', '');
  option.text = lang.replace('.json', '');
  languageSelect.add(option);
});

/**
 * 重置选择元素以匹配当前设置
 */
function resetSelects() {
  // 设置主题选择
  for (let i = 0; i < themeSelect.options.length; i++) {
    if (themeSelect.options[i].value === window.settings.theme) {
      themeSelect.selectedIndex = i;
      break;
    }
  }

  // 设置语言选择
  for (let i = 0; i < languageSelect.options.length; i++) {
    if (languageSelect.options[i].value === window.settings.language) {
      languageSelect.selectedIndex = i;
      break;
    }
  }
}

// 设置按钮
const saveBtn = document.getElementById('main-menu-content-settings-buttons-save');
const cancelBtn = document.getElementById('main-menu-content-settings-buttons-cancel');

/**
 * 设置保存的 IPC 事件监听器
 * @event settings-save
 * @listens HTMLElement#click
 */
saveBtn.addEventListener('click', () => {
  window.settings.theme = themeSelect.value;
  window.settings.language = languageSelect.value;
  ipc.send('settings-changed', window.settings);
});

/**
 * 设置加载的 IPC 事件监听器
 * @event settings-loaded
 * @listens ipc#settings-loaded
 */
ipc.on('settings-loaded', (event, settings) => {
  window.settings = settings;
  resetSelects();
});

/**
 * 设置取消的事件监听器
 * @event settings-cancel
 * @listens HTMLElement#click
 */
cancelBtn.addEventListener('click', () => {
  resetSelects();
});
