// SPDX-License-Identifier: MIT

/**
 * @file SubFrame 手势中间帧事件测试
 * @description 验证手势写入口发射 subframe 预览事件，回放路径不发射（防回环）。
 * @author Zhou Chenyu
 */

import { BoardApi } from "../board-api.js";
import { BoardCore } from "../../board/board-core.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../board/persistence-adapter.js";

/**
 * 创建一个端（独立的 BoardCore 与 BoardApi）
 * @param {string} source - 端标识
 * @returns {{ boardCore: BoardCore, api: BoardApi }} 端
 */
function createEnd(source) {
  const boardCore = new BoardCore({
    width: 800,
    height: 600,
    source,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
  return { boardCore, api: new BoardApi(boardCore) };
}

/**
 * 在本端创建并提交一笔静态笔画
 * @param {BoardApi} api - 内核 API
 * @param {string} id - 对象 id
 * @returns {Promise<void>}
 */
async function createStroke(api, id) {
  api.createObject("StrokeObject", {
    id,
    position: { x: 0, y: 0 },
    property: { width: 2 },
    data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  });
  await api.commitObjects([id]);
}

describe("SubFrame 中间帧事件", () => {
  test("createObject 发射创建上下文（类型与初始数据）", async () => {
    const { boardCore, api } = createEnd("a");

    /** @type {Object[]} */
    const frames = [];
    boardCore.activityEventBus.on("subframe", (op) => frames.push(op));

    api.createObject("StrokeObject", {
      id: "a/1",
      position: { x: 100, y: 100 },
      property: { width: 2, color: "#000" },
      data: { points: [{ x: 0, y: 0 }] },
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].objectId).toBe("a/1");
    expect(frames[0].create).toMatchObject({
      type: "StrokeObject",
      position: { x: 100, y: 100 },
      transform: { a: 1, b: 0, c: 0, d: 1 },
      property: { width: 2, color: "#000" },
      data: { points: [{ x: 0, y: 0 }] },
    });
    await api.commitObjects(["a/1"]);
  });

  test("手势写入口发射 subframe：modifyObject / appendListItem / replaceListItem", async () => {
    const { boardCore, api } = createEnd("a");
    await createStroke(api, "a/1");

    /** @type {Object[]} */
    const frames = [];
    boardCore.activityEventBus.on("subframe", (op) => frames.push(op));

    await api.addActiveObjects(["a/1"]);
    api.modifyObject("a/1", { position: { x: 5, y: 5 } });
    api.modifyObjects([
      { objectId: "a/1", patch: { position: { x: 7, y: 7 } } },
    ]);
    api.appendListItem("a/1", "data.points", [{ x: 20, y: 0 }]);
    api.replaceListItem("a/1", "data.points", 0, { x: -1, y: 0 });

    expect(frames).toHaveLength(4);
    expect(frames[0]).toEqual({
      objectId: "a/1",
      patch: { position: { x: 5, y: 5 } },
    });
    expect(frames[1].patch.position).toEqual({ x: 7, y: 7 });
    expect(frames[2]).toEqual({
      objectId: "a/1",
      append: { key: "data.points", items: [{ x: 20, y: 0 }] },
    });
    expect(frames[3]).toEqual({
      objectId: "a/1",
      replace: { key: "data.points", index: 0, item: { x: -1, y: 0 } },
    });
  });

  test("回放路径不发射 subframe（防回环）", async () => {
    const a = createEnd("a");
    const b = createEnd("b");

    await createStroke(a.api, "a/1");
    b.api.applyRemoteOperations(a.boardCore.operationLog.toJSON());

    /** @type {Object[]} */
    const frames = [];
    b.boardCore.activityEventBus.on("subframe", (op) => frames.push(op));

    // a 完成 choose→modify→commit，b 经日志回放应用 modify 效果
    await a.api.addActiveObjects(["a/1"]);
    a.api.modifyObject("a/1", { position: { x: 9, y: 9 } });
    await a.api.commitObjects(["a/1"]);
    b.api.applyRemoteOperations(a.boardCore.operationLog.toJSON().slice(1));

    expect(frames).toHaveLength(0);
    expect(b.boardCore.getObjectById("a/1").position.x).toBe(9);
  });
});
