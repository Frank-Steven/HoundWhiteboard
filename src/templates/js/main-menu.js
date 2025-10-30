/**
 * @file Main menu module for application navigation and settings
 * @module MainMenu
 * @description Handles:
 * - Sidebar navigation
 * - Start screen operations (new/open files)
 * - Settings management (theme/language selection)
 */

const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;
const fs = require('fs');

// Sidebar elements
const sidebarButtons = document.querySelectorAll('.sidebar-button');
const contentScreens = document.querySelectorAll('.content-screen');

/**
 * Activates a content screen by adding 'content-active' class
 * @function activateScreen
 * @param {HTMLElement} screen - The screen element to activate
 * @returns {void}
 */
function activateScreen(screen) {
  contentScreens.forEach((scr) => {
    scr.classList.remove('content-active');
  });
  screen.classList.add('content-active');
}

/**
 * Activates a sidebar button by adding 'content-active' class
 * @function activateButton
 * @param {HTMLElement} button - The button element to activate
 * @returns {void}
 */
function activateButton(button) {
  sidebarButtons.forEach((btn) => {
    btn.classList.remove('content-active');
  });
  button.classList.add('content-active');
}

// Setup sidebar navigation
sidebarButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const scr = document.getElementById(btn.dataset.targetScreen);
    activateScreen(scr);
    activateButton(btn);
  });
});

// Activate default screen
sidebarButtons[0].classList.add('content-active');
contentScreens[0].classList.add('content-active');

// Start screen elements
const startNewBtn = document.getElementById('main-menu-content-start-buttons-new');
const startOpenBtn = document.getElementById('main-menu-content-start-buttons-open');

/**
 * IPC event listener for new file button click
 * @event new-file-click
 * @listens HTMLElement#click
 */
startNewBtn.addEventListener('click', () => {
  ipc.send('open-modal-window', 'MainMenu', 'NewFile', 'new-file.html');
});

/**
 * IPC event listener for open file button click
 * @event open-file-click
 * @listens HTMLElement#click
 */
startOpenBtn.addEventListener('click', async () => {
  const filePath = await ipc.invoke('open-hwb-file', 'MainMenu');
  if (filePath) {
    ipc.send('open-board-templated', filePath[0]);
  }
});

// Settings screen elements
const themeSelect = document.getElementById('main-menu-content-settings-theme-select');
const languageSelect = document.getElementById('main-menu-content-settings-language-select');

// Populate theme options
const themes = fs.readdirSync('./src/data/themes');
themes.forEach((theme) => {
  const option = document.createElement('option');
  option.value = theme.replace('.css', '');
  option.text = theme.replace('.css', '');
  themeSelect.add(option);
});

// Populate language options
const languages = fs.readdirSync('./src/data/languages');
languages.forEach((lang) => {
  const option = document.createElement('option');
  option.value = lang.replace('.json', '');
  option.text = lang.replace('.json', '');
  languageSelect.add(option);
});

/**
 * Resets select elements to match current settings
 * @function resetSelects
 * @returns {void}
 */
function resetSelects() {
  // Set theme selection
  for (let i = 0; i < themeSelect.options.length; i++) {
    if (themeSelect.options[i].value === window.settings.theme) {
      themeSelect.selectedIndex = i;
      break;
    }
  }

  // Set language selection
  for (let i = 0; i < languageSelect.options.length; i++) {
    if (languageSelect.options[i].value === window.settings.language) {
      languageSelect.selectedIndex = i;
      break;
    }
  }
}

// Settings buttons
const saveBtn = document.getElementById('main-menu-content-settings-buttons-save');
const cancelBtn = document.getElementById('main-menu-content-settings-buttons-cancel');

/**
 * IPC event listener for settings save
 * @event settings-save
 * @listens HTMLElement#click
 */
saveBtn.addEventListener('click', () => {
  window.settings.theme = themeSelect.value;
  window.settings.language = languageSelect.value;
  ipc.send('settings-changed', window.settings);
});

/**
 * IPC event listener for settings loaded
 * @event settings-loaded
 * @listens ipc#settings-loaded
 */
ipc.on('settings-loaded', (event, settings) => {
  window.settings = settings;
  resetSelects();
});

/**
 * Event listener for settings cancel
 * @event settings-cancel
 * @listens HTMLElement#click
 */
cancelBtn.addEventListener('click', () => {
  resetSelects();
});
