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
  test("首分子自指为超分子 id，后续分子关联同一句柄", () => {
    const { committer } = setup([100, 200, 300]);
    const supra = committer.beginSupra();
    const first = committer.commitModify({
      chunkId: "1",
      objectId: "obj-1",
      properties: ["data"],
      before: {},
      after: {},
      layerStackSnapshot: ["obj-1"],
      supra,
    });
    const second = committer.commitAdd({ ...addEffect("obj-2"), supra });
    const third = committer.commitDelete({ chunkId: "1", objectId: "obj-1", supra });
    expect(first.supraOpId).toBe("alice/op-1");
    expect(second.supraOpId).toBe("alice/op-1");
    expect(third.supraOpId).toBe("alice/op-1");
    expect(supra.id).toBe("alice/op-1");
  });

  test("句柄外的记录不关联超分子", () => {
    const { committer } = setup();
    const record = committer.commitAdd(addEffect("obj-1"));
    expect(record.supraOpId).toBeNull();
  });
});

describe("超分子闭合", () => {
  test("成员只入日志，endSupra 时在树上凝聚为一个节点", () => {
    const { log, tree, committer } = setup([100, 200]);
    const supra = committer.beginSupra();
    committer.commitAdd({ ...addEffect("obj-1"), supra });
    committer.commitAdd({ ...addEffect("obj-2"), supra });
    expect(log.size).toBe(2);
    expect(tree.head).toBe(tree.root);

    committer.endSupra(supra);
    expect(tree.getActiveChain()).toHaveLength(1);
    expect(tree.head.shareId).toBe("alice/op-1");
  });

  test("空超分子不成节点；重复闭合幂等", () => {
    const { tree, committer } = setup();
    const supra = committer.beginSupra();
    committer.endSupra(supra);
    expect(tree.getActiveChain()).toHaveLength(0);
    committer.commitAdd({ ...addEffect("obj-1"), supra });
    committer.endSupra(supra);
    committer.endSupra(supra);
    expect(tree.getActiveChain()).toHaveLength(1);
  });
});
