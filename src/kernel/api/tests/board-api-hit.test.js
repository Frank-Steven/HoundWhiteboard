// SPDX-License-Identifier: MIT

import { BoardApi } from "../board-api.js";
import { BoardCore } from "../../board/board-core.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../../host/bridges/persistence-adapter.js";
import { Vector } from "../../utils/math.js";

function createBoardCore() {
  return new BoardCore({
    width: 800,
    height: 600,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
}

function horizontalPoints() {
  return [
    { x: 0, y: 100 },
    { x: 10, y: 100 },
    { x: 20, y: 100 },
    { x: 30, y: 100 },
    { x: 40, y: 100 },
  ];
}

async function createStaticStroke(api, id, points = horizontalPoints()) {
  api.createObject("StrokeObject", {
    id,
    position: { x: 0, y: 0 },
    property: { width: 2 },
    data: { points },
  });
  await api.commitObjects([id]);
}

/**
 * 日志记录的类型序列
 * @param {BoardCore} boardCore - 白板核心
 * @returns {string[]} 类型序列
 */
const recordTypes = (boardCore) => boardCore.operationLog.toArray().map((r) => r.type);

describe("活动对象准入", () => {
  test("静态对象不可更改", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    expect(() => api.modifyObject("s1", { position: { x: 1, y: 1 } })).toThrow(
      "对象 s1 不是活动对象：更改前须先选择（进入动态图）",
    );
    expect(() => api.modifyObjects([{ objectId: "s1", patch: { position: { x: 1, y: 1 } } }])).toThrow(
      "不是活动对象",
    );
    expect(() => api.appendListItem("s1", "points", [{ x: 50, y: 100 }])).toThrow(
      "不是活动对象",
    );
    expect(() => api.replaceListItem("s1", "points", 0, { x: 0, y: 0 })).toThrow(
      "不是活动对象",
    );
    expect(() => api.removeListItem("s1", "points", 0)).toThrow("不是活动对象");
  });

  test("选择后可更改，提交后恢复不可更改", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.addActiveObjects(["s1"]);
    expect(() => api.modifyObject("s1", { position: { x: 5, y: 5 } })).not.toThrow();
    await api.commitObjects(["s1"]);
    expect(() => api.modifyObject("s1", { position: { x: 9, y: 9 } })).toThrow(
      "不是活动对象",
    );
  });

  test("不存在的对象报 not found", () => {
    const api = new BoardApi(createBoardCore());
    expect(() => api.modifyObject("nope", { position: { x: 0, y: 0 } })).toThrow(
      "Object nope not found.",
    );
  });
});

describe("hit commit 边界", () => {
  test("对象创建在 commit 时凝聚为一个增加对象分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    const records = boardCore.operationLog.toArray();
    expect(records).toHaveLength(1);
    const [add] = records;
    expect(add.type).toBe("add-object");
    expect(add.payload.objectId).toBe("s1");
    expect(add.payload.chunkId).not.toBe("");
    expect(add.payload.data.type).toBe("StrokeObject");
    expect(add.payload.data.data.points).toHaveLength(5);
    expect(add.payload.layerStackSnapshot).toContain("s1");
    // 生于 AOM 的对象没有配对的选择/取消选择
    expect(recordTypes(boardCore)).toEqual(["add-object"]);
    // 树与日志一致：HEAD 即最新记录
    expect(boardCore.undoTree.head.shareId).toBe(add.id);
  });

  test("选择 → 修改 → 提交凝聚为选择、修改、取消选择三个分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.addActiveObjects(["s1"]);
    api.modifyObject("s1", { position: { x: 50, y: 50 } });
    await api.commitObjects(["s1"]);

    expect(recordTypes(boardCore)).toEqual([
      "add-object",
      "choose-object",
      "modify-object",
      "unchoose-object",
    ]);
    const [, , modify] = boardCore.operationLog.toArray();
    expect(modify.payload.before.position).toEqual({ x: 0, y: 0 });
    expect(modify.payload.after.position).toEqual({ x: 50, y: 50 });
    expect(modify.properties).toContain("position");
  });

  test("放弃更改只产生选择与取消选择，不产生修改", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.addActiveObjects(["s1"]);
    api.discardActiveObjects(["s1"]);

    expect(recordTypes(boardCore)).toEqual(["add-object", "choose-object", "unchoose-object"]);
  });

  test("重复选择不重复记录，前快照保留首次选择时刻", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.addActiveObjects(["s1"]);
    api.modifyObject("s1", { position: { x: 10, y: 10 } });
    await api.addActiveObjects(["s1"]);
    await api.commitObjects(["s1"]);

    expect(recordTypes(boardCore)).toEqual([
      "add-object",
      "choose-object",
      "modify-object",
      "unchoose-object",
    ]);
    const [, , modify] = boardCore.operationLog.toArray();
    expect(modify.payload.before.position).toEqual({ x: 0, y: 0 });
  });

  test("选择后未修改直接提交，只产生取消选择", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.addActiveObjects(["s1"]);
    await api.commitObjects(["s1"]);

    expect(recordTypes(boardCore)).toEqual(["add-object", "choose-object", "unchoose-object"]);
  });

  test("删除静态对象产生删除对象分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    api.deleteObjects(["s1"]);

    expect(recordTypes(boardCore)).toEqual(["add-object", "delete-object"]);
    const [, del] = boardCore.operationLog.toArray();
    expect(del.payload.objectId).toBe("s1");
    expect(del.payload.chunkId).not.toBe("");
  });

  test("重复提交同一对象是幂等空操作", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    const committed = await api.commitObjects(["s1"]);
    expect(committed).toEqual(["s1"]);
    expect(recordTypes(boardCore)).toEqual(["add-object"]);
  });

  test("选择提交后再次重复提交是幂等空操作", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    await api.addActiveObjects(["s1"]);
    api.modifyObject("s1", { position: { x: 10, y: 10 } });
    await api.commitObjects(["s1"]);

    const committed = await api.commitObjects(["s1"]);
    expect(committed).toEqual(["s1"]);
    expect(recordTypes(boardCore)).toEqual([
      "add-object",
      "choose-object",
      "modify-object",
      "unchoose-object",
    ]);
  });

  test("一笔擦短：修改分子携切割前后快照，且各记录同属一个超分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.eraseData({
      points: [new Vector(5, 95), new Vector(5, 105)],
      radius: 1,
      source: "test",
    });

    const records = boardCore.operationLog.toArray();
    expect(recordTypes(boardCore)).toEqual(["add-object", "modify-object"]);
    const [, modify] = records;
    expect(modify.payload.before.data.points).toHaveLength(5);
    expect(modify.payload.after.data.points).toHaveLength(4);
    expect(modify.supraOpId).toBe(modify.id);
  });

  test("一笔擦成两笔：修改与增加分子同属一个超分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.eraseData({
      points: [new Vector(15, 95), new Vector(15, 105), new Vector(25, 105), new Vector(25, 95)],
      radius: 1,
      source: "test",
    });

    const types = recordTypes(boardCore);
    expect(types[0]).toBe("add-object");
    expect(types.slice(1).sort()).toEqual(["add-object", "modify-object"]);
    const records = boardCore.operationLog.toArray();
    const supraIds = new Set(records.slice(1).map((r) => r.supraOpId));
    expect(supraIds.size).toBe(1);
    expect([...supraIds][0]).toBe(records[1].id);
  });

  test("整笔擦没：删除分子记录于超分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.eraseData({
      points: horizontalPoints().map((p) => new Vector(p.x, p.y)),
      radius: 10,
      source: "test",
    });

    const types = recordTypes(boardCore);
    expect(types[0]).toBe("add-object");
    expect(types.slice(1)).toEqual(["delete-object"]);
    const [, del] = boardCore.operationLog.toArray();
    expect(del.supraOpId).toBe(del.id);
  });

  test("活动链与日志同序，HEAD 指向最新记录", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    await createStaticStroke(api, "s2");
    api.deleteObjects(["s1"]);

    const log = boardCore.operationLog;
    const tree = boardCore.undoTree;
    expect(tree.getActiveChain().map((node) => node.shareId)).toEqual(
      log.toArray().map((record) => record.id),
    );
    expect(tree.head.shareId).toBe(log.toArray().at(-1).id);
  });
});
