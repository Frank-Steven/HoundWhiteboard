import { jest } from "@jest/globals";
import { Vector } from "../../../../../kernel/utils/math.js";
import { ObjectEraserTool } from "../object-eraser.js";

class TestEraserTool extends ObjectEraserTool {
  constructor(options = {}) {
    super(options);
    this.segments = [];
  }

  applyTrailSegment(from, to, interaction) {
    this.segments.push([from, to]);
  }
}

function createDeviceContext({ viewport } = {}) {
  const _nodeState = {};
  return {
    path: "/test",
    getNodeState: () => ({ ..._nodeState }),
    setNodeState: (_pathOrId, state) => {
      Object.assign(_nodeState, state);
      return { ..._nodeState };
    },
    services: { viewport },
  };
}

function positionSignal(x, y) {
  return {
    to: "/test",
    signals: [{ type: "position", context: { value: new Vector(x, y) } }],
  };
}

describe("ObjectEraserTool", () => {
  test("首个 position 记录锚点并按点擦除一次", () => {
    const tool = new TestEraserTool();
    const context = createDeviceContext();

    tool.process(positionSignal(10, 20), context);

    expect(tool.segments).toHaveLength(1);
    expect(tool.segments[0][0]).toEqual(new Vector(10, 20));
    expect(tool.segments[0][1]).toEqual(new Vector(10, 20));
    expect(tool._lastTrailPoint).toEqual(new Vector(10, 20));
  });

  test("后续 position 产生连续增量段并推进锚点", () => {
    const tool = new TestEraserTool();
    const context = createDeviceContext();

    tool.process(positionSignal(0, 0), context);
    tool.process(positionSignal(10, 0), context);
    tool.process(positionSignal(20, 0), context);

    expect(tool.segments).toHaveLength(3);
    expect(tool.segments[1][0]).toEqual(new Vector(0, 0));
    expect(tool.segments[1][1]).toEqual(new Vector(10, 0));
    expect(tool.segments[2][0]).toEqual(new Vector(10, 0));
    expect(tool.segments[2][1]).toEqual(new Vector(20, 0));
  });

  test("重复位置不产生新段", () => {
    const tool = new TestEraserTool();
    const context = createDeviceContext();

    tool.process(positionSignal(5, 5), context);
    tool.process(positionSignal(5, 5), context);
    tool.process(positionSignal(5, 5), context);

    expect(tool.segments).toHaveLength(1);
  });

  test("end 信号清理轨迹，新手势重新从点擦开始", () => {
    const tool = new TestEraserTool();
    const context = createDeviceContext();

    tool.process(positionSignal(0, 0), context);
    tool.process({ to: "/test", signals: [{ type: "end" }] }, context);

    expect(tool._lastTrailPoint).toBeNull();
    expect(tool.isGestureActive).toBe(false);

    tool.process(positionSignal(50, 50), context);

    expect(tool.segments).toHaveLength(2);
    expect(tool.segments[1][0]).toEqual(new Vector(50, 50));
    expect(tool.segments[1][1]).toEqual(new Vector(50, 50));
  });

  test("cancel 信号清理轨迹状态", () => {
    const tool = new TestEraserTool();
    const context = createDeviceContext();

    tool.process(positionSignal(0, 0), context);
    tool.process({ to: "/test", signals: [{ type: "cancel" }] }, context);

    expect(tool._lastTrailPoint).toBeNull();
    expect(tool.isGestureActive).toBe(false);
  });

  test("手势期间声明圆形光标 overlay，手势结束后不再声明", () => {
    const tool = new TestEraserTool({ eraserSize: 20 });
    const viewport = { zoom: 2 };
    const context = createDeviceContext({ viewport });

    expect(tool.collectUiOverlayEntries({ viewport })).toEqual([]);

    tool.process(positionSignal(10, 20), context);

    const entries = tool.collectUiOverlayEntries({ viewport });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("eraser-cursor");
    expect(entries[0].type).toBe("point");
    expect(entries[0].geometry.worldPoint).toEqual({ x: 10, y: 20 });
    expect(entries[0].geometry.radius).toBe(20);
    expect(entries[0].style.fillStyle).toBeUndefined();

    tool.process({ to: "/test", signals: [{ type: "end" }] }, context);

    expect(tool.collectUiOverlayEntries({ viewport })).toEqual([]);
  });

  test("按下与松手都请求 overlay 刷新，光标随状态显隐", () => {
    const viewport = { zoom: 1, requestViewportUiRender: jest.fn() };
    const tool = new TestEraserTool();
    const context = createDeviceContext({ viewport });

    tool.process(positionSignal(10, 20), context);
    expect(viewport.requestViewportUiRender).toHaveBeenCalled();
    expect(tool.collectUiOverlayEntries({ viewport })).toHaveLength(1);

    viewport.requestViewportUiRender.mockClear();
    tool.process({ to: "/test", signals: [{ type: "end" }] }, context);

    expect(viewport.requestViewportUiRender).toHaveBeenCalled();
    expect(tool.collectUiOverlayEntries({ viewport })).toEqual([]);
  });

  test("cancel 时请求 overlay 刷新清除光标", () => {
    const viewport = { zoom: 1, requestViewportUiRender: jest.fn() };
    const tool = new TestEraserTool();
    const context = createDeviceContext({ viewport });

    tool.process(positionSignal(10, 20), context);
    viewport.requestViewportUiRender.mockClear();
    tool.process({ to: "/test", signals: [{ type: "cancel" }] }, context);

    expect(viewport.requestViewportUiRender).toHaveBeenCalled();
    expect(tool.collectUiOverlayEntries({ viewport })).toEqual([]);
  });

  test("reset 清理轨迹状态", () => {
    const tool = new TestEraserTool();
    const context = createDeviceContext();

    tool.process(positionSignal(1, 1), context);
    tool.reset();

    expect(tool._lastTrailPoint).toBeNull();
  });

  test("eraserSize 选项生效，非法值回退默认值", () => {
    expect(new TestEraserTool({ eraserSize: 32 }).eraserSize).toBe(32);
    expect(new TestEraserTool({ eraserSize: -1 }).eraserSize).toBe(16);
    expect(new TestEraserTool().eraserSize).toBe(16);
  });
});
