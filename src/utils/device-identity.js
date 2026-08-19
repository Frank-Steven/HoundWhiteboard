/**
 * @file 设备身份
 * @description 协作身份的 v1 方案：设备随机短标识，本地持久化（GUI 存 localStorage）。
 * @module utils/device-identity
 * @author Zhou Chenyu
 */

import { generateShortId } from "./short-id.js";

/**
 * 设备标识的存储键
 * @type {string}
 */
const STORAGE_KEY = "hwb-device-id";

/**
 * 生成设备随机短标识
 * @returns {string} 形如 "dev-xxxx" 的标识
 */
function generateDeviceId() {
  return generateShortId("dev");
}

/**
 * 解析本机设备标识（首次生成并持久化，之后读回）
 * @param {Object} [storage] - 存储实现（默认 localStorage，测试可注入内存实现）
 * @returns {string} 设备标识
 *
 * @description
 * 记录 source 与对象 id 前缀即该标识；账户体系接入时前缀换为用户名即可，无迁移成本。
 */
function resolveDeviceSource(storage = globalThis.localStorage) {
  const existing = storage?.getItem?.(STORAGE_KEY);
  if (typeof existing === "string" && existing.startsWith("dev-")) {
    return existing;
  }
  const generated = generateDeviceId();
  storage?.setItem?.(STORAGE_KEY, generated);
  return generated;
}

export { resolveDeviceSource, STORAGE_KEY as DEVICE_ID_STORAGE_KEY };
