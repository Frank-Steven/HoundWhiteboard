// SPDX-License-Identifier: MIT

/**
 * @file SubFrame 转发器测试
 * @description 验证手势中间帧的节流合批与 volatile 转发语义。
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";

import { createSubframeForwarder } from "../subframe-forwarder.js";

/**
 * 创建 mock 事件总线
 * @returns {{ on: Function, emit: Function }} 总线
 */
function createBus() {
  const listeners = new Map();
  return {
    on(name, cb) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(cb);
      return () => listeners.get(name)?.delete(cb);
    },
    emit(name, payload) {
      for (const cb of listeners.get(name) ?? []) cb(payload);
    },
  };
}

describe("SubFrame 转发器", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("间隔内多次修改合批为一条，position 后帧盖前帧", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createSubframeForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("subframe", { objectId: "a/1", patch: { position: { x: 1, y: 0 } } });
    bus.emit("subframe", { objectId: "a/1", patch: { position: { x: 5, y: 0 } } });
    bus.emit("subframe", { objectId: "a/2", patch: { position: { x: 9, y: 9 } } });

    expect(sent).toHaveLength(0);
    jest.advanceTimersByTime(33);

    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("subframe");
    expect(sent[0].ops).toHaveLength(2);
    const op1 = sent[0].ops.find((o) => o.objectId === "a/1");
    expect(op1.patch.position).toEqual({ x: 5, y: 0 });
    forwarder.close();
  });

  test("append 按序累积，不与 patch 混淆", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createSubframeForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("subframe", {
      objectId: "a/1",
      append: { key: "points", items: [{ x: 1, y: 1 }] },
    });
    bus.emit("subframe", {
      objectId: "a/1",
      append: { key: "points", items: [{ x: 2, y: 2 }] },
    });
    jest.advanceTimersByTime(33);

    const op = sent[0].ops.find((o) => o.objectId === "a/1");
    expect(op.appends).toHaveLength(2);
    expect(op.appends[0].items).toEqual([{ x: 1, y: 1 }]);
    expect(op.appends[1].items).toEqual([{ x: 2, y: 2 }]);
    forwarder.close();
  });

  test("间隔持续到期间隔各发一批，close 丢弃未发缓冲", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createSubframeForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("subframe", { objectId: "a/1", patch: { position: { x: 1, y: 0 } } });
    jest.advanceTimersByTime(33);
    bus.emit("subframe", { objectId: "a/1", patch: { position: { x: 2, y: 0 } } });
    jest.advanceTimersByTime(33);
    expect(sent).toHaveLength(2);

    bus.emit("subframe", { objectId: "a/1", patch: { position: { x: 3, y: 0 } } });
    forwarder.close();
    jest.advanceTimersByTime(100);
    expect(sent).toHaveLength(2);
  });
});
