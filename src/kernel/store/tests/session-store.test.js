/**
 * @file 会话存储测试
 * @description 验证会话存储布局语义：骨架创建幂等、元数据往返、对象快照读写、trash 移动、日志段拼接与段序号推进。
 * @module kernel/store/tests/session-store.test
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { createMemoryDriver } from "../../../io/driver/memory.js";
import { bindRoot } from "../../../io/driver/io-driver.js";
import { createSessionStore } from "../session-store.js";

/**
 * 装配 memory 驱动绑定的会话存储
 * @returns {Object} 会话存储
 */
function setup() {
  const driver = createMemoryDriver({ rootId: "mem" });
  return createSessionStore(bindRoot(driver, "mem"));
}

describe("SessionStore", () => {
  test("create 建立目录骨架与元数据，重复创建不覆盖已有元数据", async () => {
    const store = setup();
    expect(await store.exists()).toBe(false);
    expect(await store.create({ boardName: "白板" })).toBe(true);
    expect(await store.exists()).toBe(true);
    expect((await store.readMeta()).boardName).toBe("白板");

    await store.writeMeta({ boardName: "改名", lastTime: 42 });
    expect(await store.create({ boardName: "覆盖" })).toBe(true);
    expect((await store.readMeta()).boardName).toBe("改名");
  });

  test("元数据写入自动加盖格式版本", async () => {
    const store = setup();
    await store.create();
    expect((await store.readMeta()).formatVersion).toBe(1);
    await store.writeMeta({ lastTime: 100 });
    const meta = await store.readMeta();
    expect(meta.formatVersion).toBe(1);
    expect(meta.lastTime).toBe(100);
  });

  test("对象快照写入与全量读回（含斜杠 id 编码）", async () => {
    const store = setup();
    await store.create();
    await store.writeObject({ id: "demo/1", type: "StrokeObject", data: { points: [] } });
    await store.writeObject({ id: "test/core/2", type: "StrokeObject" });
    const objects = await store.readAllObjects();
    expect(objects.map((o) => o.id).sort()).toEqual(["demo/1", "test/core/2"]);
    expect(objects.find((o) => o.id === "demo/1").type).toBe("StrokeObject");
  });

  test("非法对象数据写入被拒绝", async () => {
    const store = setup();
    await store.create();
    expect(await store.writeObject({ id: 1 })).toBe(false);
    expect(await store.writeObject(null)).toBe(false);
  });

  test("trash 写入与两侧移除", async () => {
    const store = setup();
    await store.create();
    await store.writeObject({ id: "demo/1", type: "StrokeObject" });
    await store.writeTrashObject({ id: "demo/2", type: "StrokeObject" });

    expect(await store.readAllObjects()).toHaveLength(1);
    const trash = await store.readAllTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0].id).toBe("demo/2");

    // 移除是幂等的（已不存在视为成功）
    expect(await store.removeObject("demo/1")).toBe(true);
    expect(await store.removeObject("demo/1")).toBe(true);
    expect(await store.readAllObjects()).toHaveLength(0);
    expect(await store.removeTrashObject("demo/2")).toBe(true);
    expect(await store.removeTrashObject("demo/404")).toBe(true);
    expect(await store.readAllTrash()).toHaveLength(0);
  });

  test("日志段追加与全量读取（段序拼接、序号推进）", async () => {
    const store = setup();
    await store.create();

    const empty = await store.readAllRecords();
    expect(empty.records).toEqual([]);
    expect(empty.nextSegmentSeq).toBe(0);

    await store.appendSegment(0, [
      { id: "a/op-1", type: "add-object" },
      { id: "a/op-2", type: "modify-object" },
    ]);
    await store.appendSegment(1, [{ id: "a/op-3", type: "delete-object" }]);

    const { records, nextSegmentSeq } = await store.readAllRecords();
    expect(records.map((r) => r.id)).toEqual(["a/op-1", "a/op-2", "a/op-3"]);
    expect(nextSegmentSeq).toBe(2);
  });

  test("空段不落成文件；非法段序号与记录被拒绝", async () => {
    const store = setup();
    await store.create();
    expect(await store.appendSegment(0, [])).toBe(true);
    expect((await store.readAllRecords()).nextSegmentSeq).toBe(0);
    expect(await store.appendSegment(-1, [{ id: "x" }])).toBe(false);
    expect(await store.appendSegment(0, null)).toBe(false);
  });

  test("段内损坏行被跳过，合法行保留", async () => {
    const driver = createMemoryDriver({ rootId: "mem2" });
    const d = bindRoot(driver, "mem2");
    const store = createSessionStore(d);
    await store.create();
    await d.write("hit/seg-000000.jsonl", '{"id":"a/op-1"}\n{bad json\n{"id":"a/op-2"}\n');
    const { records } = await store.readAllRecords();
    expect(records.map((r) => r.id)).toEqual(["a/op-1", "a/op-2"]);
  });
});
