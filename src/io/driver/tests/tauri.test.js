/**
 * @file Tauri IoDriver 测试
 * @author Zhou Chenyu
 */

import { createTauriDriver } from "../tauri.js";
import { bindRoot, isIoDriver } from "../io-driver.js";

const ROOT_ID = "root-abc";

/**
 * 创建带 mock transport 的 Tauri 驱动
 * @returns {{driver: Object, d: Object, calls: Array}} 驱动与调用记录
 */
function setup() {
  /** @type {Array<{command: string, args: Object}>} */
  const calls = [];
  const invoke = async (command, args) => {
    calls.push({ command, args });
    return null;
  };
  const driver = createTauriDriver({ invoke });
  const d = bindRoot(driver, ROOT_ID);
  return { driver, d, calls };
}

describe("createTauriDriver", () => {
  test("满足 IoDriver 契约", () => {
    const { driver } = setup();
    expect(isIoDriver(driver)).toBe(true);
  });

  test("无 invoke 且无 Tauri 环境时构造抛错", () => {
    expect(() => createTauriDriver({ invoke: undefined })).toThrow(
      "Tauri invoke unavailable"
    );
  });
});

describe("tauri 调用转发", () => {
  test("read 转发到 safe_io_fs_read 且 relPath 已规范化", async () => {
    const { d, calls } = setup();
    await d.read("a//b.txt");
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("safe_io_fs_read");
    expect(calls[0].args).toEqual({
      rootId: ROOT_ID,
      relPath: "a/b.txt",
      encoding: "utf8",
    });
  });

  test("write 携带内容", async () => {
    const { d, calls } = setup();
    await d.write("f.txt", "hello");
    expect(calls[0].command).toBe("safe_io_fs_write");
    expect(calls[0].args.content).toBe("hello");
  });

  test("cp/mv/zipFrom 携带双路径", async () => {
    const { d, calls } = setup();
    await d.cp("src.txt", "dst.txt");
    expect(calls[0].command).toBe("safe_io_fs_cp");
    expect(calls[0].args).toEqual({ rootId: ROOT_ID, srcRel: "src.txt", destRel: "dst.txt" });

    await d.mv("a", "b");
    expect(calls[1].command).toBe("safe_io_fs_mv");

    await d.zipFrom("pack", "pack.zip");
    expect(calls[2].command).toBe("safe_io_zip_from");
  });

  test("hide 转发 safe_io_fs_hide", async () => {
    const { d, calls } = setup();
    await d.hide("secret.txt");
    expect(calls[0].command).toBe("safe_io_fs_hide");
  });

  test("registerRoot 携带权限声明", async () => {
    const { driver, calls } = setup();
    await driver.registerRoot("/abs/path", { read: true, write: false });
    expect(calls[0].command).toBe("safe_io_register_root");
    expect(calls[0].args).toEqual({
      absPath: "/abs/path",
      permissions: { read: true, write: false },
    });
  });

  test("非法相对路径不触发 invoke", async () => {
    const { d, calls } = setup();
    expect(await d.read("../escape")).toBe(null);
    expect(await d.write("/abs", "x")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("Rust 返回值原样透传", async () => {
    const invoke = async () => ({ success: true, path: ".x" });
    const driver = createTauriDriver({ invoke });
    const d = bindRoot(driver, ROOT_ID);
    const result = await d.hide("x");
    expect(result).toEqual({ success: true, path: ".x" });
  });

  test("Rust 拒绝时转为安全值不抛错", async () => {
    const invoke = async () => {
      throw new Error("permission denied");
    };
    const driver = createTauriDriver({ invoke });
    const d = bindRoot(driver, ROOT_ID);
    expect(await d.read("x")).toBe(null);
    expect(await d.write("x", "y")).toBe(false);
    expect(await d.ls("x")).toEqual([]);
  });
});
