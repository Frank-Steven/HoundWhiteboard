/**
 * @file 随机短标识
 * @description 生成 "前缀-xxxx" 形态的随机短标识（协作身份、设备标识共用）。
 * @module utils/short-id
 * @author Zhou Chenyu
 */

/**
 * 生成随机短标识
 * @param {string} prefix - 标识前缀（如 "dev" / "cli" / "daemon"）
 * @returns {string} 形如 "前缀-xxxx" 的标识（x 为 4 位 36 进制字符）
 */
export function generateShortId(prefix) {
  const random = Math.floor(Math.random() * 36 ** 4);
  return `${prefix}-${random.toString(36).padStart(4, "0")}`;
}
