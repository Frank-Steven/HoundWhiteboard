/**
 * @file SafeIO API 层测试
 * @author Zhou Chenyu
 */

import { createMemoryDriver } from "../../driver/memory.js";
import { createSafeIO, SafeIO } from "../safe-io.js";

async function setup() {
  const driver = createMemoryDriver({ rootId: "root-1" });
  const io = new SafeIO(driver);
  const root = await io.registerRoot("/ignored", "FULL");
  return { driver, io, root };
}

describe("SafeIO.registerRoot", () => {
  test("字符串预设展开为权限对象", async () => {
    const io = createSafeIO(createMemoryDriver());
    const root = await io.registerRoot("/x", "READ_WRITE");
    expect(root.rootId).toBe("memory");
    expect(root.permissions.write).toBe(true);
    expect(root.permissions.rm).toBe(false);
  });

  test("部分权限对象补全为 false", async () => {
    const io = createSafeIO(createMemoryDriver());
    const root = await io.registerRoot("/x", { read: true, write: true });
    expect(root.permissions.read).toBe(true);
    expect(root.permissions.write).toBe(true);
    expect(root.permissions.rm).toBe(false);
    expect(root.permissions.hide).toBe(false);
    expect(root.permissions.zip).toBe(false);
  });

  test("非法路径与非法权限抛错", async () => {
    const io = createSafeIO(createMemoryDriver());
    await expect(io.registerRoot("", "FULL")).rejects.toThrow();
    await expect(io.registerRoot("/x", { bogus: true })).rejects.toThrow();
  });
});

describe("SafeIO.open", () => {
  test("open 返回绑定相对路径的句柄", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "data/file.json");
    expect(h).not.toBeNull();
    expect(h.rel).toBe("data/file.json");
    expect(h.permissions.read).toBe(true);
  });

  test("Dir/File 条目描述符可作入口", async () => {
    const { io, root } = await setup();
    const dirHandle = await io.open(root, { __type: "Dir", name: "chunks" });
    expect(dirHandle.rel).toBe("chunks");

    const fileHandle = await io.open(root, { __type: "File", name: "meta", ext: "json" });
    expect(fileHandle.rel).toBe("meta.json");
  });

  test("句柄级权限只减不增", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "f.txt", { write: false, zip: false });
    expect(h.permissions.write).toBe(false);
    expect(h.permissions.read).toBe(true);
    expect(h.permissions.hide).toBe(true); // FULL 根保留
  });

  test("未注册的 rootId 返回 null", async () => {
    const { io } = await setup();
    const h = await io.open({ rootId: "unknown" }, "f.txt");
    expect(h).toBeNull();
  });

  test("非法相对路径返回 null", async () => {
    const { io, root } = await setup();
    expect(await io.open(root, "../escape")).toBeNull();
    expect(await io.open(root, "/abs")).toBeNull();
  });
});

describe("Handle 操作与权限", () => {
  test("FULL 句柄读写往返", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "a.txt");
    expect(await h.write("content")).toBe(true);
    expect(await h.read()).toBe("content");
  });

  test("READ_ONLY 根下写操作被拒绝且不落盘", async () => {
    const driver = createMemoryDriver();
    const io = new SafeIO(driver);
    const root = await io.registerRoot("/x", "READ_ONLY");
    const h = await io.open(root, "a.txt");

    expect(await h.write("x")).toBe(false);
    expect(await h.read()).toBe(null);
    expect(await h.exists()).toBe(false);
  });

  test("revoke 后所有操作被拒绝", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "a.txt");
    expect(await h.write("x")).toBe(true);

    h.revoke();
    expect(h.isRevoked()).toBe(true);
    expect(await h.read()).toBe(null);
    expect(await h.write("y")).toBe(false);
    expect(await h.rm()).toBe(false);
  });

  test("mkdir/ls/stat/exists 生效", async () => {
    const { io, root } = await setup();
    const dirH = await io.open(root, "dir");
    expect(await dirH.mkdir()).toBe(true);

    const fileH = await io.open(root, "dir/f.txt");
    await fileH.write("hi");

    const entries = await dirH.ls();
    expect(entries.map((e) => e.name)).toContain("f.txt");

    const stat = await fileH.stat();
    expect(stat.size).toBe(2);

    expect(await fileH.exists()).toBe(true);
  });

  test("cp/mv/hide/zip 经句柄执行", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "src.txt");
    await h.write("data");

    expect(await h.cp("copy.txt")).toBe(true);
    expect(await h.mv("moved.txt")).toBe(true);

    const movedH = await io.open(root, "moved.txt");
    expect(await movedH.read()).toBe("data");

    const hidden = await movedH.hide();
    expect(hidden.success).toBe(true);

    const hiddenH = await io.open(root, hidden.path);
    expect(await hiddenH.read()).toBe("data");
  });

  test("审计历史记录操作", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "a.txt");
    await h.write("x");
    await h.read();
    await h.rm();

    const history = h.getAuditHistory();
    const ops = history.map((e) => e.op);
    expect(ops).toContain("write");
    expect(ops).toContain("read");
    expect(ops).toContain("rm");
    expect(history.find((e) => e.op === "write").success).toBe(true);
  });

  test("审计只记录成功执行的调用", async () => {
    const { io, root } = await setup();
    const h = await io.open(root, "a.txt", { write: false });
    await h.write("x");
    expect(h.getAuditHistory()).toHaveLength(0);
  });
});

describe("SafeIO 生命周期", () => {
  test("unregisterRoot 后 open 返回 null", async () => {
    const { io, root } = await setup();
    expect(await io.unregisterRoot(root)).toBe(true);
    expect(await io.open(root, "a.txt")).toBeNull();
    expect(await io.listRoots()).toEqual([]);
  });

  test("driver 不满足契约时构造抛错", () => {
    expect(() => new SafeIO({ read: () => {} })).toThrow(
      "Invalid IoDriver implementation"
    );
  });
});
