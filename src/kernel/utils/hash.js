/**
 * @file 字符串哈希工具
 * @description 提供确定性的字符串哈希（FNV-1a），用于状态校验和等无安全要求的场景。
 * @module kernel/utils/hash
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

/**
 * 计算字符串的 FNV-1a 哈希（32 位）
 * @description 同一输入恒得同一输出（跨进程、跨端一致），用于状态摘要比对；
 * 非加密级哈希，不适用于安全场景。
 * @param {string} input - 输入字符串
 * @returns {string} 8 位十六进制哈希串
 */
function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export { hashString };
