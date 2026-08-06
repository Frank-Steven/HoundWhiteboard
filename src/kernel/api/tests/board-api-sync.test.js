// SPDX-License-Identifier: MIT

import { BoardApi } from "../board-api.js";
import { BoardCore } from "../../board/board-core.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../board/persistence-adapter.js";
import {
  createAddObjectOperation,
  createUndoOperation,
  createRedoOperation,
  makeOperationId,
} from "../../hit/operation.js";

/**
 * 双端同步回归：完全按 docs/undo-tree-kernel-example.md 各端的到达顺序互喂记录，
 * 验证「插入与重放的边界」分流与全量重建兜底下两端收敛到同一棵树、同一 HEAD、同一状态。
 * 节点 id 形如 "a/op-1"（a/b/c 对应情景中的 A/B/C）。
 */

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
 * 增加对象记录
 * @param {string} source - author 标识
 * @param {number} n - 操作序号
 * @param {number} time - 毫秒时间标记
 * @param {?string} parentId - 父节点 id（创建时的本地视角）
 * @returns {import("../../hit/operation.js").OperationRecord} 分子操作记录
 */
const add = (source, n, time, parentId = null) =>
  createAddObjectOperation({
    id: makeOperationId(source, n),
    source,
    time,
    parentId,
    chunkId: "1",
    objectId: `${source}${n}`,
    data: {
      type: "StrokeObject",
      id: `${source}${n}`,
      position: { x: 0, y: 0 },
      transform: { a: 1, b: 0, c: 0, d: 1 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    },
    layerStackSnapshot: [],
  });

/**
 * 撤销记录
 * @param {string} source - author 标识
 * @param {number} n - 操作序号
 * @param {number} time - 毫秒时间标记
 * @param {string} targetId - 目标节点 id
 * @param {string} previousHeadId - 撤销前的 HEAD 位置
 * @returns {import("../../hit/operation.js").OperationRecord} 撤销操作记录
 */
const undo = (source, n, time, targetId, previousHeadId) =>
  createUndoOperation({
    id: makeOperationId(source, n),
    source,
    time,
    targetNodeId: targetId,
    previousHeadId,
  });

/**
 * 重做记录
 * @param {string} source - author 标识
 * @param {number} n - 操作序号
 * @param {number} time - 毫秒时间标记
 * @param {?string} parentId - 记录时刻本地视角的父节点 id
 * @returns {import("../../hit/operation.js").OperationRecord} 重做操作记录
 */
const redo = (source, n, time, parentId) =>
  createRedoOperation({
    id: makeOperationId(source, n),
    source,
    time,
    parentId,
  });

/**
 * 按到达顺序逐条喂入一端
 * @param {BoardApi} api - BoardApi 实例
 * @param {import("../../hit/operation.js").OperationRecord[]} records - 记录序列
 * @returns {void}
 */
const feed = (api, records) => {
  for (const record of records) {
    api.applyRemoteOperations([record]);
  }
};

/**
 * 树结构签名（含分支与共享节点的全部出现位置）
 * @param {import("../../hit/undo-tree-core.js").UndoTree} tree - 树
 * @returns {string} 结构签名
 */
const signatureOf = (tree) => {
  const walk = (node) => `${node.shareId ?? "root"}[${node.children.map(walk).join(",")}]`;
  return walk(tree.root);
};

/**
 * 活动链的节点 id 序列
 * @param {import("../../hit/undo-tree-core.js").UndoTree} tree - 树
 * @returns {string[]} 节点 id 序列
 */
const chainOf = (tree) => tree.getActiveChain().map((node) => node.shareId);

/**
 * 断言多端收敛：同一结构签名、同一 HEAD、同一对象状态集
 * @param {Array<{ boardCore: BoardCore }>} ends - 端集合
 * @param {string[]} expectedChain - 期望的活动链 id 序列
 * @param {string[]} expectedObjects - 期望在场对象 id 集合
 * @returns {void}
 */
const expectConverged = (ends, expectedChain, expectedObjects) => {
  const signatures = ends.map((end) => signatureOf(end.boardCore.undoTree));
  for (const signature of signatures) {
    expect(signature).toBe(signatures[0]);
  }
  for (const end of ends) {
    expect(chainOf(end.boardCore.undoTree)).toEqual(expectedChain);
    expect([...end.boardCore.objectLoaded.keys()].sort()).toEqual([...expectedObjects].sort());
  }
};

describe("情景四：全程离线，最后一次性完全同步", () => {
  // A1(a/op-1,t0) B1(b/op-1,t1) A2(a/op-2,t2) B2(b/op-2,t3) U(a/op-3,t4 撤销 A2) B3(b/op-3,t5)
  const records = () => ({
    a1: add("a", 1, 0, null),
    b1: add("b", 1, 1, null),
    a2: add("a", 2, 2, "a/op-1"),
    b2: add("b", 2, 3, "b/op-1"),
    u: undo("a", 3, 4, "a/op-2", "a/op-2"),
    b3: add("b", 3, 5, "b/op-2"),
  });

  test("A 端增量视角：本地 A1、A2、U，后收 B1、B2、B3（B1/B2 落在 U 前，触发重建）", () => {
    const r = records();
    const endA = createEnd("a");
    const endB = createEnd("b");
    feed(endA.api, [r.a1, r.a2, r.u, r.b1, r.b2, r.b3]);
    feed(endB.api, [r.b1, r.b2, r.b3, r.a1, r.a2, r.u]);
    expectConverged(
      [endA, endB],
      ["a/op-1", "b/op-1", "b/op-2", "b/op-3"],
      ["a1", "b1", "b2", "b3"],
    );
    // U 重估为一般形态：A2 携原位置 B2 留在旧分支
    expect(endA.boardCore.undoTree.isOnActiveChain("a/op-2")).toBe(false);
  });

  test("B 端增量视角：本地 B1、B2、B3，后收 A1、A2、U（U 纯应用）", () => {
    const r = records();
    const endA = createEnd("a");
    const endB = createEnd("b");
    feed(endB.api, [r.b1, r.b2, r.b3, r.a1, r.a2, r.u]);
    feed(endA.api, [r.a1, r.a2, r.u, r.b1, r.b2, r.b3]);
    expectConverged(
      [endA, endB],
      ["a/op-1", "b/op-1", "b/op-2", "b/op-3"],
      ["a1", "b1", "b2", "b3"],
    );
  });
});

describe("情景五：撤销与迟到的改挂范围内节点", () => {
  // A1 B1 A2 B2 X(b/op-3,t4) O1(a/op-3,t5 撤销 A2)
  const records = () => ({
    a1: add("a", 1, 0, null),
    b1: add("b", 1, 1, "a/op-1"),
    a2: add("a", 2, 2, "b/op-1"),
    b2: add("b", 2, 3, "a/op-2"),
    x: add("b", 3, 4, "b/op-2"),
    o1: undo("a", 3, 5, "a/op-2", "b/op-2"),
  });

  test("A 端：O1 先应用，X 迟到落入改挂范围（触发重建，X 同时进入原位置与撤消分支）", () => {
    const r = records();
    const endA = createEnd("a");
    const endB = createEnd("b");
    feed(endA.api, [r.a1, r.b1, r.a2, r.b2, r.o1, r.x]);
    feed(endB.api, [r.a1, r.b1, r.a2, r.b2, r.x, r.o1]);
    expectConverged(
      [endA, endB],
      ["a/op-1", "b/op-1", "b/op-2", "b/op-3"],
      ["a1", "b1", "b2", "b3"],
    );
    // 原位置：A2 → B2 → X 完整保留（截断以撤销时间为准，与到达时刻无关）
    const a2Node = endA.boardCore.undoTree.findNode("a/op-2");
    expect(a2Node.children.map((n) => n.shareId)).toEqual(["b/op-2"]);
    expect(a2Node.children[0].children.map((n) => n.shareId)).toEqual(["b/op-3"]);
  });
});

describe("情景八：三方撤销、重做与新增赛跑", () => {
  // A1 B1 C1 | O1(a/op-2,t3 撤 C1) O2(a/op-3,t4 重做) O3(b/op-2,t5 撤 C1) O4(c/op-2,t6 新增 C2 父 C1)
  const records = () => ({
    a1: add("a", 1, 0, null),
    b1: add("b", 1, 1, "a/op-1"),
    c1: add("c", 1, 2, "b/op-1"),
    o1: undo("a", 2, 3, "c/op-1", "c/op-1"),
    o2: redo("a", 3, 4, "b/op-1"),
    o3: undo("b", 2, 5, "c/op-1", "c/op-1"),
    o4: add("c", 2, 6, "c/op-1"),
  });

  test("A 端全程纯应用 / B 端 O1 落在 O3 前触发重建 / C 端 O2 落在 O4 前触发重建", () => {
    const r = records();
    const endA = createEnd("a");
    const endB = createEnd("b");
    const endC = createEnd("c");
    feed(endA.api, [r.a1, r.b1, r.c1, r.o1, r.o2, r.o3, r.o4]);
    feed(endB.api, [r.a1, r.b1, r.c1, r.o3, r.o1, r.o2, r.o4]);
    feed(endC.api, [r.a1, r.b1, r.c1, r.o4, r.o1, r.o2, r.o3]);
    // 撤 → 重做 → 再撤：B 的撤销是最后生效的意图；C2 的父不在活动链按时间插入
    expectConverged(
      [endA, endB, endC],
      ["a/op-1", "b/op-1", "c/op-2"],
      ["a1", "b1", "c2"],
    );
  });
});

describe("情景九：重做与并发新增", () => {
  // A1 B1 A2 | O1(a/op-3,t3 撤 A2) O2(b/op-2,t4 新增 B2 父 A2) O3(a/op-4,t5 重做)
  const records = () => ({
    a1: add("a", 1, 0, null),
    b1: add("b", 1, 1, "a/op-1"),
    a2: add("a", 2, 2, "b/op-1"),
    o1: undo("a", 3, 3, "a/op-2", "a/op-2"),
    o2: add("b", 2, 4, "a/op-2"),
    o3: redo("a", 4, 5, "b/op-1"),
  });

  test("A 端：本地重做先生效，O2 到达触发重建后重做被冲掉；B 端：纯应用殊途同归", () => {
    const r = records();
    const endA = createEnd("a");
    const endB = createEnd("b");
    feed(endA.api, [r.a1, r.b1, r.a2, r.o1, r.o3, r.o2]);
    feed(endB.api, [r.a1, r.b1, r.a2, r.o2, r.o1, r.o3]);
    expectConverged(
      [endA, endB],
      ["a/op-1", "b/op-1", "b/op-2"],
      ["a1", "b1", "b2"],
    );
    // 被冲掉的重做留在日志中
    expect(endA.boardCore.operationLog.get("a/op-4").type).toBe("redo");
    expect(endA.boardCore.undoTree.findNode("a/op-2").children).toEqual([]);
  });
});
