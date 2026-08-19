/**
 * @file 路径 DSL 与名称校验测试
 * @author Zhou Chenyu
 */

import {
  entryToRel,
  isValidName,
  isValidRelPath,
  joinRel,
  normalizeRel,
} from "../dsl.js";

describe("isValidName", () => {
  test("接受普通名称", () => {
    expect(isValidName("chunks")).toBe(true);
    expect(isValidName("board-1")).toBe(true);
    expect(isValidName("对象")).toBe(true);
  });

  test("拒绝空串与超长名称", () => {
    expect(isValidName("")).toBe(false);
    expect(isValidName("a".repeat(256))).toBe(false);
    expect(isValidName(42)).toBe(false);
  });

  test("拒绝特殊名称", () => {
    expect(isValidName(".")).toBe(false);
    expect(isValidName("..")).toBe(false);
    expect(isValidName("name.")).toBe(false);
  });

  test("拒绝含路径分隔符与保留字符的名称", () => {
    expect(isValidName("a/b")).toBe(false);
    expect(isValidName("a\\b")).toBe(false);
    expect(isValidName("a:b")).toBe(false);
    expect(isValidName('a"b')).toBe(false);
    expect(isValidName("a\0b")).toBe(false);
  });
});

describe("entryToRel", () => {
  test("Dir 条目转换为单段路径", () => {
    expect(entryToRel({ __type: "Dir", name: "chunks" })).toBe("chunks");
  });

  test("File 条目转换为带扩展名路径", () => {
    expect(entryToRel({ __type: "File", name: "meta", ext: "json" })).toBe("meta.json");
    expect(entryToRel({ __type: "File", name: "trace", ext: "" })).toBe("trace");
  });

  test("非法条目返回 null", () => {
    expect(entryToRel({ __type: "Dir", name: "a/b" })).toBe(null);
    expect(entryToRel({ __type: "File", name: "a/b", ext: "json" })).toBe(null);
    expect(entryToRel(null)).toBe(null);
    expect(entryToRel({ __type: "Unknown", name: "x" })).toBe(null);
  });
});

describe("isValidRelPath / normalizeRel", () => {
  test("接受多段相对路径", () => {
    expect(isValidRelPath("a/b/c.json")).toBe(true);
    expect(isValidRelPath("chunks/0.json")).toBe(true);
  });

  test("拒绝绝对路径、穿越与反斜杠", () => {
    expect(isValidRelPath("/a/b")).toBe(false);
    expect(isValidRelPath("../a")).toBe(false);
    expect(isValidRelPath("a/../b")).toBe(false);
    expect(isValidRelPath("a\\b")).toBe(false);
    expect(isValidRelPath("")).toBe(false);
    expect(isValidRelPath("a//b")).toBe(false);
  });

  test("规范化去除首尾与重复分隔符", () => {
    expect(normalizeRel("a//b/")).toBe("a/b");
    expect(normalizeRel("/a/b/")).toBe("a/b");
    expect(normalizeRel("")).toBe("");
  });
});

describe("joinRel", () => {
  test("挂载条目描述符", () => {
    expect(joinRel("chunks", { __type: "File", name: "0", ext: "json" })).toBe("chunks/0.json");
    expect(joinRel("", { __type: "Dir", name: "objects" })).toBe("objects");
    expect(joinRel("a", { __type: "Dir", name: "b/c" })).toBe(null);
  });
});
