/**
 * @file WrapperTool 基座测试
 * @description 验证槽位状态隔离、services 透传与 dispose/umount 传播。
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";
import { WrapperTool } from "../wrapper-tool.js";
import { Tool } from "../../tool.js";
import { DevicesDAGNode } from "../../../dag-core/dag-node-edge.js";

/**
 * 写入同名 state 键的测试工具
 * @description process 时通过 setContextObjects 写入自身 id，供槽位隔离断言。
 * @class
 * @extends Tool
 */
class StateWritingTool extends Tool {
  /**
   * @param {number} id - 写入 state 的对象 id
   */
  constructor(id) {
    super();
    this.id = id;
    this.calls = [];
  }

  process(signalPacket, context) {
    this.calls.push({ signalPacket, context });
    this.setContextObjects(context, [{ id: this.id }]);
  }

  reset() { }
}

/**
 * 测试用 wrapper：process 将信号分发到全部槽位
 * @class
 * @extends WrapperTool
 */
class TestWrapper extends WrapperTool {
  process(signalPacket, context = {}) {
    for (const scopeId of this._listSlotIds()) {
      this._dispatchToSlot(scopeId, signalPacket, context);
    }
  }

  reset() { }

  getDebugInfo() {
    return { slots: this._listSlotIds() };
  }
}

describe("WrapperTool", () => {
  test("两个槽位写同名 state 键互不干扰", () => {
    const wrapper = new TestWrapper();
    wrapper._addSlot("a", new StateWritingTool(1));
    wrapper._addSlot("b", new StateWritingTool(2));

    wrapper.process(
      { signals: [{ type: "position", context: { value: { x: 1, y: 1 } } }] },
      { services: {}, path: "/wf/test" },
    );

    // 两个槽位的 shell 节点各自持有自己的 objects，互不覆盖
    expect(wrapper._getSlot("a").node.state).toEqual({
      objects: [{ id: 1 }],
    });
    expect(wrapper._getSlot("b").node.state).toEqual({
      objects: [{ id: 2 }],
    });
  });

  test("services 透传到子工具", () => {
    const wrapper = new TestWrapper();
    const toolA = new StateWritingTool(1);
    const toolB = new StateWritingTool(2);
    wrapper._addSlot("a", toolA);
    wrapper._addSlot("b", toolB);

    const board = { marker: "board" };
    const viewport = { marker: "viewport" };
    wrapper.process(
      { signals: [{ type: "position", context: { value: { x: 1, y: 1 } } }] },
      { services: { board, viewport }, path: "/wf/test" },
    );

    expect(toolA.calls).toHaveLength(1);
    expect(toolB.calls).toHaveLength(1);
    expect(toolA.calls[0].context.services.board).toBe(board);
    expect(toolA.calls[0].context.services.viewport).toBe(viewport);
    expect(toolB.calls[0].context.services.board).toBe(board);
    // 子上下文路径带槽位后缀
    expect(toolA.calls[0].context.path).toBe("/wf/test/a");
    expect(toolB.calls[0].context.path).toBe("/wf/test/b");
  });

  test("umount 应 dispose 全部槽位并取消活跃动作", () => {
    const wrapper = new TestWrapper();
    wrapper._addSlot("a", new StateWritingTool(1));
    wrapper._addSlot("b", new StateWritingTool(2));

    const disposeA = jest.spyOn(wrapper._getSlot("a").processor, "dispose");
    const disposeB = jest.spyOn(wrapper._getSlot("b").processor, "dispose");
    const cancelAction = jest.spyOn(wrapper, "cancelAction");
    wrapper.isActionActive = true;

    wrapper.umount({ services: {} });

    expect(cancelAction).toHaveBeenCalledTimes(1);
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
    // 槽位已移除
    expect(wrapper._getSlot("a")).toBeUndefined();
    expect(wrapper._getSlot("b")).toBeUndefined();
    expect(wrapper._listSlotIds()).toEqual([]);
  });

  test("_addNodeSlot 登记预构建节点，dispatch 到达 node.handler", () => {
    const wrapper = new TestWrapper();

    const handler = jest.fn();
    const entry = new DevicesDAGNode(0);
    entry.handler = handler;

    const slot = wrapper._addNodeSlot("touch-0", entry);

    // 槽位形状：node 持有入口节点，无 tool 实例，processor 即 node.handler
    expect(slot.node).toBe(entry);
    expect(slot.tool).toBeNull();
    expect(slot.processor).toBe(handler);

    wrapper._dispatchToSlot(
      "touch-0",
      { signals: [{ type: "position", context: { value: { x: 3, y: 4 } } }] },
      { services: { board: {} }, path: "/wf/multi" },
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const [packet, context] = handler.mock.calls[0];
    expect(packet.signals).toEqual([
      { type: "position", context: { value: { x: 3, y: 4 } } },
    ]);
    expect(context.services.board).toEqual({});
    expect(context.path).toBe("/wf/multi/touch-0");
  });

  test("_teardownSlot 覆写后 _disposeSlot 走子类清理逻辑", () => {
    /**
     * 覆写 _teardownSlot 的测试 wrapper
     * @class
     * @extends TestWrapper
     */
    class TeardownWrapper extends TestWrapper {
      constructor() {
        super();
        this.tornDown = [];
      }

      _teardownSlot(slot, context) {
        this.tornDown.push({ nodeId: slot.node.id, context });
      }
    }

    const wrapper = new TeardownWrapper();
    const entry = new DevicesDAGNode(7);
    entry.handler = jest.fn();
    wrapper._addNodeSlot("touch-0", entry);

    const ctx = { services: { board: {} } };
    wrapper._disposeSlot("touch-0", ctx);

    // 子类钩子被调用，且槽位已移除
    expect(wrapper.tornDown).toEqual([{ nodeId: 7, context: ctx }]);
    expect(wrapper._getSlot("touch-0")).toBeUndefined();
  });

  test("默认 _teardownSlot 吞掉 dispose 错误，不中断槽位删除", () => {
    const wrapper = new TestWrapper();
    const entry = new DevicesDAGNode(0);
    entry.handler = jest.fn();
    entry.handler.dispose = jest.fn(() => {
      throw new Error("dispose failed");
    });
    wrapper._addNodeSlot("touch-0", entry);

    expect(() => wrapper._disposeSlot("touch-0", {})).not.toThrow();
    expect(entry.handler.dispose).toHaveBeenCalledTimes(1);
    expect(wrapper._getSlot("touch-0")).toBeUndefined();
  });

  test("_buildSlotContext 提供完整上下文形状且状态读写落在 shell 节点", () => {
    const wrapper = new TestWrapper();
    wrapper._addSlot("a", new StateWritingTool(1));
    const shell = wrapper._getSlot("a").node;

    const ctx = wrapper._buildSlotContext("a", {
      services: { board: { marker: 1 } },
      path: "/wf/test",
    });

    // 形状：dag 恒为 null，路径带槽位后缀，services 透传
    expect(ctx.dag).toBeNull();
    expect(ctx.node).toBe(shell);
    expect(ctx.path).toBe("/wf/test/a");
    expect(ctx.services.board).toEqual({ marker: 1 });

    // patchState / getState / delNodeState 只影响 shell 节点
    ctx.patchState({ phase: "x", count: 1 });
    expect(shell.state).toEqual({ phase: "x", count: 1 });
    expect(ctx.getState()).toEqual({ phase: "x", count: 1 });

    ctx.patchState({ count: 2 });
    expect(shell.state.count).toBe(2);

    ctx.delNodeState(undefined, "phase");
    expect(shell.state).toEqual({ count: 2 });

    ctx.setNodeState(undefined, { reset: true });
    expect(shell.state).toEqual({ reset: true });
    expect(ctx.getNodeState()).toEqual({ reset: true });

    // signal / routeToChild / stop 与 DAG 标准 helper 同形
    expect(ctx.signal("position", { x: 1 })).toEqual({
      type: "position",
      context: { value: { x: 1 } },
    });
    expect(ctx.routeToChild("next", [])).toEqual({
      packets: [expect.objectContaining({ to: "next" })],
    });
    expect(ctx.stop()).toEqual({ packets: [] });
  });
});
