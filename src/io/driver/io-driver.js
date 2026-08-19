/**
 * @file IoDriver 契约与校验辅助
 * @description 定义 IoDriver 执行器契约（操作枚举、方法签名、绑定辅助），driver 只处理 root 相对路径，不做权限判断。
 * @module io/driver/io-driver
 * @author Zhou Chenyu
 */

import { isValidRelPath, normalizeRel } from "../core/dsl.js";

/**
 * 操作枚举
 * @readonly
 * @enum {string}
 */
export const OP = {
  READ: "read",
  WRITE: "write",
  LS: "ls",
  STAT: "stat",
  EXISTS: "exists",
  RM: "rm",
  CP: "cp",
  MV: "mv",
  MKDIR: "mkdir",
  HIDE: "hide",
  UNHIDE: "unhide",
  IS_HIDDEN: "isHidden",
  ZIP_FROM: "zipFrom",
  ZIP_EXTRACT: "zipExtract",
  ZIP_LIST: "zipList",
};

/**
 * 校验并规范化驱动层相对路径
 * @param {*} rel - 相对路径
 * @returns {string|null} 规范化后的相对路径或 null（非法）
 *
 * @description
 * 先拒绝绝对路径与反斜杠，再去除重复分隔符后校验各段。
 */
export const normalizeDriverRel = (rel) => {
  if (typeof rel !== "string") return null;
  if (rel.startsWith("/") || rel.includes("\\")) return null;
  const norm = normalizeRel(rel);
  if (!isValidRelPath(norm)) return null;
  return norm;
};

/**
 * 目录条目
 * @typedef {Object} DriverEntry
 * @property {string} name - 条目名称
 * @property {boolean} isDir - 是否为目录
 * @property {boolean} isFile - 是否为文件
 * @property {boolean} isSymlink - 是否为符号链接
 * @property {boolean} hidden - 是否隐藏
 */

/**
 * 文件状态
 * @typedef {Object} DriverStat
 * @property {number} size - 字节大小
 * @property {boolean} isDir - 是否为目录
 * @property {boolean} isFile - 是否为文件
 * @property {boolean} isSymlink - 是否为符号链接
 * @property {boolean} hidden - 是否隐藏
 * @property {number} [createdAt] - 创建时间戳（毫秒）
 * @property {number} [modifiedAt] - 修改时间戳（毫秒）
 */

/**
 * 隐藏操作结果
 * @typedef {Object} HideResult
 * @property {boolean} success - 是否成功
 * @property {string} path - 操作后的相对路径（隐藏可能重命名）
 */

/**
 * ZIP 条目
 * @typedef {Object} ZipEntryInfo
 * @property {string} name - 条目名称
 * @property {number} size - 原始大小
 * @property {number} compressedSize - 压缩后大小
 * @property {boolean} isDirectory - 是否为目录
 */

/**
 * IoDriver 契约（JSDoc 接口）
 * @description
 * 所有文件操作方法第一参数为 rootId（显式传参，driver 无状态），其后为 root 相对路径。
 * 方法不抛业务错误：失败返回 null/false/[]；不执行权限判断（由 api 层与可信执行面负责）。
 * @typedef {Object} IoDriver
 * @property {(rootId: string, relPath: string) => Promise<string|null>} read - 读取文件（默认 utf8）
 * @property {(rootId: string, relPath: string, content: string, encoding?: string) => Promise<boolean>} write - 写入文件
 * @property {(rootId: string, relPath: string) => Promise<DriverEntry[]>} ls - 列出目录条目
 * @property {(rootId: string, relPath: string) => Promise<DriverStat|null>} stat - 获取文件状态
 * @property {(rootId: string, relPath: string) => Promise<boolean>} exists - 检查路径是否存在
 * @property {(rootId: string, relPath: string) => Promise<boolean>} rm - 删除文件或目录
 * @property {(rootId: string, srcRel: string, destRel: string) => Promise<boolean>} cp - 复制文件或目录
 * @property {(rootId: string, srcRel: string, destRel: string) => Promise<boolean>} mv - 移动文件或目录
 * @property {(rootId: string, relPath: string) => Promise<boolean>} mkdir - 创建目录
 * @property {(rootId: string, relPath: string) => Promise<HideResult|null>} hide - 隐藏文件
 * @property {(rootId: string, relPath: string) => Promise<HideResult|null>} unhide - 取消隐藏
 * @property {(rootId: string, relPath: string) => Promise<boolean>} isHidden - 检查是否隐藏
 * @property {(rootId: string, srcRel: string, outRel: string) => Promise<boolean>} zipFrom - 将文件或目录打包为 ZIP
 * @property {(rootId: string, zipRel: string, targetRel: string) => Promise<boolean>} zipExtract - 解压 ZIP 到目录
 * @property {(rootId: string, zipRel: string) => Promise<ZipEntryInfo[]>} zipList - 列出 ZIP 条目
 * @property {(absPath: string) => Promise<{rootId: string}>} registerRoot - 注册根目录并返回 rootId
 * @property {(rootId: string) => Promise<boolean>} unregisterRoot - 注销根目录
 * @property {() => Promise<string[]>} listRoots - 列出已注册根目录 id
 */

/**
 * 校验驱动实现是否满足契约
 * @param {*} driver - 待校验驱动
 * @returns {boolean} 是否满足契约
 */
export const isIoDriver = (driver) => {
  if (!driver || typeof driver !== "object") return false;

  const METHODS = [
    "read",
    "write",
    "ls",
    "stat",
    "exists",
    "rm",
    "cp",
    "mv",
    "mkdir",
    "hide",
    "unhide",
    "isHidden",
    "zipFrom",
    "zipExtract",
    "zipList",
  ];

  return METHODS.every((m) => typeof driver[m] === "function");
};

/**
 * 将 IoDriver 绑定到指定 rootId（返回无 rootId 参数的窄接口）
 * @param {import("./io-driver.js").IoDriver} driver - 底层驱动
 * @param {string} rootId - 根目录 id
 * @returns {Object} 绑定后的驱动窄接口（文件操作方法签名与 IoDriver 一致但不含 rootId）
 *
 * @description
 * 供 api 层与 kernel adapter 使用：持有 rootId 的调用方通过绑定窄接口避免重复传参。
 */
export const bindRoot = (driver, rootId) => {
  const bound = {};

  for (const method of [
    "read",
    "write",
    "ls",
    "stat",
    "exists",
    "rm",
    "cp",
    "mv",
    "mkdir",
    "hide",
    "unhide",
    "isHidden",
    "zipFrom",
    "zipExtract",
    "zipList",
  ]) {
    bound[method] = (...args) => driver[method](rootId, ...args);
  }

  return bound;
};
