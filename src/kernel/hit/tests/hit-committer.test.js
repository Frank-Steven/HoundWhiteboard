// SPDX-License-Identifier: MIT
import { OperationLog } from "../operation-log.js";
import { UndoTree } from "../undo-tree-core.js";
import { HitCommitter } from "../hit-committer.js";

/**
 * 构造日志、树与提交器
 * @param {number[]} [times] - 依次注入的物理时间
 * @returns {{ log: OperationLog, tree: UndoTree, committer: HitCommitter }} 三件套
 */
const setup = (times = [1000]) => {
  const log = new OperationLog();
  const tree = new UndoTree(log);
  let tick = 0;
  const committer = new HitCommitter({
    source: "alice",
    log,
    tree,
    now: () => times[Math.min(tick++, times.length - 1)],
  });
  return { log, tree, committer };
};

/**
 * 增加对象效果摘要
 * @param {string} objectId - 对象 id
 * @returns {Object} 效果摘要
 */
const addEffect = (objectId) => ({
  chunkId: "1",
  objectId,
  data: { type: "StrokeObject" },
  layerStackSnapshot: [objectId],
});

/**
 * 修改效果摘要
 * @param {string} objectId - 对象 id
 * @param {Object} before - 前快照
 * @param {Object} after - 后快照
 * @param {string[]} [properties] - 涉及属性
 * @returns {Object} 效果摘要
 */
const modifyEffect = (objectId, before, after, properties = ["data"]) => ({
  chunkId: "1",
  objectId,
  properties,
  before,
  after,
  layerStackSnapshot: [objectId],
});

/**
 * 选择/取消选择效果摘要
 * @param {string} objectId - 对象 id
 * @returns {Object} 效果摘要
 */
const chooseEffect = (objectId) => ({ chunkId: "1", objectId });

/**
 * 日志记录的类型序列
 * @param {OperationLog} log - 操作日志
 * @returns {string[]} 类型序列
 */
const types = (log) => log.toArray().map((r) => r.type);

describe("发射管线", () => {
  test("记录公共属性：id 递增、时间注入、父节点为当前 HEAD", () => {
    const { log, tree, committer } = setup([100, 200]);
    const first = committer.commitAdd(addEffect("obj-1"));
    expect(first.id).toBe("alice/op-1");
    expect(first.source).toBe("alice");
    expect(first.time).toBe(100);
    expect(first.parentId).toBeNull();
    expect(first.molId).toBeNull();
    expect(first.supraId).toBeNull();
    expect(first.discard).toBe(false);
    const second = committer.commitAdd(addEffect("obj-2"));
    expect(second.id).toBe("alice/op-2");
    expect(second.time).toBe(200);
    expect(second.parentId).toBe("alice/op-1");
    expect(log.size).toBe(2);
    expect(tree.head.shareId).toBe("alice/op-2");
  });

  test("时间标记单调：物理时间回拨时钳制", () => {
    const { committer } = setup([100, 50]);
    committer.commitAdd(addEffect("obj-1"));
    const record = committer.commitAdd(addEffect("obj-2"));
    expect(record.time).toBe(100);
  });

  test("各分子类型的载荷透传", () => {
    const { committer } = setup();
    const modify = committer.commitModify({
      chunkId: "1",
      objectId: "obj-1",
      properties: ["position"],
      before: { x: 0 },
      after: { x: 1 },
      layerStackSnapshot: ["obj-1"],
    });
    expect(modify.type).toBe("modify-object");
    expect(modify.payload.before).toEqual({ x: 0 });
    expect(committer.commitDelete({ chunkId: "1", objectId: "obj-1", data: { id: "obj-1" }, chunks: [] }).type).toBe("delete-object");
    expect(committer.commitChoose({ chunkId: "1", objectId: "obj-2" }).type).toBe("choose-object");
    expect(committer.commitUnchoose({ chunkId: "1", objectId: "obj-3" }).type).toBe("unchoose-object");
  });

  test("记录应用到树：活动链与日志同序", () => {
    const { log, tree, committer } = setup([100, 200, 300]);
    committer.commitAdd(addEffect("obj-1"));
    committer.commitAdd(addEffect("obj-2"));
    committer.commitDelete({ chunkId: "1", objectId: "obj-1", data: { id: "obj-1" }, chunks: [] });
    expect(tree.getActiveChain().map((node) => node.shareId)).toEqual(
      log.toArray().map((record) => record.id),
    );
  });

  test("日志准入失败时抛出，日志与树保持不变", () => {
    const { log, tree, committer } = setup();
    expect(() => committer.commitAdd({ objectId: "obj-1", data: {}, layerStackSnapshot: [] })).toThrow(
      "add-object 载荷的 chunkId 必须是非空字符串",
    );
    expect(log.size).toBe(0);
    expect(tree.head).toBe(tree.root);
  });
});

describe("超分子（三级容器：成员即时物化）", () => {
  test("指定 key 的成员即时物化：入日志、上树并携带 supraId（不再是草稿）", () => {
    const { log, tree, committer } = setup([100, 200]);
    committer.beginSupra("s");
    const modify = committer.commitModify({
      ...modifyEffect("obj-1", {}, {}, ["data"]),
      supraKey: "s",
    });
    expect(modify.id).toBe("alice/op-1");
    expect(modify.supraId).toBe("alice/supra-1");
    expect(modify.supraOpId).toBeNull();
    expect(modify.time).toBe(100);
    expect(log.size).toBe(1);
    expect(tree.head.shareId).toBe("alice/op-1");
    committer.commitAdd({ ...addEffect("obj-2"), supraKey: "s" });
    expect(log.size).toBe(2);
    expect(tree.getActiveChain()).toHaveLength(2);
  });

  test("未指定 key 的提交即时独立成录，不受开启中的超分子影响", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    const independent = committer.commitAdd(addEffect("obj-1"));
    expect(independent.supraId).toBeNull();
    expect(independent.supraOpId).toBeNull();
    expect(tree.head.shareId).toBe("alice/op-1");
    committer.commitAdd({ ...addEffect("obj-2"), supraKey: "s" });
    expect(log.size).toBe(2);
    expect(log.getSupraIdMembers("alice/supra-1").map((r) => r.id)).toEqual(["alice/op-2"]);
    committer.endSupra("s");
    expect(tree.getActiveChain()).toHaveLength(2);
  });

  test("重复开启、闭合未开启、指定未开启的 key 均抛错", () => {
    const { committer } = setup();
    committer.beginSupra("s");
    expect(() => committer.beginSupra("s")).toThrow("已开启");
    expect(() => committer.endSupra("x")).toThrow("未开启");
    expect(() => committer.abortSupra("x")).toThrow("未开启");
    expect(() => committer.commitAdd({ ...addEffect("obj-1"), supraKey: "x" })).toThrow("未开启");
    expect(committer.hasSupra("s")).toBe(true);
    committer.endSupra("s");
    expect(committer.hasSupra("s")).toBe(false);
  });

  test("abortSupra 销毁句柄并返回 supraId：不动日志与树（成员撤销由 BoardApi 编排）", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o1"), supraKey: "s" });
    const supraId = committer.abortSupra("s");
    expect(supraId).toBe("alice/supra-1");
    expect(committer.hasSupra("s")).toBe(false);
    expect(log.size).toBe(1);
    expect(tree.getActiveChain()).toHaveLength(1);
  });

  test("分子/超分子序号从日志重放扫描续号", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o1"), supraKey: "s" });
    const molId = committer.allocateMolId();
    expect(molId).toBe("alice/mol-1");
    // 分子物化后 molId 入日志（未物化的 molId 无记录引用，复用无害）
    committer.commitModify({ ...modifyEffect("o1", { x: 0 }, { x: 1 }, ["position"]), molId, supraKey: "s" });
    committer.endSupra("s");
    // 模拟恢复：同一日志派生的新提交器续号不撞号
    const restored = new HitCommitter({
      source: "alice",
      log,
      tree,
      now: () => 1000,
    });
    expect(restored.allocateMolId()).toBe("alice/mol-2");
    restored.beginSupra("s2");
    expect(restored.getSupraId("s2")).toBe("alice/supra-2");
    restored.endSupra("s2");
  });
});

describe("超分子闭合（close-supra 折叠）", () => {
  test("endSupra 追加 close-supra 记录：活动链上连续成员段折叠为一个聚合节点", () => {
    const { log, tree, committer } = setup([100, 200, 300]);
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("obj-1"), supraKey: "s" });
    committer.commitAdd({ ...addEffect("obj-2"), supraKey: "s" });
    committer.endSupra("s");

    expect(types(log)).toEqual(["add-object", "add-object", "close-supra"]);
    const closeRecord = log.toArray()[2];
    expect(closeRecord.payload.supraId).toBe("alice/supra-1");
    // close-supra 自身不是超分子成员
    expect(closeRecord.supraId).toBeNull();
    expect(tree.getActiveChain()).toHaveLength(1);
    const aggregate = tree.head;
    expect(aggregate.shareId).toBe("alice/op-1");
    expect(aggregate.memberIds).toEqual(["alice/op-1", "alice/op-2"]);
    expect(aggregate.supraId).toBe("alice/supra-1");
  });

  test("单成员超分子不产生 close-supra 记录（折叠是恒等）", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("obj-1"), supraKey: "s" });
    committer.endSupra("s");
    expect(types(log)).toEqual(["add-object"]);
    expect(tree.getActiveChain()).toHaveLength(1);
  });

  test("空超分子不产生任何记录", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.endSupra("s");
    expect(log.size).toBe(0);
    expect(tree.getActiveChain()).toHaveLength(0);
  });

  test("成员即时物化时间单调：交错会话不回拨", () => {
    const { log, committer } = setup([500, 100]);
    committer.beginSupra("right");
    committer.commitAdd({ ...addEffect("o1"), supraKey: "right" });
    committer.beginSupra("left");
    committer.commitAdd({ ...addEffect("o2"), supraKey: "left" });
    committer.endSupra("right");
    expect(() => committer.endSupra("left")).not.toThrow();
    const times = log.toArray().map((r) => r.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test("撤销与重做永不进入超分子（独立成录、即时上树）", () => {
    const { log, tree, committer } = setup();
    committer.commitAdd(addEffect("o1"));
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o2"), supraKey: "s" });
    committer.commitUndo({ targetNodeId: "alice/op-1" });
    expect(types(log)).toEqual(["add-object", "add-object", "undo"]);
    expect(log.toArray()[2].supraId).toBeNull();
    // 撤掉链中段的 op-1：op-2 改挂到分叉点仍在活动链上
    expect(tree.head.shareId).toBe("alice/op-2");
    committer.endSupra("s");
  });
});

describe("超分子不再简并（分子级膨胀，成员保持独立记录）", () => {
  test("同对象 modify 链各自成录，闭合后折叠为一个聚合节点", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitModify({ ...modifyEffect("o1", { v: 0 }, { v: 1 }, ["data"]), supraKey: "s" });
    committer.commitModify({ ...modifyEffect("o1", { v: 1 }, { v: 2 }, ["position"]), supraKey: "s" });
    committer.commitModify({ ...modifyEffect("o1", { v: 2 }, { v: 3 }, ["data"]), supraKey: "s" });
    committer.endSupra("s");
    expect(types(log)).toEqual([
      "modify-object",
      "modify-object",
      "modify-object",
      "close-supra",
    ]);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.memberIds).toEqual(["alice/op-1", "alice/op-2", "alice/op-3"]);
  });

  test("choose+unchoose 空转保留：折叠为零效果聚合节点", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitChoose({ ...chooseEffect("o1"), supraKey: "s" });
    committer.commitUnchoose({ ...chooseEffect("o1"), supraKey: "s" });
    committer.endSupra("s");
    expect(types(log)).toEqual(["choose-object", "unchoose-object", "close-supra"]);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.memberIds).toEqual(["alice/op-1", "alice/op-2"]);
  });

  test("add+delete 不再相消：两条记录都入日志并折叠", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o1"), supraKey: "s" });
    committer.commitDelete({ chunkId: "1", objectId: "o1", data: { id: "o1" }, chunks: [], supraKey: "s" });
    committer.endSupra("s");
    expect(types(log)).toEqual(["add-object", "delete-object", "close-supra"]);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.memberIds).toEqual(["alice/op-1", "alice/op-2"]);
  });

  test("增量式分子记录携带 molId：同分子相邻记录归并为一个分子节点", () => {
    const { log, tree, committer } = setup();
    const molId = committer.allocateMolId();
    committer.commitModify({ ...modifyEffect("o1", { x: 0 }, { x: 1 }, ["position"]), molId });
    committer.commitModify({ ...modifyEffect("o2", { x: 0 }, { x: 2 }, ["position"]), molId });
    expect(types(log)).toEqual(["modify-object", "modify-object"]);
    // 多对象手势 = 一个 molId 覆盖多条记录，树归并为一个分子节点
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.molId).toBe("alice/mol-1");
    expect(tree.head.memberIds).toEqual(["alice/op-1", "alice/op-2"]);
  });
});
