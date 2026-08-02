import { jest } from "@jest/globals";
import { DataObjectEraserTool } from "../data-object-eraser.js";
import { Vector } from "../../../../../kernel/utils/math.js";
import { BoardApi } from "../../../../../kernel/api/board-api.js";
import { BoardCore } from "../../../../../kernel/document/board-core.js";
import { createDefaultAomRenderHooks } from "../../../../../kernel/document/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../../../../host/bridges/persistence-adapter.js";
import { flushMicrotasks } from "../../../../../test-support/worker-mode-fixtures.js";

function createDeviceContext({ board, boardApi, viewport } = {}) {
  const _nodeState = {};
  return {
    path: "/test",
    getNodeState: () => ({ ..._nodeState }),
    setNodeState: (_pathOrId, state) => {
      Object.assign(_nodeState, state);
      return { ..._nodeState };
    },
    services: { board, boardApi, viewport },
  };
}

function positionSignal(x, y) {
  return {
    to: "/test",
    signals: [{ type: "position", context: { value: new Vector(x, y) } }],
  };
}

function createMockBoardApi() {
  return {
    eraseData: jest.fn(async () => ({ modified: [], created: [], deleted: [] })),
  };
}

describe("DataObjectEraserTool", () => {
  test("拖动时把增量轨迹段连同半径与来源发往 boardApi.eraseData", () => {
    const boardApi = createMockBoardApi();
    const tool = new DataObjectEraserTool({ eraserSize: 20 });
    const context = createDeviceContext({
      board: { idSource: "zhouc_yu" },
      boardApi,
    });

    tool.process(positionSignal(0, 0), context);
    tool.process(positionSignal(10, 5), context);

    expect(boardApi.eraseData).toHaveBeenCalledTimes(2);
    expect(boardApi.eraseData).toHaveBeenNthCalledWith(1, {
      points: [{ x: 0, y: 0 }],
      radius: 10,
      source: "zhouc_yu",
    });
    expect(boardApi.eraseData).toHaveBeenNthCalledWith(2, {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      radius: 10,
      source: "zhouc_yu",
    });
  });

  test("单击（位置不变）只发送一次单点轨迹", () => {
    const boardApi = createMockBoardApi();
    const tool = new DataObjectEraserTool();
    const context = createDeviceContext({
      board: { idSource: "test" },
      boardApi,
    });

    tool.process(positionSignal(7, 7), context);
    tool.process(positionSignal(7, 7), context);

    expect(boardApi.eraseData).toHaveBeenCalledTimes(1);
    expect(boardApi.eraseData).toHaveBeenCalledWith({
      points: [{ x: 7, y: 7 }],
      radius: 8,
      source: "test",
    });
  });

  test("boardApi 缺少 eraseData 或缺省时不抛错", () => {
    const tool = new DataObjectEraserTool();

    expect(() => {
      tool.process(positionSignal(0, 0), createDeviceContext({ boardApi: {} }));
      tool.process(positionSignal(1, 1), createDeviceContext({}));
    }).not.toThrow();
  });

  test("end 后新手势重新携带来源发送", () => {
    const boardApi = createMockBoardApi();
    const tool = new DataObjectEraserTool();
    const context = createDeviceContext({
      board: { idSource: "test" },
      boardApi,
    });

    tool.process(positionSignal(0, 0), context);
    tool.process({ to: "/test", signals: [{ type: "end" }] }, context);
    tool.process(positionSignal(30, 30), context);

    expect(boardApi.eraseData).toHaveBeenCalledTimes(2);
    expect(boardApi.eraseData).toHaveBeenLastCalledWith({
      points: [{ x: 30, y: 30 }],
      radius: 8,
      source: "test",
    });
  });

  test("端到端：手势轨迹经 Engine BoardApi 真实切割 Core 中的笔画", async () => {
    const boardCore = new BoardCore({
      width: 800,
      height: 600,
      aomRenderHooks: createDefaultAomRenderHooks(),
      persistenceAdapter: createDefaultPersistenceAdapter(),
    });
    const boardApi = new BoardApi(boardCore);

    boardApi.createObject("StrokeObject", {
      id: "s1",
      position: { x: 0, y: 0 },
      property: { width: 2 },
      data: {
        points: [
          { x: 0, y: 100 },
          { x: 10, y: 100 },
          { x: 20, y: 100 },
          { x: 30, y: 100 },
          { x: 40, y: 100 },
        ],
      },
    });
    boardApi.commitObjects(["s1"]);

    const tool = new DataObjectEraserTool({ eraserSize: 2 });
    const context = createDeviceContext({
      board: { idSource: "test" },
      boardApi,
    });

    // 轨迹在 x=20 处竖直穿越笔画：阈值 = 1 + 2/2 = 2
    tool.process(positionSignal(20, 95), context);
    tool.process(positionSignal(20, 105), context);
    tool.process({ to: "/test", signals: [{ type: "end" }] }, context);

    await flushMicrotasks();

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
  });
});
