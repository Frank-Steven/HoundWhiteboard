/**
 * @file 内存 IoDriver
 * @description 基于 Map 的纯内存驱动实现，用于测试、headless 与预览场景；ZIP 以特殊快照条目模拟。
 * @module io/driver/memory
 * @author Zhou Chenyu
 */

import { normalizeDriverRel } from "./io-driver.js";

/**
 * 内存条目
 * @typedef {Object} MemoryEntry
 * @property {"file"|"dir"|"zip"} type - 条目类型
 * @property {string} [content] - 文件内容
 * @property {Array<{name: string, content: string}>} [zipFiles] - ZIP 快照文件列表
 */

/**
 * 创建内存 IoDriver
 * @param {Object} [options] - 选项
 * @param {string} [options.rootId="memory"] - 根目录 id
 * @returns {import("./io-driver.js").IoDriver} 内存驱动
 */
export const createMemoryDriver = (options = {}) => {
  /** @type {string} */
  const rootId = options.rootId || "memory";

  /** @type {Map<string, MemoryEntry>} */
  const entries = new Map();

  /** @type {Set<string>} 目录集合（含隐式父目录） */
  const dirs = new Set();

  /** @type {Set<string>} 已注册根目录 id 集合（单根驱动） */
  const roots = new Set([rootId]);

  /**
   * 确保路径的所有父目录存在
   * @param {string} rel - 相对路径
   * @returns {void}
   */
  const ensureParents = (rel) => {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  };

  /**
   * 收集某路径下的所有子键（含自身）
   * @param {string} rel - 相对路径
   * @returns {string[]} 键列表
   */
  const collectSubKeys = (rel) => {
    const prefix = rel ? `${rel}/` : "";
    const keys = [];
    for (const key of entries.keys()) {
      if (key === rel || key.startsWith(prefix)) keys.push(key);
    }
    for (const dir of dirs) {
      if (dir === rel || dir.startsWith(prefix)) keys.push(dir);
    }
    return keys;
  };

  /**
   * 删除路径（含子树）
   * @param {string} rel - 相对路径
   * @returns {boolean} 是否删除
   */
  const removePath = (rel) => {
    const keys = collectSubKeys(rel);
    if (keys.length === 0) return false;
    for (const key of keys) {
      entries.delete(key);
      dirs.delete(key);
    }
    return true;
  };

  /**
   * 检查路径是否隐藏
   * @param {string} rel - 相对路径
   * @returns {boolean} 是否隐藏
   */
  const isHiddenRel = (rel) => {
    const base = rel.split("/").pop() || "";
    return base.startsWith(".");
  };

  /**
   * 切换隐藏状态（Unix 语义：重命名加 "." 前缀）
   * @param {string} rel - 相对路径
   * @param {boolean} hide - 是否隐藏
   * @returns {import("./io-driver.js").HideResult|null} 结果或 null
   */
  const toggleHide = (rel, hide) => {
    const norm = normalizeDriverRel(rel);
    if (norm === null || !dirs.has(norm) && !entries.has(norm)) return null;

    const idx = norm.lastIndexOf("/");
    const parent = idx === -1 ? "" : norm.slice(0, idx);
    const base = norm.slice(idx + 1);
    const hidden = base.startsWith(".");

    if (hide === hidden) {
      return { success: true, path: norm };
    }

    const newBase = hide ? `.${base}` : base.replace(/^\./, "");
    const newRel = parent ? `${parent}/${newBase}` : newBase;

    if (entries.has(norm)) {
      entries.set(newRel, entries.get(norm));
      entries.delete(norm);
    }
    if (dirs.has(norm)) {
      dirs.delete(norm);
      dirs.add(newRel);
      for (const key of collectSubKeys(norm)) {
        if (key === norm) continue;
        const subNew = `${newRel}${key.slice(norm.length)}`;
        if (entries.has(key)) {
          entries.set(subNew, entries.get(key));
          entries.delete(key);
        }
        if (dirs.has(key)) {
          dirs.add(subNew);
          dirs.delete(key);
        }
      }
    }

    return { success: true, path: newRel };
  };

  /**
   * 创建 ZIP 快照条目
   * @param {string} srcRel - 源相对路径
   * @param {string} outRel - 输出相对路径
   * @returns {boolean} 是否成功
   */
  const zipSnapshot = (srcRel, outRel) => {
    const files = [];
    const prefix = srcRel ? `${srcRel}/` : "";

    for (const [key, entry] of entries.entries()) {
      if (key === srcRel || key.startsWith(prefix)) {
        const name = key === srcRel ? key.split("/").pop() : key.slice(prefix.length);
        if (entry.type === "file") {
          files.push({ name, content: entry.content || "" });
        }
      }
    }
    for (const dir of dirs) {
      if (dir === srcRel || dir.startsWith(prefix)) {
        const name = dir === srcRel ? dir.split("/").pop() : dir.slice(prefix.length);
        files.push({ name: `${name}/`, content: "" });
      }
    }

    entries.set(outRel, { type: "zip", zipFiles: files });
    ensureParents(outRel);
    return true;
  };

  /**
   * 展开 ZIP 快照条目
   * @param {string} zipRel - ZIP 相对路径
   * @param {string} targetRel - 目标相对路径
   * @returns {boolean} 是否成功
   */
  const zipExpand = (zipRel, targetRel) => {
    const entry = entries.get(zipRel);
    if (!entry || entry.type !== "zip") return false;

    removePath(targetRel);
    dirs.add(targetRel);

    for (const file of entry.zipFiles || []) {
      const name = file.name;
      if (name.endsWith("/")) {
        const dirRel = targetRel ? `${targetRel}/${name.slice(0, -1)}` : name.slice(0, -1);
        dirs.add(dirRel);
      } else {
        const fileRel = targetRel ? `${targetRel}/${name}` : name;
        entries.set(fileRel, { type: "file", content: file.content || "" });
        ensureParents(fileRel);
      }
    }
    return true;
  };

  return {
    /**
     * 读取文件
     * @param {string} relPath - 相对路径
     * @returns {Promise<string|null>} 文件内容或 null
     */
    async read(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return null;
      const entry = entries.get(rel);
      return entry?.type === "file" ? entry.content : null;
    },

    /**
     * 写入文件
     * @param {string} relPath - 相对路径
     * @param {string} content - 内容
     * @returns {Promise<boolean>} 是否成功
     */
    async write(_rootId, relPath, content) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null || typeof content !== "string") return false;
      entries.set(rel, { type: "file", content });
      ensureParents(rel);
      return true;
    },

    /**
     * 列出目录条目
     * @param {string} relPath - 相对路径
     * @returns {Promise<Array<import("./io-driver.js").DriverEntry>>} 条目列表
     */
    async ls(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return [];
      if (rel !== "" && !dirs.has(rel)) return [];

      const prefix = rel ? `${rel}/` : "";
      const names = new Set();

      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name) names.add(name);
        }
      }
      for (const dir of dirs) {
        if (dir.startsWith(prefix)) {
          const rest = dir.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name) names.add(name);
        }
      }

      return [...names].map((name) => ({
        name,
        isDir: dirs.has(rel ? `${rel}/${name}` : name),
        isFile: entries.has(rel ? `${rel}/${name}` : name),
        isSymlink: false,
        hidden: name.startsWith("."),
      }));
    },

    /**
     * 获取文件状态
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").DriverStat|null>} 状态或 null
     */
    async stat(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return null;

      if (entries.has(rel)) {
        const entry = entries.get(rel);
        return {
          size: entry.type === "file" ? (entry.content || "").length : 0,
          isDir: false,
          isFile: true,
          isSymlink: false,
          hidden: isHiddenRel(rel),
        };
      }
      if (dirs.has(rel)) {
        return {
          size: 0,
          isDir: true,
          isFile: false,
          isSymlink: false,
          hidden: isHiddenRel(rel),
        };
      }
      return null;
    },

    /**
     * 检查路径是否存在
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否存在
     */
    async exists(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      return entries.has(rel) || dirs.has(rel);
    },

    /**
     * 删除文件或目录
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async rm(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      if (rel === "") return false;
      return removePath(rel);
    },

    /**
     * 复制文件或目录
     * @param {string} srcRel - 源相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async cp(_rootId, srcRel, destRel) {
      const src = normalizeDriverRel(srcRel);
      const dest = normalizeDriverRel(destRel);
      if (src === null || dest === null || src === "") return false;

      if (entries.has(src)) {
        const entry = entries.get(src);
        entries.set(dest, { type: entry.type, content: entry.content, zipFiles: entry.zipFiles });
        ensureParents(dest);
        return true;
      }
      if (dirs.has(src)) {
        for (const key of collectSubKeys(src)) {
          if (key === src) continue;
          const subDest = `${dest}${key.slice(src.length)}`;
          if (entries.has(key)) {
            const entry = entries.get(key);
            entries.set(subDest, { type: entry.type, content: entry.content, zipFiles: entry.zipFiles });
          }
          if (dirs.has(key)) {
            dirs.add(subDest);
          }
        }
        dirs.add(dest);
        return true;
      }
      return false;
    },

    /**
     * 移动文件或目录
     * @param {string} srcRel - 源相对路径
     * @param {string} destRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mv(_rootId, srcRel, destRel) {
      const ok = await this.cp(_rootId, srcRel, destRel);
      if (!ok) return false;
      await this.rm(_rootId, srcRel);
      return true;
    },

    /**
     * 创建目录
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async mkdir(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null || rel === "") return false;
      dirs.add(rel);
      ensureParents(rel);
      return true;
    },

    /**
     * 隐藏文件或目录
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").HideResult|null>} 结果或 null
     */
    async hide(_rootId, relPath) {
      return toggleHide(relPath, true);
    },

    /**
     * 取消隐藏
     * @param {string} relPath - 相对路径
     * @returns {Promise<import("./io-driver.js").HideResult|null>} 结果或 null
     */
    async unhide(_rootId, relPath) {
      return toggleHide(relPath, false);
    },

    /**
     * 检查是否隐藏
     * @param {string} relPath - 相对路径
     * @returns {Promise<boolean>} 是否隐藏
     */
    async isHidden(_rootId, relPath) {
      const rel = normalizeDriverRel(relPath);
      if (rel === null) return false;
      return isHiddenRel(rel);
    },

    /**
     * 将文件或目录打包为 ZIP 快照
     * @param {string} srcRel - 源相对路径
     * @param {string} outRel - 输出相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipFrom(_rootId, srcRel, outRel) {
      const src = normalizeDriverRel(srcRel);
      const out = normalizeDriverRel(outRel);
      if (src === null || out === null || src === "") return false;
      if (!entries.has(src) && !dirs.has(src)) return false;
      return zipSnapshot(src, out);
    },

    /**
     * 解压 ZIP 快照
     * @param {string} zipRel - ZIP 相对路径
     * @param {string} targetRel - 目标相对路径
     * @returns {Promise<boolean>} 是否成功
     */
    async zipExtract(_rootId, zipRel, targetRel) {
      const zip = normalizeDriverRel(zipRel);
      const target = normalizeDriverRel(targetRel);
      if (zip === null || target === null) return false;
      return zipExpand(zip, target);
    },

    /**
     * 列出 ZIP 条目
     * @param {string} zipRel - ZIP 相对路径
     * @returns {Promise<Array<import("./io-driver.js").ZipEntryInfo>>} 条目列表
     */
    async zipList(_rootId, zipRel) {
      const zip = normalizeDriverRel(zipRel);
      if (zip === null) return [];
      const entry = entries.get(zip);
      if (!entry || entry.type !== "zip") return [];

      return (entry.zipFiles || []).map((file) => ({
        name: file.name,
        size: file.content ? file.content.length : 0,
        compressedSize: file.content ? file.content.length : 0,
        isDirectory: file.name.endsWith("/"),
      }));
    },

    /**
     * 注册根目录（内存驱动为单根，直接返回固定 id）
     * @param {string} _absPath - 绝对路径（忽略）
     * @returns {Promise<{rootId: string}>} 根目录引用
     */
    async registerRoot(_absPath) {
      roots.add(rootId);
      return { rootId };
    },

    /**
     * 注销根目录
     * @param {string} id - 根目录 id
     * @returns {Promise<boolean>} 是否存在并被移除
     */
    async unregisterRoot(id) {
      return roots.delete(id);
    },

    /**
     * 列出已注册根目录
     * @returns {Promise<string[]>} 根目录 id 列表
     */
    async listRoots() {
      return [...roots];
    },

    /**
     * 测试辅助：清空所有条目
     * @returns {void}
     */
    _clear() {
      entries.clear();
      dirs.clear();
    },
  };
};
