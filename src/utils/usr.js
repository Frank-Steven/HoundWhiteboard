/**
 * @file 配置管理模块
 * @module config-manager
 * @description 功能:
 * - 获取应用配置
 * @author Steven
 */
const { directory } = require("./io");
const { app } = require("electron");
const path = require("path");

function isPortable() {
  let appPath = app.getAppPath();
  console.log(appPath);
  return directory.parse(appPath).cd("data").exist();
}

/**
 * 获取应用配置 data 目录
 * 如果说是 portable，则返回当前目录下的 data 目录
 * 如果说是 installed，则返回 userData 目录
 * @returns {directory} data 目录实例
 */
function getDataDirectory() {
  if (isPortable()) {
    // portable
    const dataDir = new directory(app.getPath("exe"), "data");
    return dataDir;
  } else {
    // installed
    // 如果 userData 目录不存在，则创建它
    const userData = app.getPath("userData");
    const dataDir = new directory(userData, "data");
    dataDir.existOrMake();
    return dataDir;
  }
}

/**
 * 获取应用配置 cache 目录
 * 如果说是 portable，则返回当前目录下的 cache 目录
 * 如果说是 installed，则返回 userData 目录下的 cache 目录
 * @returns {directory} cache 目录实例
 */
function getCacheDirectory() {
  if (isPortable()) {
    // portable
    const cacheDir = new directory(app.getPath("exe"), "cache");
    return cacheDir;
  } else {
    // installed
    const userData = app.getPath("userData");
    const cacheDir = new directory(path.join(userData, "cache"));
    return cacheDir;
  }
}

/**
 * 获取 Documents 目录
 * @returns {directory} Documents 目录实例
 */
function getUserDataDocumentsDirectory() {
  const userData = app.getPath("documents");
  return directory.parse(userData);
}

// init
const userDataDirectory = getDataDirectory();
const cacheDirectory = getCacheDirectory();
const DocumentsDirectory = getUserDataDocumentsDirectory();

module.exports = {
  userDataDirectory,
  cacheDirectory,
  DocumentsDirectory,
};
