/**
 * @file Template rename module
 * @module TemplateRename
 * @description Handles:
 * - Inline template renaming functionality
 * - Name validation and sanitization
 * - Internationalized error messages
 * - Rename operation execution
 */

// DOM elements
const renameEditor = document.getElementById('rename-editor');
const renameInput = document.getElementById('rename-editor-input');
const renameError = document.getElementById('rename-editor-error');
const renameConfirmBtn = document.getElementById('rename-editor-confirm-btn');
const renameCancelBtn = document.getElementById('rename-editor-cancel-btn');

let currentRenameButton = null;
let originalTemplateName = '';
let renameTexts = {};

/**
 * Filename validation configuration
 * @constant RENAME_FILTER_CONFIG
 * @type {Object}
 * @property {RegExp} illegalChars - Regex for illegal characters
 * @property {number} maxLength - Maximum allowed length
 * @property {string} replaceChar - Replacement character for illegal chars
 */
const RENAME_FILTER_CONFIG = {
  illegalChars: /[<>:"/\\.@|?*~$^'`\u0000-\u001F]/g,
  maxLength: 255 - '.hwb'.length,
  replaceChar: '_'
};

/**
 * Loads internationalized texts for the rename editor
 * @function loadRenameTexts
 * @returns {void}
 */
function loadRenameTexts() {
  const language = require(`../../data/languages/${window.settings.language}.json`);
  renameTexts = language.text['rename-editor'];
}

/**
 * IPC event listener for language change
 * @event languageChanged
 * @listens document#languageChanged
 */
document.addEventListener('languageChanged', () => {
  loadRenameTexts();
});

// Initial load
setTimeout(() => {
  if (window.settings) {
    loadRenameTexts();
  }
}, 100);

/**
 * Shows the rename editor for a template button
 * @function showRenameEditor
 * @param {HTMLElement} templateButton - The template button element
 * @returns {void}
 */
function showRenameEditor(templateButton) {
  if (!templateButton) return;

  currentRenameButton = templateButton;
  const nameSpan = templateButton.querySelector('span');
  originalTemplateName = nameSpan ? nameSpan.textContent.trim() : '';

  renameInput.value = originalTemplateName;
  clearRenameError();
  renameEditor.classList.add('show');

  setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 100);

  hideContextMenu();
}

/**
 * Hides the rename editor
 * @function hideRenameEditor
 * @returns {void}
 */
function hideRenameEditor() {
  renameEditor.classList.remove('show');
  currentRenameButton = null;
  originalTemplateName = '';
  renameInput.value = '';
  clearRenameError();
  renameConfirmBtn.classList.remove('loading');
  renameConfirmBtn.disabled = false;
}

/**
 * Clears rename error state
 * @function clearRenameError
 * @returns {void}
 */
function clearRenameError() {
  renameError.textContent = '';
  renameError.classList.remove('show');
  renameInput.classList.remove('error');
}

/**
 * Shows rename error message
 * @function showRenameError
 * @param {string} message - Error message to display
 * @returns {void}
 */
function showRenameError(message) {
  renameError.textContent = message;
  renameError.classList.add('show');
  renameInput.classList.add('error');
  renameInput.classList.add('shake');
  setTimeout(() => {
    renameInput.classList.remove('shake');
  }, 300);
}

/**
 * Validates template name
 * @function validateTemplateName
 * @param {string} name - Template name to validate
 * @returns {Object} Validation result
 * @property {boolean} valid - Whether name is valid
 * @property {string} [error] - Error message if invalid
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
 * Sanitizes template name
 * @function sanitizeTemplateName
 * @param {string} value - Raw template name
 * @returns {string} Sanitized template name
 */
function sanitizeTemplateName(value) {
  let cleaned = value.trim()
                     .normalize('NFC')
                     .replace(RENAME_FILTER_CONFIG.illegalChars, RENAME_FILTER_CONFIG.replaceChar);

  cleaned = cleaned.slice(0, RENAME_FILTER_CONFIG.maxLength);

  return cleaned;
}

/**
 * Performs the rename operation
 * @function performRename
 * @returns {Promise<void>}
 */
async function performRename() {
  chooseButton(currentRenameButton.id);
  const newName = renameInput.value.trim();
  
  const validation = validateTemplateName(newName);
  if (!validation.valid) {
    showRenameError(validation.error);
    return;
  }

  clearRenameError();
  renameConfirmBtn.classList.add('loading');
  renameConfirmBtn.disabled = true;

  const nameSpan = currentRenameButton.querySelector('span');
  if (nameSpan) {
    nameSpan.textContent = newName;
  }

  const newID = await ipc.invoke('template-rename', currentRenameButton.id, newName, "NewFile");
  if (newID) {
    currentRenameButton.id = newID;
    hideRenameEditor();
  }
}

/**
 * Input event listener for real-time validation
 * @event input
 * @listens HTMLElement#input
 */
renameInput.addEventListener('input', () => {
  const newValue = sanitizeTemplateName(renameInput.value);
  
  if (renameInput.value !== newValue) {
    renameInput.value = newValue;
  }

  if (renameError.classList.contains('show')) {
    clearRenameError();
  }
});

/**
 * IPC event listener for confirm button
 * @event confirm-click
 * @listens HTMLElement#click
 */
renameConfirmBtn.addEventListener('click', () => {
  performRename();
});

/**
 * IPC event listener for cancel button
 * @event cancel-click
 * @listens HTMLElement#click
 */
renameCancelBtn.addEventListener('click', () => {
  hideRenameEditor();
});

/**
 * Keyboard event listener for rename input
 * @event keydown
 * @listens HTMLElement#keydown
 */
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performRename();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideRenameEditor();
  }
});

/**
 * Click event listener for editor backdrop
 * @event click
 * @listens HTMLElement#click
 */
renameEditor.addEventListener('click', (e) => {
  if (e.target.classList.contains('rename-editor-backdrop')) {
    hideRenameEditor();
  }
});

// Prevent click propagation
document.querySelector('.rename-editor-container').addEventListener('click', (e) => {
  e.stopPropagation();
});
