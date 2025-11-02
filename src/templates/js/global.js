/**
 * @file 主题和语言管理的全局工具
 * @description 功能:
 * - 处理主题
 * - 处理本地化
 * - 设置主题与语言变更的 IPC 通信处理
 */

const { ipcRenderer } = require("electron");
const ipc = ipcRenderer;

/**
 * 初始化语言和主题的 IPC 事件监听
 * @event settings-loaded
 * @listens ipc#settings-loaded
 * @param {Event} event - IPC 事件对象
 * @param {Object} settings - 应用程序设置对象
 * @property {string} settings.theme - 当前主题名称
 * @property {string} settings.language - 当前语言代码
 */
ipc.on("settings-loaded", (event, settings) => {
  window.settings = settings;
  setTheme();
  setLanguage();
});

/**
 * 通过更新 theme-stylesheet 的 HTMLElement 应用主题样式
 * @function setTheme
 * @returns {void}
 * @throws {Error} 当找不到 ID 为 theme-stylesheet 的 HTML 元素时
 * @example
 * // 假设 window.settings.theme 为 'dark'
 * setTheme(); // 加载 '../../../data/themes/dark.css'
 */
function setTheme() {
  const stylesheet = document.getElementById("theme-stylesheet");
  if (!stylesheet) {
    throw new Error('Theme stylesheet element not found');
  }
  stylesheet.href = `../../../data/themes/${window.settings.theme}.css`;
}

/**
 * 根据当前语言更新 DOM 中所有文本节点
 * @function setLanguage
 * @returns {void}
 * @fires languageChanged 语言变更事件
 * @throws {Error} 无法加载语言文件时抛出异常
 */
function setLanguage() {
  const language = require(`../../../data/languages/${window.settings.language}.json`);

  /**
   * 递归更新 DOM 中的文本节点
   * @function updateTextNodes
   * @param {Object} obj - 语言翻译对象
   * @param {string} [parentId=""] - 嵌套翻译的父元素 ID
   * @returns {void}
   */
  function updateTextNodes(obj, parentId = "") {
    for (const key in obj) {
      const currentId = parentId ? `${parentId}-${key}` : key;

      if (typeof obj[key] === "object") {
        updateTextNodes(obj[key], currentId);
      } else {
        const element = document.getElementById(currentId);
        if (element) {
          element.innerText = obj[key];
          // 特殊处理输入框（保留原逻辑）
          if (element.tagName === "INPUT" && element.placeholder) {
            element.placeholder = obj[key];
          }
        }
      }
    }
  }

  updateTextNodes(language.text);

  /**
   * 语言变更事件
   * @event languageChanged
   * @type {CustomEvent}
   * @property {Object} detail - 事件详情
   * @property {string} detail.lang - 新语言代码
   */
  const langEvent = new CustomEvent("languageChanged", {
    detail: { lang: window.settings.language },
  });
  document.dispatchEvent(langEvent);
}

/**
 * 监听设置变更的 IPC 事件
 * @event settings-changed
 * @listens ipc#settings-changed
 * @param {Event} event - IPC 事件对象
 * @param {Object} settings - 更新后的应用程序设置
 */
ipc.on("settings-changed", (event, settings) => {
  console.log("Settings changed.");
  window.settings = settings;
  setTheme();
  setLanguage();
});
