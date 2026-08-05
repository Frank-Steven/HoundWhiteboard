/**
 * @file SafeIO 对外 API
 * @description 提供 registerRoot → open → handle 的安全 IO 操作面；权限检查与审计在句柄内闭包完成，执行经注入的 IoDriver。
 * @module io/api/safe-io
 * @author Zhou Chenyu
 */

import { entryToRel, isValidRelPath, normalizeRel } from "../core/dsl.js";
import {
  PERMISSION_KEYS,
  checkPermissions,
  getPreset,
  isValidPermissions,
  mergePermissions,
} from "../core/policy.js";
import { bindRoot, isIoDriver } from "../driver/io-driver.js";

/**
 * 根目录引用
 * @typedef {Object} RootRef
 * @property {string} rootId - 根目录 id
 * @property {Object} permissions - 根目录权限声明
 */

/**
 * 审计条目
 * @typedef {Object} AuditEntry
 * @property {number} timestamp - 时间戳
 * @property {string} op - 操作名
 * @property {string} rel - 相对路径
 * @property {boolean} success - 是否成功
 */

/**
 * 创建操作句柄
 * @param {Object} params - 参数
 * @param {Object} params.driver - 绑定 rootId 后的驱动窄接口
 * @param {string} params.rel - 句柄绑定的相对路径
 * @param {Object} params.permissions - 句柄权限
 * @returns {Object} 句柄对象
 */
const createHandle = ({ driver, rel, permissions }) => {
  /** @type {boolean} */
  let revoked = false;
  /** @type {AuditEntry[]} */
  const auditHistory = [];

  /**
   * 检查句柄状态与权限
   * @param {string} op - 操作名
   * @returns {boolean} 是否允许执行
   */
  const allow = (op) => {
    if (revoked) return false;
    return checkPermissions(permissions, op);
  };

  /**
   * 记录审计条目
   * @param {string} op - 操作名
   * @param {boolean} success - 是否成功
   * @param {string} [targetRel] - 目标相对路径（cp/mv/zip 使用）
   * @returns {void}
   */
  const audit = (op, success, targetRel) => {
    const entry = {
      timestamp: Date.now(),
      op,
      rel: targetRel || rel,
      success,
    };
    auditHistory.push(entry);
    if (auditHistory.length > 100) auditHistory.shift();
  };

  return Object.freeze({
    /** @type {string} 句柄绑定的相对路径 */
    rel,
    /** @type {Object} 句柄权限（冻结副本） */
    permissions: Object.freeze({ ...permissions }),

    /**
     * 读取文件
     * @returns {Promise<string|null>} 文件内容或 null
     */
    async read() {
      if (!allow("read")) return null;
      const result = await driver.read(rel);
      audit("read", result !== null);
      return result;
    },

    /**
     * 写入文件
     * @param {string} content - 内容
     * @returns {Promise<boolean>} 是否成功
     */
    async write(content) {
      if (!allow("write")) return false;
      const result = await driver.write(rel, content);
      audit("write", result);
      return result;
    },

    /**
     * 列出目录条目
     * @returns {Promise<Array>} 条目列表
     */
    async ls() {
      if (!allow("ls")) return [];
      const result = await driver.ls(rel);
      audit("ls", true);
      return result;
    },

    /**
     * 获取文件状态
     * @returns {Promise<Object|null>} 状态或 null
     */
    async stat() {
      if (!allow("stat")) return null;
      const result = await driver.stat(rel);
      audit("stat", result !== null);
      return result;
    },

    /**
     * 检查路径是否存在
     * @returns {Promise<boolean>} 是否存在
     */
    async exists() {
      if (!allow("exists")) return false;
      const result = await driver.exists(rel);
      audit("exists", result);
      return result;
    },

    /**
     * 删除文件或目录
     * @returns {Promise<boolean>} 是否成功
     */
    async rm() {
      if (!allow("rm")) return false;
      const result = await driver.rm(rel);
      audit("rm", result);
      return result;
    },

    /**
     * 创建目录
     * @returns {Promise<boolean>} 是否成功
     */
    async mkdir() {
      if (!allow("mkdir")) return false;
      const result = await driver.mkdir(rel);
      audit("mkdir", result);
      return result;
    },

    /**
     * 复制到目标相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async cp(destRel) {
      if (!allow("cp") || !isValidRelPath(destRel)) return false;
      const result = await driver.cp(rel, normalizeRel(destRel));
      audit("cp", result, normalizeRel(destRel));
      return result;
    },

    /**
     * 移动到目标相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mv(destRel) {
      if (!allow("mv") || !isValidRelPath(destRel)) return false;
      const result = await driver.mv(rel, normalizeRel(destRel));
      audit("mv", result, normalizeRel(destRel));
      return result;
    },

    /**
     * 隐藏文件或目录
     * @returns {Promise<Object|null>} 结果或 null
     */
    async hide() {
      if (!allow("hide")) return null;
      const result = await driver.hide(rel);
      audit("hide", Boolean(result?.success));
      return result;
    },

    /**
     * 取消隐藏
     * @returns {Promise<Object|null>} 结果或 null
     */
    async unhide() {
      if (!allow("unhide")) return null;
      const result = await driver.unhide(rel);
      audit("unhide", Boolean(result?.success));
      return result;
    },

    /**
     * 检查是否隐藏
     * @returns {Promise<boolean>} 是否隐藏
     */
    async isHidden() {
      if (!allow("isHidden")) return false;
      const result = await driver.isHidden(rel);
      audit("isHidden", result);
      return result;
    },

    /**
     * 打包为 ZIP
     * @param {string} outRel - 输出 ZIP 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipFrom(outRel) {
      if (!allow("zipFrom") || !isValidRelPath(outRel)) return false;
      const result = await driver.zipFrom(rel, normalizeRel(outRel));
      audit("zipFrom", result, normalizeRel(outRel));
      return result;
    },

    /**
     * 解压 ZIP 到目录
     * @param {string} targetRel - 目标目录相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipExtract(targetRel) {
      if (!allow("zipExtract") || !isValidRelPath(targetRel)) return false;
      const result = await driver.zipExtract(rel, normalizeRel(targetRel));
      audit("zipExtract", result, normalizeRel(targetRel));
      return result;
    },

    /**
     * 列出 ZIP 条目
     * @returns {Promise<Array>} 条目列表
     */
    async zipList() {
      if (!allow("zipList")) return [];
      const result = await driver.zipList(rel);
      audit("zipList", true);
      return result;
    },

    /**
     * 撤销句柄
     * @returns {void}
     */
    revoke() {
      revoked = true;
      audit("revoke", true);
    },

    /**
     * 检查句柄是否已撤销
     * @returns {boolean} 是否已撤销
     */
    isRevoked() {
      return revoked;
    },

    /**
     * 获取审计历史
     * @returns {AuditEntry[]} 审计历史副本
     */
    getAuditHistory() {
      return [...auditHistory];
    },
  });
};

/**
 * SafeIO 安全 IO 操作面
 * @class
 */
export class SafeIO {
  /**
   * 构造函数
   * @param {import("../driver/io-driver.js").IoDriver} driver - IoDriver 实现
   * @throws {Error} driver 不满足契约
   */
  constructor(driver) {
    if (!isIoDriver(driver)) {
      throw new Error("[safe-io] Invalid IoDriver implementation");
    }
    /** @type {import("../driver/io-driver.js").IoDriver} */
    this.driver = driver;
    /** @type {Map<string, Object>} rootId → 权限声明 */
    this.rootPermissions = new Map();
  }

  /**
   * 注册根目录
   * @param {string} absPath - 根目录绝对路径
   * @param {string|Object} [presetOrPermissions="READ_ONLY"] - 权限预设名或权限对象
   * @returns {Promise<RootRef>} 根目录引用
   */
  async registerRoot(absPath, presetOrPermissions = "READ_ONLY") {
    if (typeof absPath !== "string" || absPath.trim() === "") {
      throw new Error("[safe-io] Invalid root path");
    }

    let permissions;
    if (typeof presetOrPermissions === "string") {
      permissions = getPreset(presetOrPermissions);
    } else if (isValidPermissions(presetOrPermissions)) {
      // 部分字段补全为 false
      permissions = {};
      for (const key of PERMISSION_KEYS) {
        permissions[key] = presetOrPermissions[key] === true;
      }
    } else {
      throw new Error("[safe-io] Invalid permissions");
    }

    const { rootId } = await this.driver.registerRoot(absPath, permissions);
    if (!rootId) {
      throw new Error("[safe-io] Failed to register root");
    }

    this.rootPermissions.set(rootId, permissions);
    return Object.freeze({ rootId, permissions: Object.freeze({ ...permissions }) });
  }

  /**
   * 注销根目录
   * @param {RootRef} rootRef - 根目录引用
   * @returns {Promise<boolean>} 是否成功
   */
  async unregisterRoot(rootRef) {
    if (!rootRef?.rootId) return false;
    const ok = await this.driver.unregisterRoot(rootRef.rootId);
    if (ok) {
      this.rootPermissions.delete(rootRef.rootId);
    }
    return ok;
  }

  /**
   * 列出已注册根目录 id
   * @returns {Promise<string[]>} 根目录 id 列表
   */
  async listRoots() {
    return this.driver.listRoots();
  }

  /**
   * 打开安全操作句柄
   * @param {RootRef} rootRef - 根目录引用
   * @param {string|Object} entryOrRel - 相对路径字符串或 Dir/File 条目描述符
   * @param {Object} [permissions] - 句柄级权限收窄（与根权限取交集）
   * @returns {Promise<Object|null>} 句柄或 null
   */
  async open(rootRef, entryOrRel, permissions) {
    if (!rootRef?.rootId) return null;

    const rootPerms = this.rootPermissions.get(rootRef.rootId);
    if (!rootPerms) return null;

    let rel = null;
    if (typeof entryOrRel === "string") {
      rel = isValidRelPath(entryOrRel) ? normalizeRel(entryOrRel) : null;
    } else {
      rel = entryToRel(entryOrRel);
    }
    if (rel === null) return null;

    let handlePerms = rootPerms;
    if (permissions) {
      if (!isValidPermissions(permissions)) return null;
      handlePerms = mergePermissions(rootPerms, permissions);
    }

    const bound = bindRoot(this.driver, rootRef.rootId);
    return createHandle({ driver: bound, rel, permissions: handlePerms });
  }
}

/**
 * 创建 SafeIO 实例
 * @param {import("../driver/io-driver.js").IoDriver} driver - IoDriver 实现
 * @returns {SafeIO} SafeIO 实例
 */
export const createSafeIO = (driver) => new SafeIO(driver);
