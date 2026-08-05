/**
 * @file 路径 DSL 与名称校验
 * @description 提供路径名称校验、Dir/File 条目描述符与相对路径组合纯函数，零依赖可运行于任何 JS 运行时。
 * @module io/core/dsl
 * @author Zhou Chenyu
 */

/**
 * 校验单段路径名称是否合法
 * @param {*} name - 待校验名称
 * @returns {boolean} 是否合法
 *
 * @description
 * 规则：非空字符串、长度 ≤255、非 "."/".."、不以 "." 结尾、不含路径分隔符与保留字符。
 */
export const isValidName = (name) => {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > 255) return false;

  if (name === "." || name === "..") return false;
  if (name.endsWith(".")) return false;

  const INVALID_CHARS = ["/", "\\", ":", "*", "?", "\"", "<", ">", "|", "\0"];

  return !INVALID_CHARS.some((c) => name.includes(c));
};

/**
 * Dir 条目描述符
 * @typedef {Object} DirEntry
 * @property {"Dir"} __type - 类型标识
 * @property {string} name - 目录名称
 */

/**
 * 创建 Dir 条目描述符
 * @param {string} name - 目录名称
 * @returns {DirEntry} Dir 条目
 */
export const Dir = (name) => ({
  __type: "Dir",
  name,
});

/**
 * File 条目描述符
 * @typedef {Object} FileEntry
 * @property {"File"} __type - 类型标识
 * @property {string} name - 文件名（不含扩展名）
 * @property {string} ext - 扩展名
 */

/**
 * 创建 File 条目描述符
 * @param {string} name - 文件名（不含扩展名）
 * @param {string} [ext=""] - 扩展名
 * @returns {FileEntry} File 条目
 */
export const File = (name, ext = "") => ({
  __type: "File",
  name,
  ext,
});

/**
 * 将条目描述符转换为相对路径段
 * @param {DirEntry|FileEntry} entry - 条目描述符
 * @returns {string|null} 相对路径段或 null（描述符非法）
 */
export const entryToRel = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  if (entry.__type === "Dir") {
    return isValidName(entry.name) ? entry.name : null;
  }

  if (entry.__type === "File") {
    if (!isValidName(entry.name)) return null;
    if (entry.ext !== "" && !isValidName(entry.ext)) return null;
    return entry.ext ? `${entry.name}.${entry.ext}` : entry.name;
  }

  return null;
};

/**
 * 校验整条相对路径是否合法
 * @param {*} rel - 相对路径
 * @returns {boolean} 是否合法
 *
 * @description
 * 规则：非空字符串、不使用 "/" 开头、各段以 "/" 分隔且均为合法名称。
 */
export const isValidRelPath = (rel) => {
  if (typeof rel !== "string") return false;
  if (rel.length === 0) return false;
  if (rel.startsWith("/")) return false;
  if (rel.includes("\\")) return false;

  const segments = rel.split("/");
  return segments.every(isValidName);
};

/**
 * 规范化相对路径（去除首尾分隔符与重复分隔符）
 * @param {string} rel - 原始相对路径
 * @returns {string} 规范化后的相对路径
 */
export const normalizeRel = (rel) => {
  if (typeof rel !== "string") return "";
  const parts = rel.split("/").filter((s) => s.length > 0);
  return parts.join("/");
};

/**
 * cd 语义：在相对路径下进入子目录
 * @param {string} rel - 当前相对路径（可为 ""）
 * @param {string} name - 子目录名称
 * @returns {string|null} 新的相对路径或 null（名称非法）
 */
export const cd = (rel, name) => {
  if (typeof rel !== "string") return null;
  if (!isValidName(name)) return null;

  const base = normalizeRel(rel);
  return base ? `${base}/${name}` : name;
};

/**
 * 获取上级相对路径
 * @param {string} rel - 当前相对路径
 * @returns {string|null} 上级相对路径或 null（已在顶层）
 */
export const father = (rel) => {
  if (typeof rel !== "string") return null;

  const base = normalizeRel(rel);
  if (!base) return null;

  const idx = base.lastIndexOf("/");
  return idx === -1 ? "" : base.slice(0, idx);
};

/**
 * 在相对路径下挂载条目描述符
 * @param {string} rel - 相对路径（可为 ""）
 * @param {DirEntry|FileEntry} entry - 条目描述符
 * @returns {string|null} 组合后的相对路径或 null（描述符非法）
 */
export const joinRel = (rel, entry) => {
  if (typeof rel !== "string") return null;

  const seg = entryToRel(entry);
  if (seg === null) return null;

  const base = normalizeRel(rel);
  return base ? `${base}/${seg}` : seg;
};
