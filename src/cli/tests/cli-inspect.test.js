/**
 * @file CLI 查询命令端到端测试
 * @description 以子进程驱动 CLI 验证查询类命令契约：create 持久化、ops 过滤、tree 打印与错误退出。
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";

import {
  runCli,
  runCliJson,
  setupCliTestEnv,
  STROKE_DATA,
  tempBoardDir,
} from "./cli-test-helper.js";

setupCliTestEnv();

describe("CLI 查询命令", () => {
  jest.setTimeout(60000);

  test("create 创建空板并持久化板配置", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      const info = await runCliJson([
        "create",
        "--path",
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

  test("ops 打印操作记录明细，支持过滤与 limit", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const { stdout: id } = await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli(["delete", id.trim(), "--path", dir]);

      const all = await runCliJson(["ops", "--path", dir]);
      expect(all.map((r) => r.type)).toEqual(["add-object", "delete-object"]);
      expect(all[0].id).toBe("cli/op-1");
      expect(all[1].parentId).toBe("cli/op-1");

      const limited = await runCliJson(["ops", "--path", dir, "--limit", "1"]);
      expect(limited).toHaveLength(1);
      expect(limited[0].type).toBe("delete-object");

      const filtered = await runCliJson([
        "ops",
        "--path",
        dir,
        "--type",
        "add-object",
      ]);
      expect(filtered).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  test("tree 以缩进树打印活动链、HEAD 与已撤销分支", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const { stdout: emptyOut } = await runCli(["tree", "--path", dir]);
      expect(emptyOut).toContain("（空树）");

      await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli(["undo", "cli/op-2", "--path", dir]);

      const { stdout } = await runCli(["tree", "--path", dir]);
      expect(stdout).toContain("cli/op-1  add-object  [HEAD]");
      expect(stdout).toContain("  cli/op-2  add-object  [已撤销]");
      expect(stdout).toContain("重做栈：cli/op-2");
    } finally {
      cleanup();
    }
  });

  test("打开不存在的板报错退出", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await expect(runCli(["list", "--path", dir])).rejects.toMatchObject({
        code: 1,
      });
    } finally {
      cleanup();
    }
  });
});
