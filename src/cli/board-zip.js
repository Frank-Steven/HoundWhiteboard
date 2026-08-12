/**
 * @file 板 zip 打包（.hwb 格式）
 * @description 板目录与 .hwb 文件互转：导出平铺 zip（board.json 在根），导入校验格式与版本。
 * @module cli/board-zip
 * @author Zhou Chenyu
 */

import AdmZip from "adm-zip";
import fs from "node:fs/promises";
import path from "node:path";

/** .hwb 内板元数据文件名（与板目录布局一致） */
const BOARD_META_FILE = "board.json";
/** 导出的运行时持有标记（不属于板内容，不打包） */
const DAEMON_FILE = ".daemon.json";
/** 板格式版本（与 kernel/store 的 FORMAT_VERSION 对齐；导入时校验） */
const FORMAT_VERSION = 1;

/**
 * 递归收集目录内相对路径清单（排除导出时不应包含的文件）
 * @param {string} root - 板目录
 * @param {string} [rel=""] - 当前相对路径前缀
 * @returns {Promise<string[]>} 相对路径数组（正斜杠分隔）
 * @private
 */
async function collectBoardFiles(root, rel = "") {
  const out = [];
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === DAEMON_FILE) continue;
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await collectBoardFiles(root, entryRel)));
    } else if (entry.isFile()) {
      out.push(entryRel);
    }
  }
  return out;
}

/**
 * 导出板目录为 .hwb 文件（zip 平铺，board.json 在 zip 根）
 * @param {string} boardRoot - 板目录
 * @param {string} outFile - 输出 .hwb 文件路径
 * @returns {Promise<void>}
 *
 * @description
 * 板内容 = board.json + objects/trash/hit/chunks + .cli-choices.json（choice 种子）；
 * `.daemon.json` 是运行时持有标记，不导出。导入侧以 board.json 存在为合法板标志。
 */
async function exportBoard(boardRoot, outFile) {
  // 板标志文件先行校验，报友好错误（collectBoardFiles 的 readdir 抛原生 ENOENT）
  try {
    await fs.access(path.join(boardRoot, BOARD_META_FILE));
  } catch {
    throw new Error(`板目录不存在或不是板：${boardRoot}`);
  }
  const files = await collectBoardFiles(boardRoot);
  if (!files.includes(BOARD_META_FILE)) {
    throw new Error(`板目录不存在或不是板：${boardRoot}`);
  }
  const zip = new AdmZip();
  for (const rel of files) {
    const abs = path.join(boardRoot, rel);
    zip.addLocalFile(abs, path.dirname(rel) === "." ? "" : path.dirname(rel), path.basename(rel));
  }
  await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  zip.writeZip(outFile);
}

/**
 * 导入 .hwb 文件为板目录
 * @param {string} zipFile - .hwb 文件路径
 * @param {string} targetRoot - 目标板目录（不存在则创建；已存在非空板时拒绝）
 * @returns {Promise<void>}
 *
 * @description
 * 校验 zip 内存在 board.json 且 formatVersion 兼容；解压平铺到目标目录。
 * 解压后即是一块可被 daemon start 持有的新板。
 */
async function importBoard(zipFile, targetRoot) {
  let zip;
  try {
    zip = new AdmZip(zipFile);
  } catch {
    throw new Error(`无法打开 .hwb 文件：${zipFile}（不是合法 zip）`);
  }
  const entries = zip.getEntries();
  if (!entries.some((entry) => entry.entryName === BOARD_META_FILE)) {
    throw new Error(`不是合法板包：${zipFile}（zip 内缺少 ${BOARD_META_FILE}）`);
  }
  const metaText = zip.readAsText(BOARD_META_FILE);
  let meta = null;
  try {
    meta = JSON.parse(metaText);
  } catch {
    throw new Error(`板包元数据损坏：${zipFile}（${BOARD_META_FILE} 不是合法 JSON）`);
  }
  if (meta.formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `板包格式版本不兼容：${zipFile}（包内 ${meta.formatVersion}，当前支持 ${FORMAT_VERSION}）`,
    );
  }
  const target = path.resolve(targetRoot);
  await fs.mkdir(target, { recursive: true });
  const existing = await fs
    .readdir(target)
    .catch(() => []);
  if (existing.length > 0) {
    throw new Error(`目标目录非空：${targetRoot}（导入要求空目录或不存在）`);
  }
  zip.extractAllTo(target, true);
}

export { exportBoard, importBoard };
