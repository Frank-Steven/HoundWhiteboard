/**
 * @file Template context menu module
 * @module TemplateContextMenu
 * @description Handles:
 * - Right-click context menu for templates
 * - Template operations (rename, delete, edit, copy)
 * - Menu positioning and visibility
 */

const { ipcRenderer } = require('electron');
const ipc = ipcRenderer;

// DOM elements
const contextMenu = document.getElementById('context-menu');
let currentContextButton = null;

/**
 * Renames a template
 * @function templateRename
 * @param {HTMLElement} templateButton - The template button element
 * @returns {void}
 */
function templateRename(templateButton) {
  showRenameEditor(templateButton);
}

/**
 * Removes a template and its button
 * @function templateRemove
 * @param {HTMLElement} templateButton - The template button element
 * @returns {Promise<void>}
 */
async function templateRemove(templateButton) {
  const templateID = await ipc.invoke('template-remove', templateButton.id, 'NewFile');
  if (templateID) {
    const templateButton = document.getElementById(templateID);
    if (!templateButton) return; // Button already removed
    if (boardInfo.templateID === templateButton.id) {
      boardInfo.templateID = null;
    }
    buttonList.removeChild(templateButton);
  }
}

/**
 * Edits a template
 * @function templateEdit
 * @param {HTMLElement} templateButton - The template button element
 * @returns {void}
 */
function templateEdit(templateButton) {
  ipc.send('template-edit', templateButton.id);
}

/**
 * Copies a template
 * @function templateCopy
 * @param {HTMLElement} templateButton - The template button element
 * @returns {void}
 */
function templateCopy(templateButton) {
  ipc.send('template-copy', templateButton.id);
}

/**
 * Shows context menu at specified coordinates
 * @function showContextMenu
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {HTMLElement} button - The button element that triggered the menu
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
 * Displays context menu with position adjustments
 * @function displayContextMenu
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {HTMLElement} button - The button element that triggered the menu
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
 * Hides the context menu
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
 * Adds context menu functionality to a button
 * @function addContextMenuToButton
 * @param {HTMLElement} button - The button element to add context menu to
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
 * IPC event listener for context menu actions
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

// Global event listeners
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

// Extend buttonLoadAdd to include context menu for new buttons
const originalButtonLoadAdd = buttonLoadAdd;
buttonLoadAdd = function(element) {
  originalButtonLoadAdd(element);

  const newButton = document.getElementById(element.id);
  if (newButton) {
    addContextMenuToButton(newButton);
  }
};
