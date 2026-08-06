/**
 * @file 日志跟随者测试
 * @description 验证日志跟随者把操作日志增量落为段文件，并把对象文件与板元数据对齐到撤销/重做/远端记录引起的任意白板状态。
 * @module kernel/store/tests/journaler.test
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { createMemoryDriver } from "../../../io/driver/memory.js";
import { bindRoot } from "../../../io/driver/io-driver.js";
import { BoardCore } from "../../board/board-core.js";
import { BoardApi } from "../../api/board-api.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../board/persistence-adapter.js";
import { createAddObjectOperation } from "../../hit/operation.js";
import { createSessionStore } from "../session-store.js";
import { createJournaler } from "../journaler.js";

/**
 * 装配内核、会话存储与跟随者
 * @returns {Object} 测试上下文
 */
function setup() {
  const boardCore = new BoardCore({
    width: 800,
    height: 600,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
  const api = new BoardApi(boardCore);
  const driver = createMemoryDriver({ rootId: "mem" });
  const store = createSessionStore(bindRoot(driver, "mem"));
  return { boardCore, api, store };
}

/**
 * 创建并提交一笔静态笔画
 * @param {BoardApi} api - 内核 API
 * @param {string} id - 对象 id
 * @returns {Promise<void>}
 */
async function createStaticStroke(api, id) {
  api.createObject("StrokeObject", {
    id,
    position: { x: 0, y: 0 },
    property: { width: 2 },
    data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  });
  await api.commitObjects([id]);
}

/**
 * 读出全部日志段中的记录
 * @param {Object} store - 会话存储
 * @returns {Promise<Object[]>} 记录数组
 */
async function readRecords(store) {
  return (await store.readAllRecords()).records;
}

describe("Journaler", () => {
  test("本地 commit 落为段文件，对象快照与元数据同步", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    await createStaticStroke(api, "demo/1");
    await journaler.flush();

    const records = await readRecords(store);
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe("add-object");

    const objects = await store.readAllObjects();
    expect(objects).toHaveLength(1);
    expect(objects[0].id).toBe("demo/1");

    const meta = await store.readMeta();
    expect(meta.nextSegmentSeq).toBe(1);
    expect(meta.lastTime).toBe(records[0].time);
  });

  test("modify 后对象文件内容更新", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    await createStaticStroke(api, "s1");
    await api.addActiveObjects(["s1"]);
    api.modifyObject("s1", { position: { x: 42, y: 0 } });
    await api.commitObjects(["s1"]);
    await journaler.flush();

    const objects = await store.readAllObjects();
    expect(objects).toHaveLength(1);
    expect(objects[0].position.x).toBe(42);
    // choose/modify/unchoose 三条记录依次入段
    const types = (await readRecords(store)).map((r) => r.type);
    expect(types).toEqual([
      "add-object",
      "choose-object",
      "modify-object",
      "unchoose-object",
    ]);
  });

  test("删除进 trash，撤销删除移回活动目录", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    await createStaticStroke(api, "s1");
    await api.deleteObjects(["s1"]);
    await journaler.flush();
    expect(await store.readAllObjects()).toHaveLength(0);
    const trashEntries = await store.readAllTrash();
    expect(trashEntries.map((e) => e.data.id)).toEqual(["s1"]);
    expect(trashEntries[0].chunks[0].below).toBeDefined();

    api.undo();
    await journaler.flush();
    expect((await store.readAllObjects()).map((o) => o.id)).toEqual(["s1"]);
    expect(await store.readAllTrash()).toHaveLength(0);
  });

  test("撤销新增从盘上移除对象文件", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    await createStaticStroke(api, "s1");
    await journaler.flush();
    expect(await store.readAllObjects()).toHaveLength(1);

    api.undo();
    await journaler.flush();
    expect(await store.readAllObjects()).toHaveLength(0);
    expect(await store.readAllTrash()).toHaveLength(0);
  });

  test("远端记录经 applyRemoteOperations 同样落段", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    await createStaticStroke(api, "s1");
    await journaler.flush();
    await api.applyRemoteOperations([
      createAddObjectOperation({
        id: "b/op-1",
        source: "b",
        time: Date.now() + 1000,
        parentId: null,
        chunkId: "1",
        objectId: "remote/1",
        data: {
          id: "remote/1",
          type: "StrokeObject",
          position: { x: 0, y: 0 },
          property: { width: 2 },
          data: { points: [{ x: 0, y: 0 }] },
          transform: { a: 1, b: 0, c: 0, d: 1 },
        },
        layerStackSnapshot: ["s1", "remote/1"],
      }),
    ]);
    await journaler.flush();

    const records = await readRecords(store);
    expect(records.map((r) => r.id)).toEqual(["core/op-1", "b/op-1"]);
    expect((await store.readAllObjects()).map((o) => o.id).sort()).toEqual([
      "remote/1",
      "s1",
    ]);
  });

  test("指纹种子避免打开既有板后的首 flush 重写", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();
    await createStaticStroke(api, "s1");
    await journaler.detach();

    // 模拟重新打开：以盘上内容为种子挂接新跟随者
    let writeCount = 0;
    const countingStore = Object.create(store);
    countingStore.writeObject = async (data) => {
      writeCount++;
      return store.writeObject(data);
    };
    const journaler2 = createJournaler({
      boardCore,
      store: countingStore,
    });
    journaler2.attach({
      nextSegmentSeq: 1,
      lastTime: 0,
      knownObjects: await store.readAllObjects(),
      knownTrash: [],
    });
    await journaler2.flush();
    expect(writeCount).toBe(0);
  });

  test("trash 种子：重开后撤销删除，trash 文件随对象复活移除", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();
    await createStaticStroke(api, "s1");
    await api.deleteObjects(["s1"]);
    await journaler.detach();

    // 模拟重新打开：对象在 trash 中；以盘上内容为种子挂接新跟随者
    const boardCore2 = new BoardCore({
      width: 800,
      height: 600,
      aomRenderHooks: createDefaultAomRenderHooks(),
      persistenceAdapter: createDefaultPersistenceAdapter(),
      hitRecords: await readRecords(store),
    });
    const session2 = {
      chunkMetadataList: await store.readAllChunkMetadata(),
      objects: await store.readAllObjects(),
      trash: await store.readAllTrash(),
    };
    boardCore2.restoreSession(session2);
    const api2 = new BoardApi(boardCore2);
    const journaler2 = createJournaler({ boardCore: boardCore2, store });
    journaler2.attach({
      nextSegmentSeq: 10,
      lastTime: 0,
      knownObjects: session2.objects,
      knownTrash: session2.trash,
    });

    // 撤销删除：对象复活回活动区
    const result = api2.undo();
    expect(result.undone).toBe(true);
    expect(boardCore2.getAllObjects().map((o) => o.id)).toEqual(["s1"]);
    await journaler2.flush();

    expect((await store.readAllObjects()).map((o) => o.id)).toEqual(["s1"]);
    expect(await store.readAllTrash()).toEqual([]);
  });

  test("超分子物化后一段含全部成员", async () => {
    const { boardCore, api, store } = setup();
    await store.create();
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    api.beginSupra("s");
    api.createObject("StrokeObject", {
      id: "s1",
      position: { x: 0, y: 0 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }] },
    });
    await api.commitObjects(["s1"], { supraKey: "s" });
    api.createObject("StrokeObject", {
      id: "s2",
      position: { x: 5, y: 5 },
      property: { width: 2 },
      data: { points: [{ x: 1, y: 1 }] },
    });
    await api.commitObjects(["s2"], { supraKey: "s" });
    api.endSupra("s");
    await journaler.flush();

    const records = await readRecords(store);
    expect(records).toHaveLength(2);
    expect(records[0].supraOpId).toBe(records[0].id);
    expect(records[1].supraOpId).toBe(records[0].id);
    expect((await store.readAllObjects()).map((o) => o.id).sort()).toEqual([
      "s1",
      "s2",
    ]);
  });
});
