/**
 * @file Board management module
 * @module BoardManager
 * @description Handles:
 * - Board lifecycle (create, open, save)
 * - Page management
 * - Template application
 */

const winManager = require('./windowManager');
const { fileNameRandomPool, directory, file } = require('../classes/io');

let templatesDir;

// Metadata constants
const boardMeta = {
  type: 'board',
  version: '0.1.0'
};

const pageMeta = {
  type: 'page',
  version: '0.1.0'
};

/**
 * Initializes board manager
 * @function init
 * @param {Object} app - Electron app object
 * @returns {void}
 */
function init(app) {
  templatesDir = new directory(app.getPath('userData'), 'templates').make();
}

/**
 * Creates an empty board
 * @function createEmptyBoard
 * @param {Object} boardInfo - Board information
 * @param {string} [boardInfo.filePath] - File path for the board
 * @param {string} [boardInfo.templateID] - Template ID to apply
 * @returns {void}
 */
function createEmptyBoard(boardInfo) {
  // Create root directory
  const boardFile = file.parse(boardInfo.filePath);
  const tempDir = new directory(boardFile.address, boardFile.name).rmWhenExist().make();

  // Create metadata files
  tempDir.peek('meta', 'json').writeJSON(boardMeta);
  tempDir.peek('histroy', 'json').writeJSON([]);

  // Create pages directory
  tempDir.cd('pages').make();

  // Generate first page
  const pagePool = new fileNameRandomPool(tempDir.cd('pages'));
  const firstPageDir = pagePool.generate();
  const firstPageID = firstPageDir.name;

  // Create page metadata and data
  firstPageDir.peek('meta', 'json').writeJSON(pageMeta);
  firstPageDir.cd('assets').make();
  firstPageDir.peek('page', 'json').writeJSON({
    strokes: [],
    assets: []
  });

  // Create pages list
  tempDir.peek('pages', 'json').writeJSON([
    {
      templateID: boardInfo.templateID,
      pageID: firstPageID
    }
  ]);

  // Copy template assets
  tempDir.cd('templates');
  templatesDir.cd(boardInfo.templateID)
              .cp(tempDir.cd('templates').cd(boardInfo.templateID));

  // Compress and hide temporary directory
  tempDir.compress(boardFile, false);
  tempDir.hide();
}

/**
 * Adds a new page to the board
 * @function addPage
 * @param {fileNameRandomPool} pool - Filename random pool instance
 * @param {string} templateID - Template ID to apply
 * @returns {Object} Result object
 * @returns {fileNameRandomPool} pool - Updated filename random pool
 * @returns {string} pageID - New page ID
 */
function addPage(pool, templateID) {
  const newPageDir = pool.generate();

  // Create page metadata and data
  newPageDir.peek('meta', 'json').writeJSON(pageMeta);
  newPageDir.peek('page', 'json').writeJSON({
    strokes: [],
    assets: []
  });
  newPageDir.cd('assets').make();

  return {
    pool: pool,
    pageID: newPageDir.name
  };
}

/**
 * Opens a board file
 * @function openBoard
 * @param {file} boardFile - .hwb file to open
 * @returns {BrowserWindow} Browser window instance
 */
function openBoard(boardFile) {
  let win = winManager.createFullScreenWindow('full-screen.html');

  const fileDir = new directory(boardFile.address, boardFile.name);
  directory.getHideResult(fileDir).rmWhenExist();

  // Extract and hide temporary directory
  const tempDir = boardFile.extract(fileDir).hide();

  // Send path to renderer when loaded
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('board-opened', tempDir.getPath());
  });
  return win;
}

/**
 * Saves a board
 * @function saveBoard
 * @param {directory} boardDir - Board directory to save
 * @returns {void}
 */
function saveBoard(boardDir) {
  const boardFile = new file(boardDir.address, boardDir.name.substring(1), 'hwb').rmWhenExist();
  boardDir.compress(boardFile, true);
}

module.exports = {
  openBoard,
  saveBoard,
  createEmptyBoard,
  addPage,
  init
};
