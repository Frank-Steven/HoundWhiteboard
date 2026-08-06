/**
 * @file CLI 端到端测试
 * @description 以子进程驱动 CLI 验证第二前端契约：加载、修改、保存板文件全程命令行可用。
 * @module cli/tests/cli.test
 * @author Zhou Chenyu
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { jest } from "@jest/globals";

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL("../index.js", import.meta.url));

/**
 * 运行一次 CLI 命令
 * @param {string[]} argv - 命令参数
 * @returns {Promise<{stdout: string, stderr: string}>} 进程输出
 */
function runCli(argv) {
  return execFileAsync(process.execPath, [CLI_PATH, ...argv]);
}

/**
 * 运行一次 CLI 命令并解析 stdout 为 JSON
 * @param {string[]} argv - 命令参数
 * @returns {Promise<Object>} 解析结果
 */
async function runCliJson(argv) {
  const { stdout } = await runCli(argv);
  return JSON.parse(stdout);
}

/**
 * 创建临时板目录路径（不创建目录本身）
 * @returns {{dir: string, cleanup: () => void}} 路径与清理函数
 */
function tempBoardDir() {
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
const STROKE_DATA = JSON.stringify({
  points: [
    { x: 1, y: 1 },
    { x: 100, y: 100 },
  ],
});

describe("CLI 第二前端", () => {
  jest.setTimeout(60000);

  test("create 创建空板并持久化板配置", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      const info = await runCliJson([
        "create",
        dir,
        "--width",
        "800",
        "--height",
        "600",
      ]);
      expect(info.boardConfig).toEqual({ width: 800, height: 600 });
      expect(info.objects).toBe(0);
      expect(info.records).toBe(0);
    } finally {
      cleanup();
    }
  });

  test("add 创建对象并跨进程恢复", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", dir, "--width", "800", "--height", "600"]);
      const id = (
        await runCli([
          "add",
          dir,
          "--type",
          "StrokeObject",
          "--data",
          STROKE_DATA,
        ])
      ).stdout.trim();
      expect(id).toBe("cli/1");

      // 新进程重开：对象仍在（恢复路径）
      const listed = await runCliJson(["list", dir]);
      expect(listed.objects).toEqual([{ id: "cli/1", type: "StrokeObject" }]);
      expect(listed.trash).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("undo 跨进程持久化：撤销后重开对象不复活", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", dir, "--width", "800", "--height", "600"]);
      await runCli([
        "add",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli(["undo", dir]);

      // 新进程重开：撤销效果已落盘，对象不复活
      const listed = await runCliJson(["list", dir]);
      expect(listed.objects).toEqual([]);

      await runCli(["redo", dir]);
      const relisted = await runCliJson(["list", dir]);
      expect(relisted.objects).toEqual([
        { id: "cli/1", type: "StrokeObject" },
      ]);
    } finally {
      cleanup();
    }
  });

  test("delete 将对象移入 trash 且可撤销恢复", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", dir, "--width", "800", "--height", "600"]);
      await runCli([
        "add",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli(["delete", dir, "cli/1"]);

      const listed = await runCliJson(["list", dir]);
      expect(listed.objects).toEqual([]);
      expect(listed.trash).toEqual(["cli/1"]);

      await runCli(["undo", dir]);
      const relisted = await runCliJson(["list", dir]);
      expect(relisted.objects).toEqual([
        { id: "cli/1", type: "StrokeObject" },
      ]);
      expect(relisted.trash).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("对象 id 跨进程续号", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", dir, "--width", "800", "--height", "600"]);
      await runCli([
        "add",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      const id2 = (
        await runCli([
          "add",
          dir,
          "--type",
          "StrokeObject",
          "--data",
          STROKE_DATA,
        ])
      ).stdout.trim();
      expect(id2).toBe("cli/2");
    } finally {
      cleanup();
    }
  });

  test("--source 决定记录来源与对象 id 前缀", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", dir, "--width", "800", "--height", "600"]);
      const id = (
        await runCli([
          "add",
          dir,
          "--type",
          "StrokeObject",
          "--data",
          STROKE_DATA,
          "--source",
          "alice",
        ])
      ).stdout.trim();
      expect(id).toBe("alice/1");

      const info = await runCliJson(["info", dir, "--source", "alice"]);
      expect(info.objectIdCounters).toEqual({ alice: 1 });
    } finally {
      cleanup();
    }
  });

  test("打开不存在的板报错退出", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await expect(runCli(["list", dir])).rejects.toMatchObject({
        code: 1,
      });
    } finally {
      cleanup();
    }
  });
});
