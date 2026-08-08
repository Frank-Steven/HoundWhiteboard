/**
 * @file CLI 板路径解析测试
 * @description 验证 ~ 展开与路径直通（不隐式改写用户输入）。
 * @module cli/tests/board-path.test
 * @author Zhou Chenyu
 */

import os from "node:os";
import path from "node:path";
import { resolveBoardPath } from "../board-path.js";

describe("resolveBoardPath", () => {
  test("~ 展开为家目录（单独、斜杠、反斜杠）", () => {
    expect(resolveBoardPath("~")).toBe(os.homedir());
    expect(resolveBoardPath("~/my-board")).toBe(path.join(os.homedir(), "my-board"));
    expect(resolveBoardPath("~\\my-board")).toBe(path.join(os.homedir(), "my-board"));
  });

  test("绝对路径与相对路径直通（不隐式改写）", () => {
    const abs = path.join(os.homedir(), "x", "board");
    expect(resolveBoardPath(abs)).toBe(abs);
    expect(resolveBoardPath("D:/tmp/board")).toBe(path.resolve("D:/tmp/board"));
    expect(resolveBoardPath("relative-board")).toBe(path.resolve("relative-board"));
  });

  test("空输入报错", () => {
    expect(() => resolveBoardPath("")).toThrow("缺少板目录路径");
    expect(() => resolveBoardPath("  ")).toThrow("缺少板目录路径");
  });
});
