/**
 * @file 会话恢复测试
 * @description 验证打开既有板时树、对象、trash、层叠图、id 计数器与时间标记全部恢复，撤销历史穿越重开。
 * @module kernel/store/tests/session-restore.test
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { createMemoryDriver } from "../../../io/driver/memory.js";
import { bindRoot } from "../../../io/driver/io-driver.js";
import { BoardCore } from "../../board/board-core.js";
import { BoardApi } from "../../api/board-api.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../board/persistence-adapter.js";
import { Vector } from "../../utils/math.js";
import { createSessionStore } from "../session-store.js";
import { createJournaler } from "../journaler.js";

/**
 * 创建白板核心（可带会话恢复选项）
 * @param {Object} [options] - BoardCore 选项
 * @returns {BoardCore} 白板核心
 */
function createBoard(options = {}) {
  return new BoardCore({
    width: 800,
    height: 600,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
    ...options,
  });
}

/**
 * 创建并提交一笔横向静态笔画
 * @param {BoardApi} api - 内核 API
 * @param {string} id - 对象 id
 * @param {number} y - 笔画高度
 * @returns {Promise<void>}
 */
async function createStaticStroke(api, id, y = 100) {
  api.createObject("StrokeObject", {
    id,
    position: { x: 0, y: 0 },
    property: { width: 2 },
    data: {
      points: [
        { x: 0, y },
        { x: 10, y },
        { x: 20, y },
        { x: 30, y },
        { x: 40, y },
      ],
    },
  });
  await api.commitObjects([id]);
}

/**
 * 在一块板上制造含全部要素的会话：两笔、一次修改、一次删除、一次擦除分裂
 * @param {Object} store - 会话存储
 * @returns {Promise<{boardCore: BoardCore, api: BoardApi}>} 源端
 */
async function buildSession(store) {
  const boardCore = createBoard();
  const api = new BoardApi(boardCore);
  const journaler = createJournaler({
    boardCore,
    store,
    collectMeta: () => boardCore.collectSessionMeta(),
  });
  journaler.attach();

  await createStaticStroke(api, "demo/1", 100);
  await createStaticStroke(api, "demo/2", 200);
  await api.addActiveObjects(["demo/1"]);
  api.modifyObject("demo/1", { position: { x: 5, y: 0 } });
  await api.commitObjects(["demo/1"]);
  await api.deleteObjects(["demo/2"]);
  await api.eraseData({
    points: [new Vector(20, 95), new Vector(20, 105)],
    radius: 1,
    source: "test",
  });

  await journaler.flush();
  await journaler.detach();
  return { boardCore, api };
}

/**
 * 从存储打开既有板
 * @param {Object} store - 会话存储
 * @returns {Promise<{boardCore: BoardCore, api: BoardApi, session: Object}>} 重开端
 */
async function openSession(store) {
  const session = await store.loadAll();
  const boardCore = createBoard({
    hitRecords: session.records,
    lastTime: session.meta?.lastTime ?? 0,
    coreIdCounters: session.meta?.coreIdCounters ?? {},
    objectIdCounters: session.meta?.objectIdCounters ?? {},
  });
  boardCore.restoreSession(session);
  return { boardCore, api: new BoardApi(boardCore), session };
}

/**
 * 装配共享存储
 * @returns {Promise<Object>} 会话存储
 */
async function setup() {
  const driver = createMemoryDriver({ rootId: "mem" });
  const store = createSessionStore(bindRoot(driver, "mem"));
  await store.create();
  return store;
}

describe("会话恢复", () => {
  test("会话往返：树、对象、trash、层叠图全部恢复", async () => {
    const store = await setup();
    const { boardCore: a } = await buildSession(store);
    const { boardCore: b } = await openSession(store);

    // 树签名一致
    expect(b.undoTree.getActiveChain()).toEqual(a.undoTree.getActiveChain());
    // 对象一致
    const dump = (core) =>
      Object.fromEntries(core.getAllObjects().map((o) => [o.id, o.serialize()]));
    expect(dump(b)).toEqual(dump(a));
    // trash 一致
    expect([...b.trash.keys()].sort()).toEqual([...a.trash.keys()].sort());
    // 层叠图一致
    const graphs = (core) =>
      [...core.chunkLoaded.values()]
        .filter(({ chunk }) => chunk?.objectManager)
        .map(({ chunk }) => chunk.objectManager.staticGraph.toArray());
    expect(graphs(b)).toEqual(graphs(a));
  });

  test("跨会话撤销：重开后撤销删除，对象与层位恢复", async () => {
    const store = await setup();
    await buildSession(store);
    const { boardCore: b, api: apiB } = await openSession(store);

    expect(b.getObjectById("demo/2")).toBeUndefined();
    // HEAD 末位是擦除节点，先撤销擦除，再撤销删除
    apiB.undo();
    apiB.undo();
    const restored = b.getObjectById("demo/2");
    expect(restored).toBeDefined();
    expect(restored.data.points).toHaveLength(5);
    // 层位恢复：对象回到区块静态图
    const inGraph = [...b.chunkLoaded.values()].some(
      ({ chunk }) => chunk?.objectManager?.staticGraph?.hasNode("demo/2"),
    );
    expect(inGraph).toBe(true);
  });

  test("重开后分裂 id 续号不碰撞，新 commit 时间不回拨", async () => {
    const store = await setup();
    const { boardCore: a } = await buildSession(store);
    const { boardCore: b, api: apiB, session } = await openSession(store);

    // 源端分裂已占用 test/core/1
    const aIds = a.getAllObjects().map((o) => o.id);
    expect(aIds).toContain("test/core/1");
    expect(session.meta.coreIdCounters.test).toBe(1);

    // 重开端画一笔再擦：分裂续号为 test/core/2
    await createStaticStroke(apiB, "demo/3", 300);
    await apiB.eraseData({
      points: [new Vector(20, 295), new Vector(20, 305)],
      radius: 1,
      source: "test",
    });
    const bIds = b.getAllObjects().map((o) => o.id);
    expect(bIds).toContain("test/core/2");
    expect(b.collectSessionMeta().coreIdCounters.test).toBe(2);

    // 新 commit 时间不回拨
    const tail = b.operationLog.toArray().at(-1);
    expect(tail.time).toBeGreaterThanOrEqual(session.meta.lastTime);
  });

  test("UI 侧对象 id 计数器随元数据持久化与恢复", async () => {
    const store = await setup();
    const boardCore = createBoard();
    const journaler = createJournaler({
      boardCore,
      store,
      collectMeta: () => boardCore.collectSessionMeta(),
    });
    journaler.attach();

    // UI 侧上报：demo 来源已分配到 7
    expect(boardCore.reportObjectIdCounter("demo", 7)).toBe(true);
    // 回拨拒绝
    expect(boardCore.reportObjectIdCounter("demo", 5)).toBe(false);
    await journaler.flush();
    await journaler.detach();

    const session = await store.loadAll();
    expect(session.meta.objectIdCounters).toEqual({ demo: 7 });

    const b = createBoard({
      hitRecords: session.records,
      lastTime: session.meta?.lastTime ?? 0,
      coreIdCounters: session.meta?.coreIdCounters ?? {},
      objectIdCounters: session.meta?.objectIdCounters ?? {},
    });
    expect(b.getObjectIdCounters()).toEqual({ demo: 7 });
  });

  test("重开后撤销擦除：分裂段消失，原笔恢复", async () => {
    const store = await setup();
    await buildSession(store);
    const { boardCore: b, api: apiB } = await openSession(store);

    expect(b.getObjectById("test/core/1")).toBeDefined();
    apiB.undo();
    expect(b.getObjectById("test/core/1")).toBeUndefined();
    expect(b.getObjectById("demo/1").data.points).toHaveLength(5);
  });
});
