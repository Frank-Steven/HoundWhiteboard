/**
 * @file CLI 板路径解析
 * @description 板路径的规范化：~ 展开为家目录；其余按路径直通（不隐式改写用户输入）。
 * @module cli/board-path
 * @author Zhou Chenyu
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { t } from "./i18n.js";

/**
 * 解析板路径：展开 ~，其余原样解析
 * @param {string} input - 板路径
 * @returns {string} 绝对路径
 */
function resolveBoardPath(input) {
  const text = String(input ?? "").trim();
  if (text === "") {
    throw new Error(t("err.boardPathMissing"));
  }
  if (text === "~" || text.startsWith("~/") || text.startsWith("~\\")) {
    const rest = text === "~" ? "" : text.slice(2);
    return path.resolve(os.homedir(), rest);
  }
  return path.resolve(text);
}

export { resolveBoardPath };
