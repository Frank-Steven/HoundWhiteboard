/**
 * @file Tauri IoDriver
 * @description 通过 Tauri invoke 转发到 Rust commands 的驱动实现；transport 可注入以支持 worker 转发场景。
 * @module io/driver/tauri
 * @author Zhou Chenyu
 */

import { normalizeDriverRel } from "./io-driver.js";

/**
 * 获取默认 Tauri invoke 函数
 * @returns {Function} invoke 函数
 * @throws {Error} 当前环境没有 Tauri invoke
 */
const getDefaultInvoke = () => {
  if (typeof window !== "undefined") {
    const core = window.__TAURI__?.core;
    if (typeof core?.invoke === "function") return core.invoke.bind(core);
    const internals = window.__TAURI_INTERNALS__;
    if (typeof internals?.invoke === "function") return internals.invoke.bind(internals);
  }
  throw new Error(
    "[safe-io] Tauri invoke unavailable. Inject transport for worker/headless contexts."
  );
};

/**
 * 创建 Tauri IoDriver
 * @param {Object} [options] - 选项
 * @param {Function} [options.invoke] - 自定义 transport（worker 模式注入主线程转发函数）
 * @returns {import("./io-driver.js").IoDriver} Tauri 驱动
 */
export const createTauriDriver = (options = {}) => {
  /** @type {Function} */
  const invoke = options.invoke || getDefaultInvoke();

  /**
   * 调用 Rust command（错误转为安全值，驱动层不抛业务错误）
   * @param {string} command - command 名称
   * @param {Object} args - 参数
   * @param {*} [fallback=null] - 失败时的安全值
   * @returns {Promise<*>} 结果或 fallback（Rust 拒绝时）
   */
  const call = async (command, args, fallback = null) => {
    try {
      return await invoke(command, args);
    } catch {
      return fallback;
    }
  };

  return {
    /**
     * 读取文件
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<string|null>} 文件内容或 null
     */
    async read(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return null;
      return call("safe_io_fs_read", { rootId, relPath: rel, encoding: "utf8" });
    },

    /**
     * 写入文件
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @param {string} content - 内容
     * @returns {Promise<boolean>} 是否成功
     */
    async write(rootId, relPath, content) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null || typeof content !== "string") return false;
      return call("safe_io_fs_write", { rootId, relPath: rel, content, encoding: "utf8" }, false);
    },

    /**
     * 列出目录条目
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<Array<import("./io-driver.js").DriverEntry>>} 条目列表
     */
    async ls(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return [];
      return call("safe_io_fs_ls", { rootId, relPath: rel }, []);
    },

    /**
     * 获取文件状态
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").DriverStat|null>} 状态或 null
     */
    async stat(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return null;
      return call("safe_io_fs_stat", { rootId, relPath: rel });
    },

    /**
     * 检查路径是否存在
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否存在
     */
    async exists(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      return call("safe_io_fs_exists", { rootId, relPath: rel }, false);
    },

    /**
     * 删除文件或目录
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async rm(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      return call("safe_io_fs_rm", { rootId, relPath: rel }, false);
    },

    /**
     * 复制文件或目录
     * @param {string} rootId - 根目录 id
     * @param {string} srcRel - 源相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async cp(rootId, srcRel, destRel) {
      const src = normalizeDriverRel(srcRel);
      const dest = normalizeDriverRel(destRel);
      if (src === null || dest === null) return false;
      return call("safe_io_fs_cp", { rootId, srcRel: src, destRel: dest }, false);
    },

    /**
     * 移动文件或目录
     * @param {string} rootId - 根目录 id
     * @param {string} srcRel - 源相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mv(rootId, srcRel, destRel) {
      const src = normalizeDriverRel(srcRel);
      const dest = normalizeDriverRel(destRel);
      if (src === null || dest === null) return false;
      return call("safe_io_fs_mv", { rootId, srcRel: src, destRel: dest }, false);
    },

    /**
     * 创建目录
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mkdir(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      return call("safe_io_fs_mkdir", { rootId, relPath: rel }, false);
    },

    /**
     * 隐藏文件或目录
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").HideResult|null>} 结果或 null
     */
    async hide(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return null;
      return call("safe_io_fs_hide", { rootId, relPath: rel });
    },

    /**
     * 取消隐藏
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").HideResult|null>} 结果或 null
     */
    async unhide(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return null;
      return call("safe_io_fs_unhide", { rootId, relPath: rel });
    },

    /**
     * 检查是否隐藏
     * @param {string} rootId - 根目录 id
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否隐藏
     */
    async isHidden(rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      return call("safe_io_fs_is_hidden", { rootId, relPath: rel }, false);
    },

    /**
     * 将文件或目录打包为 ZIP
     * @param {string} rootId - 根目录 id
     * @param {string} srcRel - 源相对路径
     * @param {string} outRel - 输出相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipFrom(rootId, srcRel, outRel) {
      const src = normalizeDriverRel(srcRel);
      const out = normalizeDriverRel(outRel);
      if (src === null || out === null) return false;
      return call("safe_io_zip_from", { rootId, srcRel: src, outRel: out }, false);
    },

    /**
     * 解压 ZIP 到目录
     * @param {string} rootId - 根目录 id
     * @param {string} zipRel - ZIP 相对路径
     * @param {string} targetRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipExtract(rootId, zipRel, targetRel) {
      const zip = normalizeDriverRel(zipRel);
      const target = normalizeDriverRel(targetRel);
      if (zip === null || target === null) return false;
      return call("safe_io_zip_extract", { rootId, zipRel: zip, targetRel: target }, false);
    },

    /**
     * 列出 ZIP 条目
     * @param {string} rootId - 根目录 id
     * @param {string} zipRel - ZIP 相对路径
     * @returns {Promise<Array<import("./io-driver.js").ZipEntryInfo>>} 条目列表
     */
    async zipList(rootId, zipRel) {
      const zip = normalizeDriverRel(zipRel);
      if (zip === null) return [];
      return call("safe_io_zip_list", { rootId, zipRel: zip }, []);
    },

    /**
     * 注册根目录（转发 Rust 权威注册，携带权限声明）
     * @param {string} absPath - 绝对路径
     * @param {Object} [permissions] - 权限声明（Rust 侧权威持有）
     * @returns {Promise<{rootId: string}>} 根目录引用
     */
    async registerRoot(absPath, permissions) {
      return call("safe_io_register_root", { absPath, permissions });
    },

    /**
     * 注销根目录
     * @param {string} rootId - 根目录 id
     * @returns {Promise<boolean>} 是否成功
     */
    async unregisterRoot(rootId) {
      return call("safe_io_unregister_root", { rootId });
    },

    /**
     * 列出已注册根目录
     * @returns {Promise<string[]>} 根目录 id 列表
     */
    async listRoots() {
      return call("safe_io_list_roots", {});
    },
  };
};
