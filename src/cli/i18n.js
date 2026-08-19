/**
 * @file CLI 国际化
 * @description 语言检测与消息查询：跟随系统 LANG（zh 前缀中文，其余英文），HWB_LANG 可显式覆盖；t() 做 {placeholder} 插值，缺 key 回退中文。
 * @module cli/i18n
 * @author Zhou Chenyu
 */

import zhCN from "./locales/zh-CN.js";
import enUS from "./locales/en-US.js";

/**
 * 语言字典表
 * @type {Object<string, Object>}
 */
const LOCALES = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

/**
 * 当前语言（模块级，进程启动时经 initI18n 设置）
 * @type {string}
 */
let currentLocale = "zh-CN";

/**
 * 从环境变量检测语言
 * @param {Object} [env] - 环境变量表（默认 process.env）
 * @returns {string} 语言标识（"zh-CN" 或 "en-US"）
 *
 * @description
 * 优先级：HWB_LANG > LC_ALL > LC_MESSAGES > LANG。识别 "zh_CN.UTF-8"、"en_US" 等形态，
 * zh 前缀判中文，其余（含未设置）一律英文。
 */
function detectLocale(env = process.env) {
  const raw = env.HWB_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
  const norm = String(raw).toLowerCase().replace(/_/g, "-").split(".")[0];
  return norm.startsWith("zh") ? "zh-CN" : "en-US";
}

/**
 * 按环境变量初始化当前语言
 * @param {Object} [env] - 环境变量表（默认 process.env）
 * @returns {void}
 */
function initI18n(env) {
  currentLocale = detectLocale(env);
}

/**
 * 按点分路径解析字典值
 * @param {Object} dict - 字典
 * @param {string} key - 点分 key
 * @returns {*} 解析到的值（未命中为 undefined）
 */
function resolveKey(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

/**
 * 查询消息文本（当前语言，缺 key 回退中文，再缺回退 key 本身）
 * @param {string} key - 点分 key（如 "err.objectNotFound"）
 * @param {Object} [params] - 插值参数（替换文本中的 {placeholder}）
 * @returns {string} 消息文本
 */
function t(key, params) {
  let text = resolveKey(LOCALES[currentLocale], key);
  if (typeof text !== "string") text = resolveKey(zhCN, key);
  if (typeof text !== "string") return key;
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] !== undefined ? String(params[name]) : match,
    );
  }
  return text;
}

/**
 * 当前语言是否存在该 key
 * @param {string} key - 点分 key
 * @returns {boolean} 是否存在
 */
function hasKey(key) {
  return typeof resolveKey(LOCALES[currentLocale], key) === "string";
}

/**
 * 当前语言标识
 * @returns {string} 语言标识
 */
function getLocale() {
  return currentLocale;
}

export { detectLocale, initI18n, t, hasKey, getLocale };
