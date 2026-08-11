// SPDX-License-Identifier: MIT

import { BoardApi } from "../board-api.js";
import { BoardCore } from "../../board/board-core.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../board/persistence-adapter.js";
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
  test("discard 放弃修改：用选择前快照还原实例，不产生 modify 分子", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    const before = api.queryObject("s1");
    expect(before.position).toEqual({ x: 0, y: 0 });

    await api.addActiveObjects(["s1"]);
    api.modifyObject("s1", { position: { x: 200, y: 200 } });
    api.discardActiveObjects(["s1"]);

    // 实例已还原到选择前状态，静态图不被修改污染
    expect(api.queryObject("s1").position).toEqual({ x: 0, y: 0 });
    const types = boardCore.operationLog
      .toArray()
      .map((record) => record.type);
    expect(types).not.toContain("modify-object");
    expect(types).toEqual(["add-object", "choose-object", "unchoose-object"]);
  });

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

  test("选择 → 修改 → 提交物化为选择、修改、取消选择分子与闭合记录", async () => {
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
      "close-supra",
    ]);
    const [, , modify] = boardCore.operationLog.toArray();
    expect(modify.payload.before.position).toEqual({ x: 0, y: 0 });
    expect(modify.payload.after.position).toEqual({ x: 50, y: 50 });
    expect(modify.properties).toContain("position");
    // modify+unchoose 同属内部匿名超分子，闭合折叠为一个聚合节点
    expect(modify.supraId).toMatch(/^core\/supra-\d+$/);
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(3);
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
      "close-supra",
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
      "close-supra",
    ]);
  });

  test("一笔擦短：修改分子携切割前后快照，且携带内部超分子 supraId", async () => {
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
    expect(modify.supraOpId).toBeNull();
    expect(modify.supraId).toMatch(/^core\/supra-\d+$/);
  });

  test("一笔擦成两笔：修改与增加分子同属一个超分子并折叠为一个节点", async () => {
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
    expect(types.slice(1).sort()).toEqual(["add-object", "close-supra", "modify-object"]);
    const records = boardCore.operationLog.toArray();
    const supraIds = new Set(records.slice(1, 3).map((r) => r.supraId));
    expect(supraIds.size).toBe(1);
    // 闭合折叠：擦除成员凝聚为一个聚合节点（一次撤销回退整次擦除）
    const chain = boardCore.undoTree.getActiveChain();
    expect(chain).toHaveLength(2);
    expect(chain[1].memberIds).toHaveLength(2);
  });

  test("整笔擦没：删除分子记录携带内部超分子 supraId", async () => {
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
    expect(del.supraOpId).toBeNull();
    expect(del.supraId).toMatch(/^core\/supra-\d+$/);
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

describe("撤销", () => {
  /** 静态状态图上存在该边。 @param {BoardCore} boardCore - 白板核心。 @param {string} from - 起点。 @param {string} to - 终点。 @returns {boolean} 是否存在。 */
  const hasStaticEdge = (boardCore, from, to) =>
    [...boardCore.chunkLoaded.values()].some(({ chunk }) =>
      chunk?.objectManager?.staticGraph?.hasEdge?.(from, to),
    );

  test("无可撤销时返回 undone false", () => {
    const api = new BoardApi(createBoardCore());
    expect(api.undo()).toEqual({ undone: false, targetNodeId: null, forcedEndMolIds: [] });
  });

  test("撤销增加对象：对象从白板移除，HEAD 回退", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    expect(api.undo()).toEqual({ undone: true, targetNodeId: "core/op-1", forcedEndMolIds: [] });
    expect(boardCore.getObjectById("s1")).toBeUndefined();
    expect(boardCore.undoTree.head).toBe(boardCore.undoTree.root);
    expect(boardCore.operationLog.toArray().at(-1).type).toBe("undo");
  });

  test("undo/redo 后请求静态渲染刷新受影响区块", async () => {
    const requestedChunks = [];
    const aomRenderHooks = createDefaultAomRenderHooks();
    aomRenderHooks.requestStaticRender = (chunks) => requestedChunks.push(...chunks);
    const boardCore = new BoardCore({
      width: 800,
      height: 600,
      aomRenderHooks,
      persistenceAdapter: createDefaultPersistenceAdapter(),
    });
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    requestedChunks.length = 0;
    api.undo();
    expect(requestedChunks.length).toBeGreaterThan(0);

    requestedChunks.length = 0;
    api.redo();
    expect(requestedChunks.length).toBeGreaterThan(0);
  });

  test("拖拽的完整撤销序列：修改与取消选择同属一个超分子节点", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    await api.addActiveObjects(["s1"]);
    api.modifyObject("s1", { position: { x: 50, y: 50 } });
    await api.commitObjects(["s1"]);
    const aom = boardCore.activeObjectManager;

    // 链：add、choose、（modify+unchoose）超分子节点
    api.undo();
    expect(aom.isActive("s1")).toBe(true);
    expect(boardCore.getObjectById("s1").position.x).toBe(0);
    api.undo();
    expect(aom.has("s1")).toBe(false);
    api.undo();
    expect(boardCore.getObjectById("s1")).toBeUndefined();
    expect(api.undo().undone).toBe(false);
  });

  test("指定同一会话 key：成员即时物化，闭合后折叠为一个聚合节点", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    api.beginSupra("session/1");
    await api.addActiveObjects(["s1"], { supraKey: "session/1" });
    // 三级容器模型：成员即时物化上链（不再是草稿），会话期间 choose 已在链上
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(2);
    api.modifyObject("s1", { position: { x: 50, y: 50 } });
    await api.commitObjects(["s1"], { supraKey: "session/1" });
    // modify 与 unchoose 即时物化，各自是链上独立节点
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(4);
    api.endSupra("session/1");

    // 闭合折叠：add、（choose+modify+unchoose）聚合节点——整次会话一步撤销
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(2);
    const head = boardCore.undoTree.head;
    expect(head.memberIds).toHaveLength(3);
    const members = head.memberIds.map((id) => boardCore.operationLog.get(id));
    expect(members.map((r) => r.type)).toEqual([
      "choose-object",
      "modify-object",
      "unchoose-object",
    ]);
    expect(members.every((r) => r.supraId === "core/supra-2")).toBe(true);
    api.undo();
    expect(boardCore.getObjectById("s1").position.x).toBe(0);
    expect(boardCore.activeObjectManager.has("s1")).toBe(false);
  });

  test("一次撤销回退整次擦除（超分子节点）", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    await api.eraseData({
      points: [
        new Vector(15, 95),
        new Vector(15, 105),
        new Vector(25, 105),
        new Vector(25, 95),
      ],
      radius: 1,
      source: "test",
    });
    expect(boardCore.operationLog.size).toBe(4);
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(2);
    const splitId = "test/core/1";
    expect(boardCore.getObjectById(splitId)).toBeDefined();

    api.undo();
    expect(boardCore.getObjectById(splitId)).toBeUndefined();
    expect(boardCore.getObjectById("s1").data.points).toHaveLength(5);
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(1);
  });

  test("一次拖拽折叠为一个节点：会话内逐帧修改各自物化，一次撤销回退整次拖拽", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");

    api.beginSupra("drag/1");
    // 三帧拖拽：每帧 选择 → 修改 → 提交
    for (let i = 1; i <= 3; i++) {
      await api.addActiveObjects(["s1"], { supraKey: "drag/1" });
      api.modifyObject("s1", { position: { x: i * 10, y: 100 } });
      await api.commitObjects(["s1"], { supraKey: "drag/1" });
    }
    api.endSupra("drag/1");

    // 三级容器模型不再简并：三帧各自物化为 choose+modify+unchoose，闭合时整体折叠为一个聚合节点
    expect(recordTypes(boardCore)).toEqual([
      "add-object",
      "choose-object", "modify-object", "unchoose-object",
      "choose-object", "modify-object", "unchoose-object",
      "choose-object", "modify-object", "unchoose-object",
      "close-supra",
    ]);
    expect(boardCore.undoTree.getActiveChain()).toHaveLength(2);
    expect(boardCore.undoTree.head.memberIds).toHaveLength(9);

    // 一次撤销回退整次拖拽
    expect(api.undo().undone).toBe(true);
    expect(boardCore.getObjectById("s1").position.x).toBe(0);
    expect(api.redo().redone).toBe(true);
    expect(boardCore.getObjectById("s1").position.x).toBe(30);
  });

  test("同一次选择的多个对象聚合为一个节点", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    await createStaticStroke(api, "s2", [{ x: 300, y: 300 }, { x: 320, y: 300 }]);

    await api.addActiveObjects(["s1", "s2"]);
    const chain = boardCore.undoTree.getActiveChain();
    expect(chain).toHaveLength(3);
    const chooseNode = chain[2];
    const members = chooseNode.memberIds.map((id) => boardCore.operationLog.get(id));
    expect(members.map((r) => r.type)).toEqual(["choose-object", "choose-object"]);
  });

  test("撤销删除对象：对象与层位边从回收站恢复", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    api.createObject("StrokeObject", {
      id: "s2",
      position: { x: 0, y: 0 },
      property: { width: 2 },
      data: { points: [{ x: 20, y: 90 }, { x: 20, y: 110 }] },
    });
    await api.commitObjects(["s2"]);
    api.deleteObjects(["s1"]);
    expect(boardCore.trash.has("s1")).toBe(true);

    api.undo();
    expect(boardCore.getObjectById("s1")).toBeDefined();
    expect(boardCore.trash.has("s1")).toBe(false);
    expect(hasStaticEdge(boardCore, "s1", "s2")).toBe(true);
  });

  test("撤销后再操作长成新分支，旧分支保留", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    api.undo();
    await createStaticStroke(api, "s2");

    const tree = boardCore.undoTree;
    expect(tree.getChildrenOf(tree.root)).toHaveLength(2);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(boardCore.getObjectById("s2")).toBeDefined();
    expect(boardCore.getObjectById("s1")).toBeUndefined();
  });
});

describe("重做", () => {
  test("创建撤销后重做：对象与数据恢复", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    api.undo();
    expect(boardCore.getObjectById("s1")).toBeUndefined();

    expect(api.redo().redone).toBe(true);
    expect(boardCore.getObjectById("s1")?.data.points).toHaveLength(5);
  });

  test("撤销后的新操作使重做无效", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    api.undo();
    await createStaticStroke(api, "s2", [{ x: 300, y: 300 }, { x: 320, y: 300 }]);

    expect(api.redo().redone).toBe(false);
    expect(boardCore.getObjectById("s1")).toBeUndefined();
    expect(boardCore.getObjectById("s2")).toBeDefined();
  });

  test("擦除撤销后重做：整组效果重新应用", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    await api.eraseData({
      points: [
        new Vector(15, 95),
        new Vector(15, 105),
        new Vector(25, 105),
        new Vector(25, 95),
      ],
      radius: 1,
      source: "test",
    });
    const splitId = "test/core/1";
    api.undo();
    expect(boardCore.getObjectById(splitId)).toBeUndefined();

    expect(api.redo().redone).toBe(true);
    expect(boardCore.getObjectById(splitId)).toBeDefined();
    expect(boardCore.getObjectById("s1").data.points).toHaveLength(2);
    expect(boardCore.getObjectById(splitId).data.points).toHaveLength(2);
  });

  test("无可重做时返回 redone false", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    await createStaticStroke(api, "s1");
    expect(api.redo()).toEqual({ redone: false, targetNodeId: null });
  });
});
