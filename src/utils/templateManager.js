/**
 * @file Template management module
 * @module TemplateManager
 * @description Handles:
 * - Template lifecycle (create, read, update, delete)
 * - Template metadata management
 * - Template IPC communication
 */

const winManager = require('./windowManager');
const { file, directory, fileNameRandomPool } = require('../classes/io');

let templatesDir, templatePool;
const templateMeta = {
  type: 'template',
  version: '0.1.0'
};

/**
 * Initializes template manager
 * @function init
 * @param {Object} app - Electron app object
 * @returns {void}
 */
function init(app) {
  const userDataDir = directory.parse(app.getPath('userData'));
  templatesDir = userDataDir.cd('templates').make();
  templatePool = new fileNameRandomPool(templatesDir);
}

/**
 * Saves a template
 * @function saveTemplate
 * @param {Object} template - Template object
 * @param {file} [template.texture] - Texture file (not currently used)
 * @param {string} [template.backgroundColor] - Background color in hex
 * @param {string} [template.backgroundImage] - Background image path
 * @param {string} template.name - Template name
 * @returns {Object} Result object
 * @returns {string} [returns.id] - Template ID
 * @returns {Object} [returns.data] - Template data
 * @returns {string} returns.data.name - Template name
 * @returns {string} returns.data.background - Background color or file extension
 * @returns {string} returns.data.backgroundType - "solid" or "image"
 * @returns {file} returns.imgFile - Image file reference
 */
function saveTemplate(template) {
  const tempDir = templatePool.generate();
  const templateID = tempDir.name;

  let templateData = {
    name: template.name,
    background: template.backgroundColor,
    backgroundType: 'solid'
  };

  if (template.backgroundImage) {
    const imgFile = file.parse(template.backgroundImage);
    const destImgFile = tempDir.peek('backgroundImage', imgFile.extension);
    imgFile.cp(destImgFile);
    templateData.background = imgFile.extension;
    templateData.backgroundType = 'image';
  }

  tempDir.peek('meta', 'json').writeJSON(templateMeta);
  tempDir.peek('template', 'json').writeJSON(templateData);

  return {
    id: templateID,
    data: templateData,
    imgFile: tempDir.cd(templateID).peek('backgroundImage', templateData.background)
  };
}

/**
 * Loads all templates
 * @function loadTemplateAll
 * @returns {Array<Object>} Array of template objects
 * @returns {string} returns[].id - Template ID
 * @returns {Object} returns[].data - Template data
 * @returns {string} returns[].data.name - Template name
 * @returns {string} returns[].data.background - Background color or file extension
 * @returns {string} returns[].data.backgroundType - "solid" or "image"
 * @returns {string} returns[].imgPath - Image file path
 */
function loadTemplateAll() {
  const templateDirs = templatesDir.lsDir().filter(dir => {
    const metaFile = dir.peek('meta', 'json');
    if (!metaFile.exist()) return false;
    return metaFile.catJSON().type === 'template';
  });

  return templateDirs.map(dir => {
    const templateData = dir.peek('template', 'json').catJSON();
    return {
      id: dir.name,
      data: templateData,
      imgPath: dir.peek('backgroundImage', templateData.background).getPath()
    };
  });
}

/**
 * Loads template by ID
 * @function loadTemplateByID
 * @param {string} templateID - Template ID
 * @returns {Object|null} Template object or null if not found
 * @returns {string} returns.id - Template ID
 * @returns {Object} returns.data - Template data
 * @returns {string} returns.data.name - Template name
 * @returns {string} returns.data.background - Background color or file extension
 * @returns {string} returns.data.backgroundType - "solid" or "image"
 * @returns {string} returns.imgPath - Image file path
 */
function loadTemplateByID(templateID) {
  const tempDir = templatesDir.cd(templateID);
  if (!tempDir.exist()) return null;
  const templateData = tempDir.peek('template', 'json').catJSON();
  return {
    id: templateID,
    data: templateData,
    imgPath: tempDir.peek('backgroundImage', templateData.background).getPath()
  };
}

/**
 * Removes a template
 * @function removeTemplate
 * @param {string} templateID - Template ID to remove
 * @returns {void}
 */
function removeTemplate(templateID) {
  templatePool.remove(templateID);
}

/**
 * Renames a template
 * @function renameTemplate
 * @param {string} templateID - Template ID to rename
 * @param {string} newName - New template name
 * @returns {string} New template ID
 */
function renameTemplate(templateID, newName) {
  const newDir = templatePool.rename(templateID);
  const infoFile = newDir.peek('template', 'json');
  let templateJSON = infoFile.catJSON();
  templateJSON.name = newName;
  infoFile.writeJSON(templateJSON);
  return newDir.name;
}

/**
 * Sets up template operation IPC handlers
 * @function setupTemplateOperationIPC
 * @param {Object} ipc - IPC main process object
 * @param {Object} windows - Collection of window objects
 * @returns {void}
 */
function setupTemplateOperationIPC(ipc, windows) {
  /**
   * IPC handler for new template result
   * @event new-template-result
   * @listens ipc#new-template-result
   */
  ipc.on('new-template-result', (event, result) => {
    const templateInfo = saveTemplate(result);
    windows.NewFile.webContents.send('new-template-adding', {
      info: templateInfo,
      result: result
    });
  });

  /**
   * IPC handler for loading template buttons
   * @event template-load-buttons
   * @listens ipc#template-load-buttons
   */
  ipc.handle('template-load-buttons', async (event, windowNow) => {
    return loadTemplateAll();
  });

  /**
   * IPC handler for removing template
   * @event template-remove
   * @listens ipc#template-remove
   */
  ipc.handle('template-remove', async (event, templateID, windowNow) => {
    removeTemplate(templateID);
    return templateID;
  });

  /**
   * IPC handler for renaming template
   * @event template-rename
   * @listens ipc#template-rename
   */
  ipc.handle('template-rename', async (event, templateID, name, windowNow) => {
    const newID = renameTemplate(templateID, name);
    return newID;
  });

  /**
   * IPC handler for editing template
   * @event template-edit
   * @listens ipc#template-edit
   */
  ipc.on('template-edit', (event, templateID) => {
    const info = loadTemplateByID(templateID);
    if (info) {
      const pathStr = file.parse(info.imgPath).unPeek().getPath();
      windows.NewTemplate = winManager.createModalWindow(
        'new-template.html',
        windows.NewFile,
        {
          width: 800,
          height: 600,
          minWidth: 800,
          minHeight: 600
        }
      );
      setTimeout(() => {
        windows.NewTemplate.webContents.send(
          'init-new-template-from-other-template',
          info.data,
          pathStr,
          templateID
        );
      }, 100);
    }
  });

  /**
   * IPC handler for copying template
   * @event template-copy
   * @listens ipc#template-copy
   */
  ipc.on('template-copy', (event, templateID) => {
    const info = loadTemplateByID(templateID);
    if (info) {
      const pathStr = file.parse(info.imgPath).unPeek().getPath();
      windows.NewTemplate = winManager.createModalWindow(
        'new-template.html',
        windows.NewFile,
        {
          width: 800,
          height: 600,
          minWidth: 800,
          minHeight: 600
        }
      );
      setTimeout(() => {
        windows.NewTemplate.webContents.send(
          'init-new-template-from-other-template',
          info.data,
          pathStr,
          null
        );
      }, 100);
    }
  });
}

module.exports = {
  init,
  saveTemplate,
  loadTemplateByID,
  loadTemplateAll,
  removeTemplate,
  renameTemplate,
  setupTemplateOperationIPC
};
