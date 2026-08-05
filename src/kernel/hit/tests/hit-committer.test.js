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

describe("发射管线", () => {
  test("记录公共属性：id 递增、时间注入、父节点为当前 HEAD", () => {
    const { log, tree, committer } = setup([100, 200]);
    const first = committer.commitAdd(addEffect("obj-1"));
    expect(first.id).toBe("alice/op-1");
    expect(first.source).toBe("alice");
    expect(first.time).toBe(100);
    expect(first.parentId).toBeNull();
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
    expect(committer.commitDelete({ chunkId: "1", objectId: "obj-1" }).type).toBe("delete-object");
    expect(committer.commitChoose({ chunkId: "1", objectId: "obj-2" }).type).toBe("choose-object");
    expect(committer.commitUnchoose({ chunkId: "1", objectId: "obj-3" }).type).toBe("unchoose-object");
  });

  test("记录应用到树：活动链与日志同序", () => {
    const { log, tree, committer } = setup([100, 200, 300]);
    committer.commitAdd(addEffect("obj-1"));
    committer.commitAdd(addEffect("obj-2"));
    committer.commitDelete({ chunkId: "1", objectId: "obj-1" });
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

describe("超分子（指定 key）", () => {
  test("指定 key 的成员缓冲为草稿（不入日志、未定稿），endSupra 时定稿：首分子自指为超分子 id", () => {
    const { log, committer } = setup([100, 200, 300]);
    committer.beginSupra("s");
    const draft = committer.commitModify({
      chunkId: "1",
      objectId: "obj-1",
      properties: ["data"],
      before: {},
      after: {},
      layerStackSnapshot: ["obj-1"],
      supraKey: "s",
    });
    expect(draft.id).toBeNull();
    expect(log.size).toBe(0);
    committer.commitAdd({ ...addEffect("obj-2"), supraKey: "s" });
    committer.commitDelete({ chunkId: "1", objectId: "obj-1", supraKey: "s" });
    committer.endSupra("s");
    // obj-1：modify+delete 简并为 delete；obj-2：add —— 简并后两条，组序保持首次出现顺序（delete 在前）
    expect(log.size).toBe(2);
    const [first, second] = log.toArray();
    expect(first.type).toBe("delete-object");
    expect(first.id).toBe("alice/op-1");
    expect(first.supraOpId).toBe("alice/op-1");
    expect(second.type).toBe("add-object");
    expect(second.supraOpId).toBe("alice/op-1");
    expect(first.time).toBeLessThanOrEqual(second.time);
  });

  test("未指定 key 的提交即时独立成录，不受开启中的超分子影响", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    const independent = committer.commitAdd(addEffect("obj-1"));
    expect(independent.supraOpId).toBeNull();
    expect(tree.head.shareId).toBe("alice/op-1");
    committer.commitAdd({ ...addEffect("obj-2"), supraKey: "s" });
    expect(log.size).toBe(1);
    committer.endSupra("s");
    expect(log.size).toBe(2);
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

  test("abortSupra 丢弃全部缓冲草稿，不产生记录与节点", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o1"), supraKey: "s" });
    committer.abortSupra("s");
    expect(committer.hasSupra("s")).toBe(false);
    expect(log.size).toBe(0);
    expect(tree.getActiveChain()).toHaveLength(0);
  });

  test("两个会话交错闭合不发生时间回拨（时间标记在物化时分配）", () => {
    const { log, committer } = setup([500, 100]);
    committer.beginSupra("right");
    committer.commitAdd({ ...addEffect("o1"), supraKey: "right" });
    committer.beginSupra("left");
    committer.commitAdd({ ...addEffect("o2"), supraKey: "left" });
    // 右手先闭合、左手后闭合；物理时间回拨（500 → 100）也由定稿时的钳制保证单调
    committer.endSupra("right");
    expect(() => committer.endSupra("left")).not.toThrow();
    const times = log.toArray().map((r) => r.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test("空超分子（含简并后为空的组）不成节点", () => {
    const { tree, committer } = setup();
    committer.beginSupra("s");
    committer.endSupra("s");
    expect(tree.getActiveChain()).toHaveLength(0);
    committer.beginSupra("t");
    committer.commitAdd({ ...addEffect("obj-1"), supraKey: "t" });
    committer.commitDelete({ chunkId: "1", objectId: "obj-1", supraKey: "t" });
    committer.endSupra("t");
    expect(tree.getActiveChain()).toHaveLength(0);
  });
});

describe("超分子闭合", () => {
  test("endSupra 时简并定稿、整体入日志并在树上凝聚为一个节点", () => {
    const { log, tree, committer } = setup([100, 200]);
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("obj-1"), supraKey: "s" });
    committer.commitAdd({ ...addEffect("obj-2"), supraKey: "s" });
    expect(log.size).toBe(0);
    expect(tree.head).toBe(tree.root);

    committer.endSupra("s");
    expect(log.size).toBe(2);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.shareId).toBe("alice/op-1");
  });
});

describe("超分子简并", () => {
  /** 修改效果摘要。 @param {string} objectId - 对象 id。 @param {Object} before - 前快照。 @param {Object} after - 后快照。 @param {string[]} [properties] - 涉及属性。 @returns {Object} 效果摘要。 */
  const modifyEffect = (objectId, before, after, properties = ["data"]) => ({
    chunkId: "1",
    objectId,
    properties,
    before,
    after,
    layerStackSnapshot: [objectId],
  });

  /** 选择/取消选择效果摘要。 @param {string} objectId - 对象 id。 @returns {Object} 效果摘要。 */
  const chooseEffect = (objectId) => ({ chunkId: "1", objectId });

  /** 日志记录的类型序列。 @param {OperationLog} log - 操作日志。 @returns {string[]} 类型序列。 */
  const types = (log) => log.toArray().map((r) => r.type);

  test("同对象 modify 链合一：首条 before + 末条 after + 属性并集", () => {
    const { log, committer } = setup();
    committer.beginSupra("s");
    committer.commitModify({ ...modifyEffect("o1", { v: 0 }, { v: 1 }, ["data"]), supraKey: "s" });
    committer.commitModify({ ...modifyEffect("o1", { v: 1 }, { v: 2 }, ["position"]), supraKey: "s" });
    committer.commitModify({ ...modifyEffect("o1", { v: 2 }, { v: 3 }, ["data"]), supraKey: "s" });
    committer.endSupra("s");
    expect(log.size).toBe(1);
    const record = log.toArray()[0];
    expect(record.payload.before).toEqual({ v: 0 });
    expect(record.payload.after).toEqual({ v: 3 });
    expect(record.properties).toEqual(["data", "position"]);
  });

  test("会话 key 汇聚：选择+修改+取消选择凝聚为一个节点（三帧拖拽简并）", () => {
    const { log, tree, committer } = setup();
    committer.beginSupra("session");
    committer.commitChoose({ ...chooseEffect("o1"), supraKey: "session" });
    for (let i = 1; i <= 3; i++) {
      committer.commitModify({ ...modifyEffect("o1", { x: i - 1 }, { x: i }), supraKey: "session" });
    }
    committer.commitUnchoose({ ...chooseEffect("o1"), supraKey: "session" });
    committer.endSupra("session");
    expect(types(log)).toEqual(["choose-object", "modify-object", "unchoose-object"]);
    const modify = log.toArray()[1];
    expect(modify.payload.before).toEqual({ x: 0 });
    expect(modify.payload.after).toEqual({ x: 3 });
    expect(tree.getActiveChain()).toHaveLength(1);
  });

  test("choose+unchoose 无净效果空转消除", () => {
    const { log, committer } = setup();
    committer.beginSupra("s");
    committer.commitChoose({ ...chooseEffect("o1"), supraKey: "s" });
    committer.commitUnchoose({ ...chooseEffect("o1"), supraKey: "s" });
    committer.endSupra("s");
    expect(log.size).toBe(0);
  });

  test("add 吸并后续 modify（数据取终态）", () => {
    const { log, committer } = setup();
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o1"), data: { type: "StrokeObject", v: 1 }, supraKey: "s" });
    committer.commitModify({ ...modifyEffect("o1", { type: "StrokeObject", v: 1 }, { type: "StrokeObject", v: 9 }), supraKey: "s" });
    committer.endSupra("s");
    expect(types(log)).toEqual(["add-object"]);
    expect(log.toArray()[0].payload.data).toEqual({ type: "StrokeObject", v: 9 });
  });

  test("modify+delete 简并为一条 delete", () => {
    const { log, committer } = setup();
    committer.beginSupra("s");
    committer.commitModify({ ...modifyEffect("o1", { v: 0 }, { v: 1 }), supraKey: "s" });
    committer.commitDelete({ chunkId: "1", objectId: "o1", supraKey: "s" });
    committer.endSupra("s");
    expect(types(log)).toEqual(["delete-object"]);
  });

  test("撤销与重做永不进入超分子（独立成录、即时上树）", () => {
    const { log, tree, committer } = setup();
    committer.commitAdd(addEffect("o1"));
    committer.beginSupra("s");
    committer.commitAdd({ ...addEffect("o2"), supraKey: "s" });
    committer.commitUndo({ targetNodeId: "alice/op-1" });
    expect(log.size).toBe(2);
    expect(tree.head.shareId).toBeNull();
    committer.endSupra("s");
  });
});
