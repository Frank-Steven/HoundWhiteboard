/**
 * @file 内存 IoDriver 测试
 * @author Zhou Chenyu
 */

import { createMemoryDriver } from "../memory.js";
import { bindRoot, isIoDriver } from "../io-driver.js";

const ROOT_ID = "memory";

async function setup() {
  const driver = createMemoryDriver({ rootId: ROOT_ID });
  const d = bindRoot(driver, ROOT_ID);
  return { driver, d };
}

describe("createMemoryDriver", () => {
  test("满足 IoDriver 契约", () => {
    expect(isIoDriver(createMemoryDriver())).toBe(true);
  });

  test("registerRoot 返回固定 rootId", async () => {
    const driver = createMemoryDriver({ rootId: "mem" });
    const { rootId } = await driver.registerRoot("/ignored");
    expect(rootId).toBe("mem");
  });
});

describe("memory fs 操作", () => {
  test("write/read 往返", async () => {
    const { d } = await setup();
    expect(await d.write("a.txt", "hello")).toBe(true);
    expect(await d.read("a.txt")).toBe("hello");
  });

  test("write 自动创建父目录", async () => {
    const { d } = await setup();
    await d.write("chunks/0.json", "{}");
    expect(await d.read("chunks/0.json")).toBe("{}");
    expect(await d.stat("chunks")).not.toBeNull();
  });

  test("read 不存在的文件返回 null", async () => {
    const { d } = await setup();
    expect(await d.read("nope.txt")).toBe(null);
  });

  test("exists/stat 区分文件与目录", async () => {
    const { d } = await setup();
    await d.mkdir("dir1");
    await d.write("dir1/f.txt", "x");

    expect(await d.exists("dir1")).toBe(true);
    expect(await d.exists("dir1/f.txt")).toBe(true);
    expect(await d.exists("dir1/missing")).toBe(false);

    const dirStat = await d.stat("dir1");
    expect(dirStat.isDir).toBe(true);
    expect(dirStat.isFile).toBe(false);

    const fileStat = await d.stat("dir1/f.txt");
    expect(fileStat.isFile).toBe(true);
    expect(fileStat.size).toBe(1);
  });

  test("ls 列出直接子条目并标记隐藏", async () => {
    const { d } = await setup();
    await d.mkdir("a");
    await d.write("a/b.txt", "1");
    await d.write("a/.hidden", "2");

    const entries = await d.ls("a");
    const names = entries.map((e) => e.name);
    expect(names).toContain("b.txt");
    expect(names).toContain(".hidden");

    const hidden = entries.find((e) => e.name === ".hidden");
    expect(hidden.hidden).toBe(true);
    const b = entries.find((e) => e.name === "b.txt");
    expect(b.isFile).toBe(true);
    expect(b.hidden).toBe(false);
  });

  test("ls 不存在的目录返回空数组", async () => {
    const { d } = await setup();
    expect(await d.ls("nope")).toEqual([]);
  });

  test("rm 删除文件与整棵子树", async () => {
    const { d } = await setup();
    await d.write("tree/a/1.txt", "x");
    await d.write("tree/a/2.txt", "y");
    await d.write("tree/b.txt", "z");

    expect(await d.rm("tree")).toBe(true);
    expect(await d.exists("tree")).toBe(false);
    expect(await d.read("tree/a/1.txt")).toBe(null);
    expect(await d.rm("tree")).toBe(false);
  });

  test("cp 复制文件与目录子树", async () => {
    const { d } = await setup();
    await d.write("src/a.txt", "content");
    await d.mkdir("src/sub");
    await d.write("src/sub/b.txt", "nested");

    expect(await d.cp("src", "dst")).toBe(true);
    expect(await d.read("dst/a.txt")).toBe("content");
    expect(await d.read("dst/sub/b.txt")).toBe("nested");
    expect(await d.read("src/a.txt")).toBe("content");
  });

  test("mv 移动后源路径消失", async () => {
    const { d } = await setup();
    await d.write("src.txt", "data");
    expect(await d.mv("src.txt", "dst.txt")).toBe(true);
    expect(await d.read("dst.txt")).toBe("data");
    expect(await d.exists("src.txt")).toBe(false);
  });

  test("非法相对路径被拒绝", async () => {
    const { d } = await setup();
    expect(await d.read("../escape")).toBe(null);
    expect(await d.write("/abs", "x")).toBe(false);
    expect(await d.read("a\\b")).toBe(null);
    expect(await d.write("a/../b", "x")).toBe(false);
  });
});

describe("memory hide 操作", () => {
  test("hide 重命名加前缀并返回新路径", async () => {
    const { d } = await setup();
    await d.write("secret.txt", "data");

    const result = await d.hide("secret.txt");
    expect(result.success).toBe(true);
    expect(result.path).toBe(".secret.txt");
    expect(await d.exists("secret.txt")).toBe(false);
    expect(await d.read(".secret.txt")).toBe("data");
    expect(await d.isHidden(".secret.txt")).toBe(true);
  });

  test("unhide 恢复原名", async () => {
    const { d } = await setup();
    await d.write("secret.txt", "data");
    const hidden = await d.hide("secret.txt");
    const unhidden = await d.unhide(hidden.path);
    expect(unhidden.path).toBe("secret.txt");
    expect(await d.isHidden("secret.txt")).toBe(false);
  });

  test("hide 不存在的路径返回 null", async () => {
    const { d } = await setup();
    expect(await d.hide("nope")).toBe(null);
  });

  test("隐藏目录时子树路径同步迁移", async () => {
    const { d } = await setup();
    await d.write("cfg/a.txt", "1");
    const result = await d.hide("cfg");
    expect(result.path).toBe(".cfg");
    expect(await d.read(".cfg/a.txt")).toBe("1");
    expect(await d.exists("cfg/a.txt")).toBe(false);
  });
});

describe("memory zip 操作", () => {
  test("zipFrom/zipExtract 往返还原文件", async () => {
    const { d } = await setup();
    await d.mkdir("pack");
    await d.write("pack/a.txt", "alpha");
    await d.write("pack/sub/b.txt", "beta");

    expect(await d.zipFrom("pack", "pack.zip")).toBe(true);

    const entries = await d.zipList("pack.zip");
    const names = entries.map((e) => e.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("sub/");

    expect(await d.zipExtract("pack.zip", "out")).toBe(true);
    expect(await d.read("out/a.txt")).toBe("alpha");
    expect(await d.read("out/sub/b.txt")).toBe("beta");
  });

  test("zipFrom 非法源或输出被拒绝", async () => {
    const { d } = await setup();
    expect(await d.zipFrom("nope", "out.zip")).toBe(false);
    expect(await d.zipFrom("", "out.zip")).toBe(false);
  });

  test("zipList 非 zip 条目返回空数组", async () => {
    const { d } = await setup();
    await d.write("plain.txt", "x");
    expect(await d.zipList("plain.txt")).toEqual([]);
  });
});
