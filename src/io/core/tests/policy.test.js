/**
 * @file 权限策略与预设测试
 * @author Zhou Chenyu
 */

import {
  OP_PERMISSION_KEYS,
  PERMISSION_PRESETS,
  checkPermissions,
  getPreset,
  isValidPermissions,
  mergePermissions,
} from "../policy.js";

describe("PERMISSION_PRESETS / getPreset", () => {
  test("预设字段齐全且为布尔", () => {
    for (const preset of Object.values(PERMISSION_PRESETS)) {
      expect(isValidPermissions(preset)).toBe(true);
    }
  });

  test("READ_ONLY 可读不可写", () => {
    const preset = getPreset("READ_ONLY");
    expect(preset.read).toBe(true);
    expect(preset.write).toBe(false);
    expect(preset.rm).toBe(false);
    expect(preset.hide).toBe(false);
  });

  test("FULL 全量开放", () => {
    const preset = getPreset("FULL");
    expect(Object.values(preset).every(Boolean)).toBe(true);
  });

  test("未知预设回退 READ_ONLY 且返回副本", () => {
    const a = getPreset("UNKNOWN");
    const b = getPreset("READ_ONLY");
    expect(a).toEqual(b);
    a.write = true;
    expect(b.write).toBe(false);
  });
});

describe("mergePermissions", () => {
  test("取交集只减不增", () => {
    const base = getPreset("FULL");
    const narrowed = mergePermissions(base, { write: false, rm: false });
    expect(narrowed.write).toBe(false);
    expect(narrowed.rm).toBe(false);
    expect(narrowed.read).toBe(true);
    expect(narrowed.hide).toBe(true);
  });

  test("override 缺省字段不额外收窄", () => {
    const base = getPreset("FULL");
    const narrowed = mergePermissions(base, { zip: false });
    expect(narrowed.zip).toBe(false);
    expect(narrowed.hide).toBe(true);
  });

  test("空 base 全 false", () => {
    const narrowed = mergePermissions(null, { read: true });
    expect(narrowed.read).toBe(false);
  });
});

describe("checkPermissions", () => {
  test("操作到权限字段映射正确", () => {
    const full = getPreset("FULL");
    expect(checkPermissions(full, "read")).toBe(true);
    expect(checkPermissions(full, "rm")).toBe(true);
    expect(checkPermissions(full, "zipFrom")).toBe(true);
  });

  test("READ_ONLY 拒绝写类操作", () => {
    const readOnly = getPreset("READ_ONLY");
    expect(checkPermissions(readOnly, "read")).toBe(true);
    expect(checkPermissions(readOnly, "write")).toBe(false);
    expect(checkPermissions(readOnly, "rm")).toBe(false);
    expect(checkPermissions(readOnly, "mkdir")).toBe(false);
    expect(checkPermissions(readOnly, "hide")).toBe(false);
    expect(checkPermissions(readOnly, "zipExtract")).toBe(false);
  });

  test("未知操作返回 false", () => {
    expect(checkPermissions(getPreset("FULL"), "unknown")).toBe(false);
    expect(checkPermissions(null, "read")).toBe(false);
  });

  test("op 映射表覆盖全部驱动操作", () => {
    const ops = [
      "read", "write", "ls", "stat", "exists", "rm", "cp", "mv",
      "mkdir", "hide", "unhide", "isHidden", "zipFrom", "zipExtract", "zipList",
    ];
    for (const op of ops) {
      expect(OP_PERMISSION_KEYS[op]).toBeTruthy();
    }
  });
});
