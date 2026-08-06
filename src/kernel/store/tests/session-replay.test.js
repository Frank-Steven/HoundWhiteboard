/**
 * @file 会话录制回放一致性测试
 * @description 混合操作脚本（增改删、擦除分裂、撤销重做与截断）经落盘重开后，树、HEAD、对象、trash、层叠图与计数器逐项一致。
 * @module kernel/store/tests/session-replay.test
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
async function createStaticStroke(api, id, y) {
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
 * 混合操作脚本：覆盖增、改、擦除分裂、删、撤销、截断与 HEAD 回移
 * @param {BoardApi} api - 内核 API
 * @returns {Promise<void>}
 */
async function runScript(api) {
  await createStaticStroke(api, "demo/1", 100);
  await createStaticStroke(api, "demo/2", 200);
  await createStaticStroke(api, "demo/3", 300);

  await api.addActiveObjects(["demo/1"]);
  api.modifyObject("demo/1", { position: { x: 5, y: 0 } });
  await api.commitObjects(["demo/1"]);

  await api.eraseData({
    points: [new Vector(20, 195), new Vector(20, 205)],
    radius: 1,
    source: "test",
  });
  await api.deleteObjects(["demo/3"]);

  api.undo(); // 撤销删除，demo/3 回来
  api.undo(); // 撤销擦除，demo/2 恢复整笔

  await createStaticStroke(api, "demo/4", 400); // 新工作截断重做

  await api.addActiveObjects(["demo/3"]);
  api.modifyObject("demo/3", { position: { x: 7, y: 0 } });
  await api.commitObjects(["demo/3"]);

  api.undo(); // HEAD 回移一格（停在选择提交之前）
}

/**
 * 计算板状态摘要（树、HEAD、对象、trash、层叠图、计数器）
 * @param {BoardCore} boardCore - 白板核心
 * @returns {Object} 状态摘要
 */
function digestOf(boardCore) {
  return {
    chain: boardCore.undoTree.getActiveChain(),
    head: boardCore.undoTree.head.shareId,
    objects: Object.fromEntries(
      boardCore.getAllObjects().map((o) => [o.id, o.serialize()]),
    ),
    trash: [...boardCore.trash.keys()].sort(),
    chunks: [...boardCore.chunkLoaded.values()]
      .filter(({ chunk }) => chunk?.objectManager)
      .map(({ chunk }) => [
        chunk.id,
        chunk.objectManager.staticGraph.toArray(),
      ])
      .sort((a, b) => a[0] - b[0]),
    meta: boardCore.collectSessionMeta(),
  };
}

describe("会话录制回放一致性", () => {
  test("混合脚本落盘重开后状态摘要逐项一致", async () => {
    const driver = createMemoryDriver({ rootId: "mem" });
    const store = createSessionStore(bindRoot(driver, "mem"));
    await store.create();

    // 源端：执行脚本并落盘
    const a = createBoard();
    const apiA = new BoardApi(a);
    const journaler = createJournaler({
      boardCore: a,
      store,
      collectMeta: () => a.collectSessionMeta(),
    });
    journaler.attach();
    await runScript(apiA);
    await journaler.flush();
    await journaler.detach();

    // 重开端：从存储恢复
    const session = await store.loadAll();
    const b = createBoard({
      hitRecords: session.records,
      lastTime: session.meta?.lastTime ?? 0,
      coreIdCounters: session.meta?.coreIdCounters ?? {},
      objectIdCounters: session.meta?.objectIdCounters ?? {},
    });
    b.restoreSession(session);

    expect(digestOf(b)).toEqual(digestOf(a));
  });

  test("重开后 HEAD 位置保持，重做仍可用；继续操作 id 连续", async () => {
    const driver = createMemoryDriver({ rootId: "mem" });
    const store = createSessionStore(bindRoot(driver, "mem"));
    await store.create();

    const a = createBoard();
    const apiA = new BoardApi(a);
    const journaler = createJournaler({
      boardCore: a,
      store,
      collectMeta: () => a.collectSessionMeta(),
    });
    journaler.attach();
    await runScript(apiA);
    await journaler.flush();
    await journaler.detach();

    const session = await store.loadAll();
    const b = createBoard({
      hitRecords: session.records,
      lastTime: session.meta?.lastTime ?? 0,
      coreIdCounters: session.meta?.coreIdCounters ?? {},
      objectIdCounters: session.meta?.objectIdCounters ?? {},
    });
    b.restoreSession(session);
    const apiB = new BoardApi(b);

    // HEAD 停在撤销位：demo/3 处于提交前位置，重做把它移回提交位置
    expect(b.getObjectById("demo/3").position.x).toBe(0);
    apiB.redo();
    expect(b.getObjectById("demo/3").position.x).toBe(7);

    // 继续操作：记录 id 从既有日志续号（末尾记录序号等于日志长度，1 基连续）
    await createStaticStroke(apiB, "demo/5", 500);
    const tail = b.operationLog.toArray().at(-1);
    expect(tail.id).toBe(`core/op-${b.operationLog.size}`);
  });
});
