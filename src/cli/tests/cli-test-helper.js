/**
 * @file CLI 测试支撑
 * @description 提供 CLI 端到端测试通用的子进程执行、临时板目录与环境隔离辅助。
 * @module cli/tests/cli-test-helper
 * @author Zhou Chenyu
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll } from "@jest/globals";

const execFileAsync = promisify(execFile);

/**
 * CLI 入口文件绝对路径
 * @type {string}
 */
const CLI_PATH = fileURLToPath(new URL("../index.js", import.meta.url));

/**
 * 注册测试环境隔离钩子：避免子进程读到真实 daemon 的全局引用
 * @returns {void}
 */
export function setupCliTestEnv() {
  beforeAll(() => {
    process.env.HWB_DAEMON_REF = path.join(
      tmpdir(),
      "hwb-cli-test-no-daemon.json",
    );
  });

  afterAll(() => {
    delete process.env.HWB_DAEMON_REF;
  });
}

/**
 * 运行一次 CLI 命令
 * @param {string[]} argv - 命令参数
 * @returns {Promise<{stdout: string, stderr: string}>} 进程输出
 */
export function runCli(argv) {
  return execFileAsync(process.execPath, [CLI_PATH, ...argv]);
}

/**
 * 运行一次 CLI 命令并解析 stdout 为 JSON
 * @param {string[]} argv - 命令参数
 * @returns {Promise<Object>} 解析结果
 */
export async function runCliJson(argv) {
  const { stdout } = await runCli(argv);
  return JSON.parse(stdout);
}

/**
 * 创建临时板目录路径（不创建目录本身）
 * @returns {{dir: string, cleanup: () => void}} 路径与清理函数
 */
export function tempBoardDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "hwb-cli-test-"));
  const board = path.join(dir, "board");
  return {
    dir: board,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * 笔画数据样例
 * @type {string}
 */
export const STROKE_DATA = JSON.stringify({
  points: [
    { x: 1, y: 1 },
    { x: 100, y: 100 },
  ],
});
