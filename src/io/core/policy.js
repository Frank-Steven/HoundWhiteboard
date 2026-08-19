/**
 * @file 权限策略与预设
 * @description 提供权限预设、操作到权限的映射与合并规则，纯数据零依赖。
 * @module io/core/policy
 * @author Zhou Chenyu
 */

/**
 * 权限字段列表（对象形式权限的键）
 * @type {string[]}
 */
export const PERMISSION_KEYS = [
  "read",
  "write",
  "rm",
  "ls",
  "mkdir",
  "hide",
  "zip",
];

/**
 * 对象形式权限预设
 * @type {Object.<string, Object>}
 */
export const PERMISSION_PRESETS = {
  READ_ONLY: {
    read: true,
    write: false,
    rm: false,
    ls: true,
    mkdir: false,
    hide: false,
    zip: false,
  },
  READ_WRITE: {
    read: true,
    write: true,
    rm: false,
    ls: true,
    mkdir: true,
    hide: false,
    zip: true,
  },
  FULL: {
    read: true,
    write: true,
    rm: true,
    ls: true,
    mkdir: true,
    hide: true,
    zip: true,
  },
};

/**
 * 获取权限预设
 * @param {string} [preset="READ_ONLY"] - 预设名称
 * @returns {Object} 权限对象
 */
export const getPreset = (preset = "READ_ONLY") => {
  return { ...(PERMISSION_PRESETS[preset] || PERMISSION_PRESETS.READ_ONLY) };
};

/**
 * 合并权限（取交集，只减不增）
 * @param {Object} base - 基础权限
 * @param {Object} override - 覆盖权限
 * @returns {Object} 合并后的权限
 */
export const mergePermissions = (base, override) => {
  const result = {};
  for (const key of PERMISSION_KEYS) {
    result[key] = Boolean(base?.[key]) && override?.[key] !== false;
  }
  return result;
};

/**
 * 校验权限对象结构（允许部分字段，缺失字段视为 false）
 * @param {*} permissions - 待校验对象
 * @returns {boolean} 是否合法
 */
export const isValidPermissions = (permissions) => {
  if (!permissions || typeof permissions !== "object") return false;
  const keys = Object.keys(permissions);
  if (keys.length === 0) return false;
  return keys.every(
    (key) => PERMISSION_KEYS.includes(key) && typeof permissions[key] === "boolean"
  );
};

/**
 * 操作所需权限字段映射（对象形式）
 * @type {Object.<string, string>}
 */
export const OP_PERMISSION_KEYS = {
  read: "read",
  write: "write",
  ls: "read",
  stat: "read",
  exists: "read",
  rm: "rm",
  cp: "write",
  mv: "write",
  mkdir: "mkdir",
  hide: "hide",
  unhide: "hide",
  isHidden: "read",
  zipFrom: "zip",
  zipExtract: "zip",
  zipList: "zip",
};

/**
 * 检查对象形式权限是否允许指定操作
 * @param {Object} permissions - 权限对象
 * @param {string} op - 操作名（OP 枚举之一）
 * @returns {boolean} 是否允许
 */
export const checkPermissions = (permissions, op) => {
  if (!permissions || typeof permissions !== "object") return false;
  const required = OP_PERMISSION_KEYS[op];
  if (!required) return false;
  return permissions[required] === true;
};
