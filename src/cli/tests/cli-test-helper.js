/**
 * @file CLI 测试支撑
 * @description 提供 CLI 端到端测试通用的子进程执行、测试内 daemon 启动、临时板目录与环境隔离辅助。
 * @author Zhou Chenyu
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll } from "@jest/globals";
import { startBoardDaemon } from "../board-daemon.js";
import { openBoardSession } from "../board-session.js";

const execFileAsync = promisify(execFile);

/**
 * CLI 入口文件绝对路径
 * @type {string}
 */
const CLI_PATH = fileURLToPath(new URL("../index.js", import.meta.url));

/** 测试前 HWB_LANG 的原值（未设置则为 undefined，afterAll 据此还原） */
let savedHwbLang;

/**
 * 注册测试环境隔离钩子：注册表指向临时目录，避免子进程读到真实 daemon
 * @returns {void}
 *
 * @description
 * 同时把 CLI 子进程语言固定为中文（HWB_LANG），断言中文文案的测试不随运行环境 LANG 漂移。
 */
export function setupCliTestEnv() {
  beforeAll(() => {
    process.env.HWB_DAEMON_DIR = path.join(
      tmpdir(),
      `hwb-cli-test-registry-${process.pid}`,
    );
    savedHwbLang = process.env.HWB_LANG;
    process.env.HWB_LANG ??= "zh_CN";
  });

  afterAll(() => {
    delete process.env.HWB_DAEMON_DIR;
    if (savedHwbLang === undefined) {
      delete process.env.HWB_LANG;
    } else {
      process.env.HWB_LANG = savedHwbLang;
    }
  });
}

/**
 * 运行一次 CLI 命令
 * @param {string[]} argv - 命令参数
 * @param {Object} [env] - 环境变量覆盖（如 { HWB_LANG: "en_US" }）
 * @returns {Promise<{stdout: string, stderr: string}>} 进程输出
 *
 * @description
 * 显式传 env：jest 沙箱下默认 env 快照不含测试期间设置的变量。
 */
export function runCli(argv, env = {}) {
  return execFileAsync(process.execPath, [CLI_PATH, ...argv], {
    env: { ...process.env, ...env },
  });
}

/**
 * 运行一次 CLI 命令并解析 stdout 为 JSON
 * @param {string[]} argv - 命令参数
 * @returns {Promise<Object>} 解析结果
 *
 * @description
 * 自动追加 --json（已显式传入时不重复），保证 stdout 为纯 JSON。
 */
export async function runCliJson(argv) {
  const { stdout } = await runCli(
    argv.includes("--json") ? argv : [...argv, "--json"],
  );
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
 * 在测试进程内启动一个板 daemon（不经子进程，可靠且快速）
 * @param {string} name - daemon 名
 * @param {string} boardDir - 板目录（已存在或 --create 语义由调用方保证）
 * @param {Object} [options] - 启动选项（source 等）
 * @returns {Promise<{name: string, rootPath: string, port: number, close: Function}>} daemon 句柄
 */
export async function startTestDaemon(name, boardDir, options = {}) {
  // 测试内嵌 daemon：引用归零只清理不退出（退出会杀掉测试进程）
  return startBoardDaemon({ name, rootPath: boardDir, exitOnZero: false, ...options });
}

/**
 * 创建空板（测试内直开会话建板）
 * @param {string} boardDir - 板目录
 * @param {{width?: number, height?: number}} [config] - 板尺寸
 * @returns {Promise<void>}
 */
export async function createTestBoard(boardDir, config = {}) {
  const session = await openBoardSession(boardDir, {
    create: true,
    width: config.width ?? 800,
    height: config.height ?? 600,
  });
  await session.flush();
  await session.close();
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
