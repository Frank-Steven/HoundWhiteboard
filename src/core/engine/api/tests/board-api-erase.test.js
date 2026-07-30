import { BoardApi } from "../board-api.js";
import { BoardCore } from "../../orchestration/board-core.js";
import { createDefaultAomRenderHooks } from "../../orchestration/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../../bridges/persistence-adapter.js";
import { Matrix, Vector } from "../../utils/math.js";

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

function createStaticStroke(api, id, points = horizontalPoints(), property = {}) {
  api.createObject("StrokeObject", {
    id,
    position: { x: 0, y: 0 },
    property: { width: 2, ...property },
    data: { points },
  });
  api.commitObjects([id]);
}

describe("BoardApi.eraseData", () => {
  test("擦短一笔时回写剩余点段且对象 id 不变", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    createStaticStroke(api, "s1");

    const result = await api.eraseData({
      points: [new Vector(5, 95), new Vector(5, 105)],
      radius: 1,
      source: "test",
    });

    expect(result.modified).toEqual(["s1"]);
    expect(result.created).toEqual([]);
    expect(result.deleted).toEqual([]);

    const obj = boardCore.getObjectById("s1");
    expect(obj.data.points).toEqual([
      { x: 10, y: 100 },
      { x: 20, y: 100 },
      { x: 30, y: 100 },
      { x: 40, y: 100 },
    ]);
  });

  test("一笔擦成两笔时原对象保留首段，其余段以 Core 来源 id 分裂新建", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    createStaticStroke(api, "s1");

    const result = await api.eraseData({
      points: [new Vector(20, 95), new Vector(20, 105)],
      radius: 1,
      source: "test",
    });

    expect(result.modified).toEqual(["s1"]);
    expect(result.created).toEqual(["test/core/1"]);
    expect(result.deleted).toEqual([]);

    const original = boardCore.getObjectById("s1");
    expect(original.data.points).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 100 },
    ]);

    const split = boardCore.getObjectById("test/core/1");
    expect(split).toBeDefined();
    expect(split.data.points).toEqual([
      { x: 30, y: 100 },
      { x: 40, y: 100 },
    ]);
    expect(split.property.width).toBe(2);
    expect(boardCore.activeObjectManager.has("test/core/1")).toBe(false);
  });

  test("分裂对象继承原对象的 position 与 transform", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);

    api.createObject("StrokeObject", {
      id: "s1",
      position: { x: 200, y: 200 },
      transform: { a: 2, b: 0, c: 0, d: 2 },
      property: { width: 1 },
      data: { points: horizontalPoints().map((p) => ({ x: p.x, y: 0 })) },
    });
    api.commitObjects(["s1"]);

    // 世界坐标下笔画位于 (200,200)-(280,200)，轨迹在世界 x=240 处穿越
    const result = await api.eraseData({
      points: [new Vector(240, 195), new Vector(240, 205)],
      radius: 1,
      source: "test",
    });

    expect(result.created).toEqual(["test/core/1"]);

    const split = boardCore.getObjectById("test/core/1");
    expect(split.position).toEqual(new Vector(200, 200));
    expect(split.transform).toEqual(new Matrix(2, 0, 0, 2));
    expect(split.data.points).toEqual([
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ]);
  });

  test("整笔擦没时对象被删除", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    createStaticStroke(api, "s1");

    const result = await api.eraseData({
      points: [new Vector(-5, 100), new Vector(45, 100)],
      radius: 1,
      source: "test",
    });

    expect(result.deleted).toEqual(["s1"]);
    expect(boardCore.getObjectById("s1")).toBeUndefined();
  });

  test("isErasable 为 false 的对象不受影响", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);

    api.createObject("CircleObject", {
      id: "c1",
      position: { x: 20, y: 100 },
      property: { fill: "#f00" },
      data: { radius: 10 },
    });
    api.commitObjects(["c1"]);

    const result = await api.eraseData({
      points: [new Vector(20, 95), new Vector(20, 105)],
      radius: 2,
      source: "test",
    });

    expect(result).toEqual({ modified: [], created: [], deleted: [] });
    expect(boardCore.getObjectById("c1").data.radius).toBe(10);
  });

  test("多次增量调用逐段蚕食同一笔画", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    createStaticStroke(api, "s1");

    await api.eraseData({
      points: [new Vector(5, 95), new Vector(5, 105)],
      radius: 1,
      source: "test",
    });
    const second = await api.eraseData({
      points: [new Vector(35, 95), new Vector(35, 105)],
      radius: 1,
      source: "test",
    });

    expect(second.modified).toEqual(["s1"]);
    const obj = boardCore.getObjectById("s1");
    expect(obj.data.points).toEqual([
      { x: 10, y: 100 },
      { x: 20, y: 100 },
      { x: 30, y: 100 },
    ]);
  });

  test("空轨迹或非法半径返回空结果", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    createStaticStroke(api, "s1");

    expect(await api.eraseData({ points: [], radius: 1, source: "t" })).toEqual(
      { modified: [], created: [], deleted: [] },
    );
    expect(
      await api.eraseData({
        points: [new Vector(5, 95)],
        radius: 0,
        source: "t",
      }),
    ).toEqual({ modified: [], created: [], deleted: [] });
  });

  test("不同来源的分裂 id 使用各自独立的分配器", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);
    createStaticStroke(api, "s1");
    createStaticStroke(api, "s2", [
      { x: 0, y: 200 },
      { x: 10, y: 200 },
      { x: 20, y: 200 },
      { x: 30, y: 200 },
      { x: 40, y: 200 },
    ]);

    const first = await api.eraseData({
      points: [new Vector(20, 95), new Vector(20, 105)],
      radius: 1,
      source: "alice",
    });
    const second = await api.eraseData({
      points: [new Vector(20, 195), new Vector(20, 205)],
      radius: 1,
      source: "bob",
    });

    expect(first.created).toEqual(["alice/core/1"]);
    expect(second.created).toEqual(["bob/core/1"]);
  });

  test("活动对象不能被擦除", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);

    // 创建但不提交，对象为 AOM 中的活动对象
    api.createObject("StrokeObject", {
      id: "s1",
      position: { x: 0, y: 0 },
      property: { width: 2 },
      data: { points: horizontalPoints() },
    });
    expect(boardCore.activeObjectManager.isActive("s1")).toBe(
      true,
    );

    const result = await api.eraseData({
      points: [new Vector(5, 95), new Vector(5, 105)],
      radius: 1,
      source: "test",
    });

    expect(result).toEqual({ modified: [], created: [], deleted: [] });
    expect(boardCore.getObjectById("s1").data.points).toEqual(
      horizontalPoints(),
    );
  });

  test("非活动层成员可以被擦除", async () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);

    // A 在下（横向），B 在上（纵向穿越 A）；先提交 A 再提交 B
    createStaticStroke(api, "A");
    createStaticStroke(api, "B", [
      { x: 20, y: 90 },
      { x: 20, y: 100 },
      { x: 20, y: 110 },
    ]);

    // 选中 A：A 成为活动对象，B 被 pickup 一并纳入为非活动层成员
    await boardCore.activeObjectManager.choose(
      new Set([boardCore.getObjectById("A")]),
    );
    expect(boardCore.activeObjectManager.isActive("A")).toBe(
      true,
    );
    expect(boardCore.activeObjectManager.has("B")).toBe(true);
    expect(boardCore.activeObjectManager.isActive("B")).toBe(
      false,
    );

    // 轨迹同时覆盖 A 与 B 的交点：A 被排除，B 被整笔擦除
    const result = await api.eraseData({
      points: [new Vector(20, 100)],
      radius: 1,
      source: "test",
    });

    expect(result.deleted).toEqual(["B"]);
    expect(result.modified).toEqual([]);
    expect(boardCore.getObjectById("B")).toBeUndefined();
    expect(boardCore.getObjectById("A").data.points).toEqual(
      horizontalPoints(),
    );
  });
});
