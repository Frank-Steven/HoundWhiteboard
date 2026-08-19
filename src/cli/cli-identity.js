/**
 * @file CLI 协作身份
 * @description CLI 自治写端的身份解析：本地持久化（~/.hound-whiteboard/cli-identity.json），首启生成后稳定。
 * @module cli/cli-identity
 * @author Zhou Chenyu
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateShortId } from "../utils/short-id.js";

/**
 * CLI 身份文件路径（可用 HWB_CLI_IDENTITY_FILE 覆盖，测试隔离用）
 * @returns {string} 身份文件路径
 */
function cliIdentityFile() {
  return (
    process.env.HWB_CLI_IDENTITY_FILE ??
    path.join(os.homedir(), ".hound-whiteboard", "cli-identity.json")
  );
}

/**
 * 解析文件持久化的协作身份（首启生成并持久化，之后读回）
 * @param {string} file - 身份文件路径
 * @param {string} prefix - 身份前缀（如 "cli" / "daemon"）
 * @param {Object} [extra] - 写入身份文件的附加字段
 * @returns {Promise<string>} 形如 "前缀-xxxx" 的身份
 *
 * @description
 * 读 JSON → 校验前缀命中则读回；缺失/损坏/前缀不符时按首启处理：
 * 生成随机短标识，临时文件 rename 原子写后返回。
 */
async function resolveFileIdentity(file, prefix, extra) {
  try {
    const desc = JSON.parse(await fs.readFile(file, "utf-8"));
    if (typeof desc?.source === "string" && desc.source.startsWith(`${prefix}-`)) {
      return desc.source;
    }
  } catch {
    /* 缺失或损坏时按首启处理 */
  }
  const source = generateShortId(prefix);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, JSON.stringify({ ...extra, source }), "utf-8");
  await fs.rename(tmp, file);
  return source;
}

/**
 * 解析 CLI 自治写端的协作身份（首启生成并持久化，之后读回）
 * @returns {Promise<string>} 形如 "cli-xxxx" 的身份
 *
 * @description
 * 布局 v2 的身份唯一化前提：CLI 自治写（无 daemon 时直写自己分片）需要稳定 source。
 * 与 daemon 身份（daemon-*，注册表按名持久化）和 GUI 身份（dev-*，localStorage）互不相同。
 */
async function resolveCliIdentity() {
  return resolveFileIdentity(cliIdentityFile(), "cli");
}

export { resolveCliIdentity, cliIdentityFile, resolveFileIdentity };
