/**
 * @file Global utilities module for theme and language management
 * @module GlobalUtils
 * @description Handles:
 * - Theme switching functionality
 * - Language translation system
 * - IPC communication for settings changes
 */

const { ipcRenderer } = require("electron");
const ipc = ipcRenderer;

/**
 * IPC event listener for initial settings load
 * @event settings-loaded
 * @listens ipc#settings-loaded
 * @param {Event} event - IPC event object
 * @param {Object} settings - Application settings object
 * @property {string} settings.theme - Current theme name
 * @property {string} settings.language - Current language code
 */
ipc.on("settings-loaded", (event, settings) => {
  window.settings = settings;
  setTheme();
  setLanguage();
});

/**
 * Sets the application theme by updating the theme stylesheet
 * @function setTheme
 * @returns {void}
 * @throws {Error} If theme stylesheet element is not found
 * @example
 * // Assuming window.settings.theme is 'dark'
 * setTheme(); // Loads '../../data/themes/dark.css'
 */
function setTheme() {
  const stylesheet = document.getElementById("theme-stylesheet");
  if (!stylesheet) {
    throw new Error('Theme stylesheet element not found');
  }
  stylesheet.href = `../../data/themes/${window.settings.theme}.css`;
}

/**
 * Updates all text nodes in the DOM based on current language
 * @function setLanguage
 * @returns {void}
 * @fires languageChanged
 * @throws {Error} If language file cannot be loaded
 */
function setLanguage() {
  const language = require(`../../data/languages/${window.settings.language}.json`);

  /**
   * Recursively updates text nodes in the DOM
   * @function updateTextNodes
   * @param {Object} obj - Language translation object
   * @param {string} [parentId=""] - Parent element ID for nested translations
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
          // Special handling for input placeholders
          if (element.tagName === "INPUT" && element.placeholder) {
            element.placeholder = obj[key];
          }
        }
      }
    }
  }

  updateTextNodes(language.text);

  /**
   * Language changed event
   * @event languageChanged
   * @type {CustomEvent}
   * @property {Object} detail - Event details
   * @property {string} detail.lang - New language code
   */
  const langEvent = new CustomEvent("languageChanged", {
    detail: { lang: window.settings.language },
  });
  document.dispatchEvent(langEvent);
}

/**
 * IPC event listener for settings changes
 * @event settings-changed
 * @listens ipc#settings-changed
 * @param {Event} event - IPC event object
 * @param {Object} settings - Updated application settings
 */
ipc.on("settings-changed", (event, settings) => {
  console.log("Settings changed.");
  window.settings = settings;
  setTheme();
  setLanguage();
});
