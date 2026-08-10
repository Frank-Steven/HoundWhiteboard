/**
 * @file CLI 端到端测试
 * @description 以子进程驱动 CLI 验证第二前端契约：加载、修改、保存板文件全程命令行可用。
 * @module cli/tests/cli.test
 * @author Zhou Chenyu
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { jest } from "@jest/globals";

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL("../index.js", import.meta.url));

// 测试环境隔离：避免子进程读到真实 daemon 的全局引用
beforeAll(() => {
  process.env.HWB_DAEMON_REF = path.join(tmpdir(), "hwb-cli-test-no-daemon.json");
});

afterAll(() => {
  delete process.env.HWB_DAEMON_REF;
});

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

  test("add 创建对象并跨进程恢复", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const id = (
        await runCli([
          "add",
          "--path",
          dir,
          "--type",
          "StrokeObject",
          "--data",
          STROKE_DATA,
        ])
      ).stdout.trim();
      expect(id).toBe("cli/1");

      // 新进程重开：对象仍在（恢复路径）
      const listed = await runCliJson(["list", "--path", dir]);
      expect(listed.objects).toEqual([{ id: "cli/1", type: "StrokeObject" }]);
      expect(listed.trash).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("add 缺 --data 报错；--data @文件可读", async () => {
    const { dir, cleanup } = tempBoardDir();
    const dataFile = path.join(dir, "stroke.json");
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      writeFileSync(dataFile, JSON.stringify(JSON.parse(STROKE_DATA)));
      await expect(
        runCli(["add", "--path", dir, "--type", "StrokeObject"]),
      ).rejects.toThrow("需要 --data");
      const id = (
        await runCli(["add", "--path", dir, "--type", "StrokeObject", "--data", `@${dataFile}`])
      ).stdout.trim();
      expect(id).toBe("cli/1");
      const listed = await runCliJson(["list", "--path", dir]);
      expect(listed.objects).toEqual([{ id: "cli/1", type: "StrokeObject" }]);
    } finally {
      cleanup();
    }
  });

  test("add 宽松解析 --data：裸属性名与单引号可接受", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const id = (
        await runCli(["add", "--path", dir, "--type", "CircleObject", "--data", "{radius: 20}"])
      ).stdout.trim();
      expect(id).toBe("cli/1");
      const shown = await runCliJson(["show", "cli/1", "--path", dir]);
      expect(shown.data.radius).toBe(20);

      const id2 = (
        await runCli(["add", "--path", dir, "--type", "CircleObject", "--data", "{'radius': 30}"])
      ).stdout.trim();
      const shown2 = await runCliJson(["show", id2, "--path", dir]);
      expect(shown2.data.radius).toBe(30);
    } finally {
      cleanup();
    }
  });

  test("undo 带显式操作 id：撤销指定节点，info 输出 chain", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const { stdout: id1 } = await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      const { stdout: id2 } = await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      expect(id1.trim()).toBe("cli/1");
      expect(id2.trim()).toBe("cli/2");

      // info 输出活动链节点列表
      const info = await runCliJson(["info", "--path", dir]);
      expect(info.chain).toEqual(["cli/op-1", "cli/op-2"]);

      // 显式撤销 op-1（非本端最近节点也支持）
      const { stdout: undoOut } = await runCli(["undo", "cli/op-1", "--path", dir]);
      expect(undoOut).toContain("撤销 cli/op-1");
      const listed = await runCliJson(["list", "--path", dir]);
      expect(listed.objects.map((o) => o.id)).toEqual(["cli/2"]);

      // 显式撤销不在活动链上的 id 报无可撤销
      const { stdout: badOut } = await runCli(["undo", "cli/op-999", "--path", dir]);
      expect(badOut).toContain("无可撤销目标");
    } finally {
      cleanup();
    }
  });

  test("undo 跨进程持久化：撤销后重开对象不复活", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli(["undo", "--path", dir]);

      // 新进程重开：撤销效果已落盘，对象不复活
      const listed = await runCliJson(["list", "--path", dir]);
      expect(listed.objects).toEqual([]);

      await runCli(["redo", "--path", dir]);
      const relisted = await runCliJson(["list", "--path", dir]);
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
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      await runCli(["delete", "cli/1", "--path", dir]);

      const listed = await runCliJson(["list", "--path", dir]);
      expect(listed.objects).toEqual([]);
      expect(listed.trash).toEqual(["cli/1"]);

      await runCli(["undo", "--path", dir]);
      const relisted = await runCliJson(["list", "--path", dir]);
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
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        STROKE_DATA,
      ]);
      const id2 = (
        await runCli([
          "add",
          "--path",
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
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const id = (
        await runCli([
          "add",
          "--path",
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

      const info = await runCliJson(["info", "--path", dir, "--source", "alice"]);
      expect(info.objectIdCounters).toEqual({ alice: 1 });
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

  test("choose/choices/unchoose：命名 buffer 生命周期", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const { stdout: id1 } = await runCli([
        "add", "--path", dir, "--type", "StrokeObject", "--data", STROKE_DATA,
      ]);
      const { stdout: id2 } = await runCli([
        "add", "--path", dir, "--type", "StrokeObject", "--data", STROKE_DATA,
      ]);

      await runCli(["choose", id1.trim(), id2.trim(), "--choice", "c1", "--path", dir]);
      const choices = await runCliJson(["choices", "--path", dir]);
      expect(choices.c1.map((m) => m.id)).toEqual([id1.trim(), id2.trim()]);

      // 对象移 choice：从 c1 摘出进 c2，c1 只剩 id1
      await runCli(["choose", id2.trim(), "--choice", "c2", "--path", dir]);
      const after = await runCliJson(["choices", "--path", dir]);
      expect(after.c1.map((m) => m.id)).toEqual([id1.trim()]);
      expect(after.c2.map((m) => m.id)).toEqual([id2.trim()]);

      await runCli(["unchoose", "c2", "--discard", "--path", dir]);
      const final = await runCliJson(["choices", "--path", dir]);
      expect(final.c2).toBeUndefined();
      expect(final.c1).toHaveLength(1);

      // 缺 --apply/--discard 报错
      await expect(
        runCli(["unchoose", "c1", "--path", dir]),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      cleanup();
    }
  });

  test("modify 单对象未选中自动成链；choice 增量逐对象换算；多对象 choice 禁全量", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      const { stdout: id1 } = await runCli([
        "add", "--path", dir, "--type", "StrokeObject", "--data", STROKE_DATA,
        "--position", "10,10",
      ]);
      const { stdout: id2 } = await runCli([
        "add", "--path", dir, "--type", "StrokeObject", "--data", STROKE_DATA,
        "--position", "20,20",
      ]);

      // 单对象未选中：自动链，position 全量 + 一条记录
      await runCli(["modify", id1.trim(), "--position", "100,50", "--path", dir]);
      const shown = await runCliJson(["show", id1.trim(), "--path", dir]);
      expect(shown.position).toEqual({ x: 100, y: 50 });
      const opsAfterSingle = await runCliJson(["ops", "--path", dir]);
      // add ×2 + 超分子链（choose/modify/unchoose 简并为一个节点）
      expect(opsAfterSingle.filter((r) => r.type === "modify-object")).toHaveLength(1);

      // choice 增量：两对象各自平移
      await runCli(["choose", id1.trim(), id2.trim(), "--choice", "mv", "--path", dir]);
      await runCli(["modify", "--choice", "mv", "--displacement", "5,-5", "--path", dir]);
      const moved1 = await runCliJson(["show", id1.trim(), "--path", dir]);
      const moved2 = await runCliJson(["show", id2.trim(), "--path", dir]);
      expect(moved1.position).toEqual({ x: 105, y: 45 });
      expect(moved2.position).toEqual({ x: 25, y: 15 });

      // 多对象 choice 禁全量
      await expect(
        runCli(["modify", "--choice", "mv", "--position", "0,0", "--path", dir]),
      ).rejects.toMatchObject({ code: 1 });

      // 单对象 choice 允许全量
      await runCli(["choose", id2.trim(), "--choice", "solo", "--path", dir]);
      await runCli(["modify", "--choice", "solo", "--position", "7,7", "--path", dir]);
      const solo = await runCliJson(["show", id2.trim(), "--path", dir]);
      expect(solo.position).toEqual({ x: 7, y: 7 });
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
