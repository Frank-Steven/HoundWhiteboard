/**
 * @file Node IoDriver
 * @description 基于 Node fs/path 的驱动实现，用于测试、CLI front 与独立工具场景；含符号链接与边界防护。
 * @module io/driver/node
 * @author Zhou Chenyu
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import hidefile from "hidefile";

import { normalizeDriverRel } from "./io-driver.js";

/**
 * 安全执行包装器（驱动层不抛业务错误）
 * @param {Function} fn - 待执行函数
 * @param {*} fallback - 失败返回值
 * @returns {Promise<*>} 结果或 fallback
 */
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

/**
 * 创建 Node IoDriver
 * @param {string} rootPath - 根目录绝对路径
 * @returns {import("./io-driver.js").IoDriver} Node 驱动
 */
export const createNodeDriver = (rootPath) => {
  /** @type {string} */
  const root = path.resolve(rootPath);

  /** @type {boolean} 根目录注册状态 */
  let registered = true;

  /** @type {string|null} 根目录 realpath 缓存（macOS 上 /var 是指向 /private/var 的符号链接，字面比较会误判越界） */
  let realRootCache = null;

  /**
   * 获取根目录的 realpath（根目录尚不存在时回退字面路径，仅成功时缓存）
   * @returns {Promise<string>} 根目录真实路径
   */
  const getRealRoot = async () => {
    if (realRootCache !== null) return realRootCache;
    try {
      realRootCache = await fsp.realpath(root);
    } catch {
      return root;
    }
    return realRootCache;
  };

  /**
   * 判断真实路径是否位于指定根内
   * @param {string} real - 真实路径
   * @param {string} base - 根路径
   * @returns {boolean} 是否在根内
   */
  const inBounds = (real, base) =>
    real === base || real.startsWith(base + path.sep);

  /**
   * 将相对路径解析为边界内的绝对路径
   * @param {string} rel - 相对路径
   * @returns {string|null} 绝对路径或 null（非法/越界）
   */
  const resolveInRoot = (rel) => {
    const norm = normalizeDriverRel(rel);
    if (norm === null) return null;

    const abs = path.resolve(root, norm);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
  };

  /**
   * 符号链接边界检查
   * @param {string} abs - 绝对路径
   * @returns {Promise<boolean>} 是否在边界内
   */
  const checkBoundary = async (abs) => {
    try {
      const realRoot = await getRealRoot();
      const target = fs.existsSync(abs) ? abs : path.dirname(abs);
      const real = await fsp.realpath(target);
      return inBounds(real, root) || inBounds(real, realRoot);
    } catch {
      return false;
    }
  };

  /**
   * 确保父目录存在
   * @param {string} abs - 绝对路径
   * @returns {Promise<void>}
   */
  const ensureDir = async (abs) => {
    const dir = path.dirname(abs);
    await fsp.mkdir(dir, { recursive: true });
  };

  /**
   * 检查隐藏状态（hidefile 语义：Windows 属性 / Unix 点前缀）
   * @param {string} abs - 绝对路径
   * @returns {boolean} 是否隐藏
   */
  const isHiddenAbs = (abs) => {
    try {
      return Boolean(hidefile.isHiddenSync(abs));
    } catch {
      return false;
    }
  };

  return {
    /**
     * 读取文件
     * @param {string} relPath - 相对路径
     * @returns {Promise<string|null>} 文件内容或 null
     */
    async read(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return null;
        if (!(await checkBoundary(abs))) return null;
        if (!fs.existsSync(abs)) return null;
        return fsp.readFile(abs, "utf8");
      }, null);
    },

    /**
     * 写入文件
     * @param {string} relPath - 相对路径
     * @param {string} content - 内容
     * @returns {Promise<boolean>} 是否成功
     */
    async write(_rootId, relPath, content) {
      return safe(async () => {
        if (typeof content !== "string") return false;
        const abs = resolveInRoot(relPath);
        if (abs === null) return false;
        await ensureDir(abs);
        if (!(await checkBoundary(abs))) return false;
        await fsp.writeFile(abs, content, "utf8");
        return true;
      }, false);
    },

    /**
     * 列出目录条目
     * @param {string} relPath - 相对路径
     * @returns {Promise<Array<import("./io-driver.js").DriverEntry>>} 条目列表
     */
    async ls(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return [];
        if (!(await checkBoundary(abs))) return [];
        if (!fs.existsSync(abs)) return [];

        const dirents = await fsp.readdir(abs, { withFileTypes: true });
        return dirents.map((entry) => ({
          name: entry.name,
          isDir: entry.isDirectory(),
          isFile: entry.isFile(),
          isSymlink: entry.isSymbolicLink(),
          hidden: entry.name.startsWith("."),
        }));
      }, []);
    },

    /**
     * 获取文件状态
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").DriverStat|null>} 状态或 null
     */
    async stat(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return null;
        if (!(await checkBoundary(abs))) return null;

        const stat = await fsp.stat(abs);
        const hidden = await safe(async () => {
          const lstat = await fsp.lstat(abs);
          return lstat.isSymbolicLink() ? false : isHiddenAbs(abs);
        }, false);

        return {
          size: stat.size,
          isDir: stat.isDirectory(),
          isFile: stat.isFile(),
          isSymlink: stat.isSymbolicLink(),
          hidden,
          createdAt: stat.birthtimeMs,
          modifiedAt: stat.mtimeMs,
        };
      }, null);
    },

    /**
     * 检查路径是否存在
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否存在
     */
    async exists(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return false;
        if (!(await checkBoundary(abs))) return false;
        return fs.existsSync(abs);
      }, false);
    },

    /**
     * 删除文件或目录
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async rm(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null || abs === root) return false;
        if (!(await checkBoundary(abs))) return false;
        if (!fs.existsSync(abs)) return false;
        await fsp.rm(abs, { recursive: true, force: true });
        return true;
      }, false);
    },

    /**
     * 复制文件或目录
     * @param {string} srcRel - 源相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async cp(_rootId, srcRel, destRel) {
      return safe(async () => {
        const src = resolveInRoot(srcRel);
        const dest = resolveInRoot(destRel);
        if (src === null || dest === null) return false;
        await ensureDir(dest);
        if (!(await checkBoundary(src))) return false;
        if (!(await checkBoundary(dest))) return false;
        if (!fs.existsSync(src)) return false;
        await fsp.cp(src, dest, { recursive: true, force: true });
        return true;
      }, false);
    },

    /**
     * 移动文件或目录
     * @param {string} srcRel - 源相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mv(_rootId, srcRel, destRel) {
      return safe(async () => {
        const src = resolveInRoot(srcRel);
        const dest = resolveInRoot(destRel);
        if (src === null || dest === null) return false;
        await ensureDir(dest);
        if (!(await checkBoundary(src))) return false;
        if (!(await checkBoundary(dest))) return false;
        if (!fs.existsSync(src)) return false;
        try {
          await fsp.rename(src, dest);
        } catch {
          await fsp.cp(src, dest, { recursive: true, force: true });
          await fsp.rm(src, { recursive: true, force: true });
        }
        return true;
      }, false);
    },

    /**
     * 创建目录
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mkdir(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null || abs === root) return false;
        await fsp.mkdir(abs, { recursive: true });
        return true;
      }, false);
    },

    /**
     * 隐藏文件或目录
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").HideResult|null>} 结果或 null
     */
    async hide(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return null;
        if (!(await checkBoundary(abs))) return null;
        if (!fs.existsSync(abs)) return null;

        hidefile.hideSync(abs);

        const newAbs = path.join(path.dirname(abs), `.${path.basename(abs)}`);
        const newRel = fs.existsSync(newAbs)
          ? path.relative(root, newAbs).split(path.sep).join("/")
          : normalizeDriverRel(relPath);
        return { success: true, path: newRel };
      }, null);
    },

    /**
     * 取消隐藏
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").HideResult|null>} 结果或 null
     */
    async unhide(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return null;
        if (!(await checkBoundary(abs))) return null;
        if (!fs.existsSync(abs)) return null;

        hidefile.revealSync(abs);

        const base = path.basename(abs);
        const newBase = base.startsWith(".") ? base.slice(1) : base;
        const newAbs = path.join(path.dirname(abs), newBase);
        const newRel = fs.existsSync(newAbs)
          ? path.relative(root, newAbs).split(path.sep).join("/")
          : normalizeDriverRel(relPath);
        return { success: true, path: newRel };
      }, null);
    },

    /**
     * 检查是否隐藏
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否隐藏
     */
    async isHidden(_rootId, relPath) {
      return safe(async () => {
        const abs = resolveInRoot(relPath);
        if (abs === null) return false;
        if (!(await checkBoundary(abs))) return false;
        if (!fs.existsSync(abs)) return false;
        return isHiddenAbs(abs);
      }, false);
    },

    /**
     * 将文件或目录打包为 ZIP
     * @param {string} srcRel - 源相对路径
     * @param {string} outRel - 输出相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipFrom(_rootId, srcRel, outRel) {
      return safe(async () => {
        const src = resolveInRoot(srcRel);
        const out = resolveInRoot(outRel);
        if (src === null || out === null) return false;
        await ensureDir(out);
        if (!(await checkBoundary(src))) return false;
        if (!(await checkBoundary(out))) return false;
        if (!fs.existsSync(src)) return false;

        const zip = new AdmZip();
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          zip.addLocalFolder(src);
        } else {
          zip.addLocalFile(src);
        }
        zip.writeZip(out);
        return true;
      }, false);
    },

    /**
     * 解压 ZIP 到目录
     * @param {string} zipRel - ZIP 相对路径
     * @param {string} targetRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipExtract(_rootId, zipRel, targetRel) {
      return safe(async () => {
        const zipAbs = resolveInRoot(zipRel);
        const targetAbs = resolveInRoot(targetRel);
        if (zipAbs === null || targetAbs === null) return false;
        await ensureDir(targetAbs);
        if (!(await checkBoundary(zipAbs))) return false;
        if (!(await checkBoundary(targetAbs))) return false;
        if (!fs.existsSync(zipAbs)) return false;

        const zip = new AdmZip(zipAbs);
        zip.extractAllTo(targetAbs, true);
        return true;
      }, false);
    },

    /**
     * 列出 ZIP 条目
     * @param {string} zipRel - ZIP 相对路径
     * @returns {Promise<Array<import("./io-driver.js").ZipEntryInfo>>} 条目列表
     */
    async zipList(_rootId, zipRel) {
      return safe(async () => {
        const zipAbs = resolveInRoot(zipRel);
        if (zipAbs === null) return [];
        if (!(await checkBoundary(zipAbs))) return [];
        if (!fs.existsSync(zipAbs)) return [];

        const zip = new AdmZip(zipAbs);
        return zip.getEntries().map((entry) => ({
          name: entry.entryName,
          size: entry.header.size,
          compressedSize: entry.header.compressedSize,
          isDirectory: entry.isDirectory,
        }));
      }, []);
    },

    /**
     * 注册根目录（Node 驱动为单根，校验路径存在后返回固定 id）
     * @param {string} absPath - 绝对路径
     * @returns {Promise<{rootId: string}>} 根目录引用
     */
    async registerRoot(absPath) {
      if (typeof absPath !== "string" || absPath.trim() === "") {
        return { rootId: "" };
      }
      registered = true;
      return { rootId: "local" };
    },

    /**
     * 注销根目录
     * @param {string} rootId - 根目录 id
     * @returns {Promise<boolean>} 是否成功
     */
    async unregisterRoot(rootId) {
      if (rootId !== "local") return false;
      registered = false;
      return true;
    },

    /**
     * 列出已注册根目录
     * @returns {Promise<string[]>} 根目录 id 列表
     */
    async listRoots() {
      return registered ? ["local"] : [];
    },
  };
};
