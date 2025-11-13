/**
 * @file 文件打开模块
 * @module file-open-manager
 * @description 功能:
 * - 文件操作对话框 (打开/保存)
 */

const { dialog } = require('electron');

/**
 * 设置文件操作 IPC 处理器
 * @function setupFileOpenIPC
 * @param {Object} ipc - IPC 主进程对象
 * @param {Object} windows - 窗口对象集合
 */
function setupFileOpenIPC(ipc, windows) {
  /**
   * 打开 HWB 文件的 IPC 处理器
   * @event open-hwb-file
   * @listens ipc#open-hwb-file
   */
  ipc.handle('open-hwb-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: 'HoundWhiteboard 文件', extensions: ['hwb'] }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * 打开 HMQ 文件的 IPC 处理器
   * @event open-hmq-file
   * @listens ipc#open-hmq-file
   */
  ipc.handle('open-hmq-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: 'HoundWhiteboard 模块文件', extensions: ['hmq'] }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * 打开图片文件的 IPC 处理器
   * @event open-img-file
   * @listens ipc#open-img-file
   */
  ipc.handle('open-img-file', async (event, windowNow) => {
    const result = await dialog.showOpenDialog(windows[windowNow], {
      properties: ['openFile'],
      filters: [
        {
          name: '图片文件',
          extensions: [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 
            'tif', 'tiff', 'svg', 'webp', 'apng', 'avif'
          ]
        }
      ]
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });

  /**
   * 选择目录路径的 IPC 处理器
   * @event path-choose
   * @listens ipc#path-choose
   */
  ipc.handle('path-choose', async (event) => {
    const result = await dialog.showOpenDialog(windows['NewFile'], {
      properties: ['openDirectory']
    });

    if (!result.canceled) {
      return result.filePaths;
    }
    return null;
  });
}

module.exports = {
  setupFileOpenIPC
}
