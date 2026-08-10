/**
 * @file CLI add 命令端到端测试
 * @description 以子进程驱动 CLI 验证对象创建契约：数据解析、id 续号、来源前缀与跨进程恢复。
 * @author Zhou Chenyu
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { jest } from "@jest/globals";

import {
  runCli,
  runCliJson,
  setupCliTestEnv,
  STROKE_DATA,
  tempBoardDir,
} from "./cli-test-helper.js";

setupCliTestEnv();

describe("CLI add 命令", () => {
  jest.setTimeout(60000);

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

  test("add 支持 --property；宽松 JSON 兼容 shell 吃掉引号的裸值", async () => {
    const { dir, cleanup } = tempBoardDir();
    try {
      await runCli(["create", "--path", dir, "--width", "800", "--height", "600"]);
      // PowerShell 会吃掉内嵌双引号：{color: "#f00"} 到达进程时已成 {color: #f00}
      const { stdout: id } = await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        "{points: [{x: 1, y: 1}, {x: 9, y: 9}]}",
        "--property",
        "{color: #f00, width: 3}",
      ]);
      const shown = await runCliJson(["show", id.trim(), "--path", dir]);
      expect(shown.property.color).toBe("#f00");
      expect(shown.property.width).toBe(3);
      // 布尔与 null 裸值不补引号
      const { stdout: id2 } = await runCli([
        "add",
        "--path",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        "{points: [{x: 1, y: 1}], closed: false}",
      ]);
      const shown2 = await runCliJson(["show", id2.trim(), "--path", dir]);
      expect(shown2.data.closed).toBe(false);
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
});
