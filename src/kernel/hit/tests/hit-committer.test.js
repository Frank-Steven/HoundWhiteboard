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
    expect(committer.commitUnchoose({ chunkId: "1", objectId: "obj-2" }).type).toBe("unchoose-object");
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

describe("超分子", () => {
  test("开启期间成员缓冲为草稿（不入日志、未定稿），endSupra 时定稿：首分子自指为超分子 id", () => {
    const { log, committer } = setup([100, 200, 300]);
    const supra = committer.beginSupra();
    const draft = committer.commitModify({
      chunkId: "1",
      objectId: "obj-1",
      properties: ["data"],
      before: {},
      after: {},
      layerStackSnapshot: ["obj-1"],
      supra,
    });
    expect(draft.id).toBeNull();
    expect(log.size).toBe(0);
    committer.commitAdd({ ...addEffect("obj-2"), supra });
    committer.commitDelete({ chunkId: "1", objectId: "obj-1", supra });
    committer.endSupra(supra);
    // obj-1：modify+delete 简并为 delete；obj-2：add —— 简并后两条，按时间定序（add 在前）
    expect(log.size).toBe(2);
    const [first, second] = log.toArray();
    expect(first.type).toBe("add-object");
    expect(first.id).toBe("alice/op-1");
    expect(first.supraOpId).toBe("alice/op-1");
    expect(second.type).toBe("delete-object");
    expect(second.supraOpId).toBe("alice/op-1");
    expect(supra.id).toBe("alice/op-1");
  });

  test("句柄外的记录不关联超分子", () => {
    const { committer } = setup();
    const record = committer.commitAdd(addEffect("obj-1"));
    expect(record.supraOpId).toBeNull();
  });

  test("同时至多开启一个；向已闭合句柄提交或重复闭合均抛错", () => {
    const { committer } = setup();
    const supra = committer.beginSupra();
    expect(() => committer.beginSupra()).toThrow("开启中的超分子");
    committer.endSupra(supra);
    expect(() => committer.commitAdd({ ...addEffect("obj-1"), supra })).toThrow("已闭合或未开启");
    expect(() => committer.endSupra(supra)).toThrow("开启者不一致");
  });
});

describe("超分子闭合", () => {
  test("endSupra 时简并定稿、整体入日志并在树上凝聚为一个节点", () => {
    const { log, tree, committer } = setup([100, 200]);
    const supra = committer.beginSupra();
    committer.commitAdd({ ...addEffect("obj-1"), supra });
    committer.commitAdd({ ...addEffect("obj-2"), supra });
    expect(log.size).toBe(0);
    expect(tree.head).toBe(tree.root);

    committer.endSupra(supra);
    expect(log.size).toBe(2);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.shareId).toBe("alice/op-1");
  });

  test("空超分子（含简并后为空的组）不成节点", () => {
    const { tree, committer } = setup();
    const supra = committer.beginSupra();
    committer.endSupra(supra);
    expect(tree.getActiveChain()).toHaveLength(0);
    // 简并后为空：add+delete 相消
    const second = committer.beginSupra();
    committer.commitAdd({ ...addEffect("obj-1"), supra: second });
    committer.commitDelete({ chunkId: "1", objectId: "obj-1", supra: second });
    committer.endSupra(second);
    expect(tree.getActiveChain()).toHaveLength(0);
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
    const supra = committer.beginSupra();
    committer.commitModify(modifyEffect("o1", { v: 0 }, { v: 1 }, ["data"]));
    committer.commitModify(modifyEffect("o1", { v: 1 }, { v: 2 }, ["position"]));
    committer.commitModify(modifyEffect("o1", { v: 2 }, { v: 3 }, ["data"]));
    committer.endSupra(supra);
    expect(log.size).toBe(1);
    const record = log.toArray()[0];
    expect(record.payload.before).toEqual({ v: 0 });
    expect(record.payload.after).toEqual({ v: 3 });
    expect(record.properties).toEqual(["data", "position"]);
  });

  test("choose+modify+unchoose 完整保留：三帧拖拽简并为三条记录、一个节点", () => {
    const { log, tree, committer } = setup();
    const supra = committer.beginSupra();
    for (let i = 1; i <= 3; i++) {
      committer.commitChoose(chooseEffect("o1"));
      committer.commitModify(modifyEffect("o1", { x: i - 1 }, { x: i }));
      committer.commitUnchoose(chooseEffect("o1"));
    }
    committer.endSupra(supra);
    expect(types(log)).toEqual(["choose-object", "modify-object", "unchoose-object"]);
    const modify = log.toArray()[1];
    expect(modify.payload.before).toEqual({ x: 0 });
    expect(modify.payload.after).toEqual({ x: 3 });
    expect(tree.getActiveChain()).toHaveLength(1);
  });

  test("choose+unchoose 无净效果空转消除", () => {
    const { log, committer } = setup();
    const supra = committer.beginSupra();
    committer.commitChoose(chooseEffect("o1"));
    committer.commitUnchoose(chooseEffect("o1"));
    committer.endSupra(supra);
    expect(log.size).toBe(0);
  });

  test("add 吸并后续 modify（数据取终态）", () => {
    const { log, committer } = setup();
    const supra = committer.beginSupra();
    committer.commitAdd({ ...addEffect("o1"), data: { type: "StrokeObject", v: 1 } });
    committer.commitModify(modifyEffect("o1", { type: "StrokeObject", v: 1 }, { type: "StrokeObject", v: 9 }));
    committer.endSupra(supra);
    expect(types(log)).toEqual(["add-object"]);
    expect(log.toArray()[0].payload.data).toEqual({ type: "StrokeObject", v: 9 });
  });

  test("modify+delete 简并为一条 delete", () => {
    const { log, committer } = setup();
    const supra = committer.beginSupra();
    committer.commitModify(modifyEffect("o1", { v: 0 }, { v: 1 }));
    committer.commitDelete({ chunkId: "1", objectId: "o1" });
    committer.endSupra(supra);
    expect(types(log)).toEqual(["delete-object"]);
  });

  test("撤销与重做不被开启中的超分子拦截（独立成录、即时上树）", () => {
    const { log, tree, committer } = setup();
    committer.commitAdd(addEffect("o1"));
    const supra = committer.beginSupra();
    committer.commitAdd({ ...addEffect("o2"), supra });
    committer.commitUndo({ targetNodeId: "alice/op-1" });
    expect(log.size).toBe(2);
    expect(tree.head.shareId).toBeNull();
    committer.endSupra(supra);
  });
});
