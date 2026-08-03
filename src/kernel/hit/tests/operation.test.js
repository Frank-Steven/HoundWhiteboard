// SPDX-License-Identifier: MIT
import {
  OPERATION_TYPES,
  OPERATION_EFFECT_KINDS,
  WHITEBOARD_OPERATION_TYPES,
  TREE_OPERATION_TYPES,
  getOperationEffectKind,
  makeOperationId,
  parseOperationId,
  compareTimeMarks,
  createAddObjectOperation,
  createModifyObjectOperation,
  createDeleteObjectOperation,
  createChooseObjectOperation,
  createUnchooseObjectOperation,
  createMoveHeadOperation,
  createUndoOperation,
  createRedoOperation,
  validateOperation,
} from "../operation.js";

/** 公共属性样例 */
const BASE_FIELDS = Object.freeze({
  id: "alice/op-3",
  source: "alice",
  time: 1730000000000,
  parentId: "alice/op-2",
});

describe("操作 id", () => {
  test("构造与解析往返一致", () => {
    const id = makeOperationId("alice", 12);
    expect(id).toBe("alice/op-12");
    expect(parseOperationId(id)).toEqual({ source: "alice", n: 12 });
  });

  test("source 含斜杠以外的字符也可解析", () => {
    expect(parseOperationId("user-7/op-0")).toEqual({ source: "user-7", n: 0 });
  });

  test("非法 id 解析为 null", () => {
    expect(parseOperationId("alice-op-1")).toBeNull();
    expect(parseOperationId("")).toBeNull();
    expect(parseOperationId(null)).toBeNull();
    expect(parseOperationId(42)).toBeNull();
  });
});

describe("时间标记比较（时钟环）", () => {
  const at = (time, source) => ({ ...BASE_FIELDS, time, source });

  test("毫秒数决定先后", () => {
    expect(compareTimeMarks(at(100, "bob"), at(200, "alice"))).toBeLessThan(0);
    expect(compareTimeMarks(at(200, "alice"), at(100, "bob"))).toBeGreaterThan(0);
  });

  test("同毫秒按 author 字典序", () => {
    expect(compareTimeMarks(at(100, "alice"), at(100, "bob"))).toBeLessThan(0);
    expect(compareTimeMarks(at(100, "bob"), at(100, "alice"))).toBeGreaterThan(0);
  });

  test("时间标记相同为 0", () => {
    expect(compareTimeMarks(at(100, "alice"), at(100, "alice"))).toBe(0);
  });
});

describe("操作类型分类", () => {
  test("对象级与树级覆盖全部八种类型", () => {
    expect(WHITEBOARD_OPERATION_TYPES).toHaveLength(5);
    expect(TREE_OPERATION_TYPES).toHaveLength(3);
    expect([...WHITEBOARD_OPERATION_TYPES, ...TREE_OPERATION_TYPES].sort()).toEqual(
      Object.values(OPERATION_TYPES).sort(),
    );
  });

  test("作用类别映射", () => {
    expect(getOperationEffectKind(OPERATION_TYPES.ADD_OBJECT)).toBe(OPERATION_EFFECT_KINDS.APPEND_NODE);
    expect(getOperationEffectKind(OPERATION_TYPES.MODIFY_OBJECT)).toBe(OPERATION_EFFECT_KINDS.APPEND_NODE);
    expect(getOperationEffectKind(OPERATION_TYPES.DELETE_OBJECT)).toBe(OPERATION_EFFECT_KINDS.APPEND_NODE);
    expect(getOperationEffectKind(OPERATION_TYPES.CHOOSE_OBJECT)).toBe(OPERATION_EFFECT_KINDS.APPEND_NODE);
    expect(getOperationEffectKind(OPERATION_TYPES.UNCHOOSE_OBJECT)).toBe(OPERATION_EFFECT_KINDS.APPEND_NODE);
    expect(getOperationEffectKind(OPERATION_TYPES.MOVE_HEAD)).toBe(OPERATION_EFFECT_KINDS.MOVE_HEAD);
    expect(getOperationEffectKind(OPERATION_TYPES.REDO)).toBe(OPERATION_EFFECT_KINDS.MOVE_HEAD);
    expect(getOperationEffectKind(OPERATION_TYPES.UNDO)).toBe(OPERATION_EFFECT_KINDS.REATTACH);
    expect(getOperationEffectKind("nope")).toBeNull();
  });
});

describe("分子操作记录构造", () => {
  test("公共属性落位与默认值", () => {
    const record = createRedoOperation({ id: "alice/op-3", source: "alice", time: 1 });
    expect(record.parentId).toBeNull();
    expect(record.supraOpId).toBeNull();
    expect(record.properties).toEqual([]);
    expect(record.payload).toEqual({});
    expect(record.type).toBe(OPERATION_TYPES.REDO);
  });

  test("增加对象：携带对象全量与层栈快照", () => {
    const record = createAddObjectOperation({
      ...BASE_FIELDS,
      chunkId: "chunk-1",
      objectId: "obj-1",
      data: { type: "stroke", points: [[0, 0], [1, 1]] },
      layerStackSnapshot: ["obj-0", "obj-1"],
    });
    expect(record.type).toBe(OPERATION_TYPES.ADD_OBJECT);
    expect(record.payload.chunkId).toBe("chunk-1");
    expect(record.payload.data).toEqual({ type: "stroke", points: [[0, 0], [1, 1]] });
    expect(record.payload.layerStackSnapshot).toEqual(["obj-0", "obj-1"]);
  });

  test("修改对象：携带前后快照与层栈快照", () => {
    const record = createModifyObjectOperation({
      ...BASE_FIELDS,
      properties: ["position"],
      chunkId: "chunk-1",
      objectId: "obj-1",
      before: { x: 0 },
      after: { x: 10 },
      layerStackSnapshot: ["obj-1"],
    });
    expect(record.type).toBe(OPERATION_TYPES.MODIFY_OBJECT);
    expect(record.properties).toEqual(["position"]);
    expect(record.payload.before).toEqual({ x: 0 });
    expect(record.payload.after).toEqual({ x: 10 });
  });

  test("删除/选择/取消选择：只携带定位信息", () => {
    const fields = { ...BASE_FIELDS, chunkId: "chunk-1", objectId: "obj-1" };
    for (const create of [createDeleteObjectOperation, createChooseObjectOperation, createUnchooseObjectOperation]) {
      const record = create(fields);
      expect(record.payload).toEqual({ chunkId: "chunk-1", objectId: "obj-1" });
    }
  });

  test("更改 HEAD：携带目标节点", () => {
    const record = createMoveHeadOperation({ ...BASE_FIELDS, targetNodeId: "alice/op-1" });
    expect(record.type).toBe(OPERATION_TYPES.MOVE_HEAD);
    expect(record.payload.targetNodeId).toBe("alice/op-1");
  });

  test("撤销：携带目标节点与撤销前 HEAD 位置", () => {
    const record = createUndoOperation({
      ...BASE_FIELDS,
      targetNodeId: "alice/op-2",
      previousHeadId: "alice/op-2",
    });
    expect(record.type).toBe(OPERATION_TYPES.UNDO);
    expect(record.payload.targetNodeId).toBe("alice/op-2");
    expect(record.payload.previousHeadId).toBe("alice/op-2");
  });

  test("超分子关联：supraOpId 落位", () => {
    const record = createDeleteObjectOperation({
      ...BASE_FIELDS,
      supraOpId: "alice/op-9",
      chunkId: "chunk-1",
      objectId: "obj-1",
    });
    expect(record.supraOpId).toBe("alice/op-9");
  });

  test("记录可 JSON 序列化往返", () => {
    const record = createModifyObjectOperation({
      ...BASE_FIELDS,
      properties: ["data.points"],
      chunkId: "chunk-1",
      objectId: "obj-1",
      before: { points: [[0, 0]] },
      after: { points: [[0, 0], [1, 1]] },
      layerStackSnapshot: ["obj-1"],
    });
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });
});

describe("validateOperation", () => {
  const validRecords = () => [
    createAddObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o", data: {}, layerStackSnapshot: ["o"] }),
    createModifyObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o", before: {}, after: {}, layerStackSnapshot: [] }),
    createDeleteObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o" }),
    createChooseObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o" }),
    createUnchooseObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o" }),
    createMoveHeadOperation({ ...BASE_FIELDS, targetNodeId: "alice/op-1" }),
    createUndoOperation({ ...BASE_FIELDS, targetNodeId: "alice/op-1", previousHeadId: "alice/op-1" }),
    createRedoOperation(BASE_FIELDS),
  ];

  test("八种分子记录均通过校验", () => {
    for (const record of validRecords()) {
      expect(validateOperation(record)).toEqual([]);
    }
  });

  test("非对象记录", () => {
    expect(validateOperation(null)).toHaveLength(1);
    expect(validateOperation("x")).toHaveLength(1);
  });

  test("id 与 source 不一致", () => {
    const record = createRedoOperation({ ...BASE_FIELDS, source: "bob" });
    expect(validateOperation(record)).toContain('id 的 source 段（alice）与 source（bob）不一致');
  });

  test("未知类型与非法时间", () => {
    const record = { ...createRedoOperation(BASE_FIELDS), type: "nope", time: NaN };
    const errors = validateOperation(record);
    expect(errors).toContain("未知操作类型：nope");
    expect(errors).toContain("time 必须是有限数值");
  });

  test("parentId 与 properties 非法", () => {
    const record = { ...createRedoOperation(BASE_FIELDS), parentId: "bad", properties: [1] };
    const errors = validateOperation(record);
    expect(errors).toContain("parentId 非法：bad");
    expect(errors).toContain("properties 必须是字符串数组");
  });

  test("增加对象缺 data 或层栈快照非法", () => {
    const missing = createAddObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o", layerStackSnapshot: [] });
    expect(validateOperation(missing)).toContain("add-object 载荷缺 data");
    const badStack = createAddObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o", data: {}, layerStackSnapshot: [1] });
    expect(validateOperation(badStack)).toContain("layerStackSnapshot 必须是字符串数组");
  });

  test("修改对象缺快照", () => {
    const record = createModifyObjectOperation({ ...BASE_FIELDS, chunkId: "c", objectId: "o", after: {}, layerStackSnapshot: [] });
    expect(validateOperation(record)).toContain("modify-object 载荷缺 before/after 快照");
  });

  test("树级操作缺目标节点", () => {
    const move = createMoveHeadOperation({ ...BASE_FIELDS });
    expect(validateOperation(move)).toContain("move-head 载荷的 targetNodeId 非法：undefined");
    const undo = createUndoOperation({ ...BASE_FIELDS, targetNodeId: "alice/op-1" });
    expect(validateOperation(undo)).toContain("undo 载荷的 previousHeadId 非法：undefined");
  });
});

describe("超分子结构校验", () => {
  test("增加节点类可携带 supraOpId", () => {
    const record = createAddObjectOperation({
      id: "alice/op-1",
      source: "alice",
      time: 1,
      supraOpId: "alice/op-1",
      chunkId: "c",
      objectId: "o",
      data: {},
      layerStackSnapshot: [],
    });
    expect(validateOperation(record)).toEqual([]);
  });

  test("树级操作不可属于超分子", () => {
    const record = createUndoOperation({
      id: "alice/op-1",
      source: "alice",
      time: 1,
      supraOpId: "alice/op-1",
      targetNodeId: "alice/op-0",
      previousHeadId: "alice/op-0",
    });
    expect(validateOperation(record)).toContain("仅增加节点类操作可属于超分子操作");
  });
});
