// SPDX-License-Identifier: MIT

/**
 * @file amend 转发器测试
 * @description 验证分子生命周期事件的即时转发与中间帧节流合批语义。
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";

import { createAmendForwarder } from "../amend-forwarder.js";

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

describe("amend 转发器", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("begin-mol 即时发出，不经合批等待", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    const entries = [
      { objectId: "a/1", before: null, create: { type: "StrokeObject", id: "a/1" } },
    ];
    bus.emit("amend", { kind: "begin-mol", molId: "m/1", entries });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ kind: "mol-begin", molId: "m/1", entries });
    expect(forwarder.pendingCount).toBe(0);
    forwarder.close();
  });

  test("间隔内多条 amend 合批为一条 mol-amend，position 后帧盖前帧", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 1,
      entries: [{ objectId: "a/1", patch: { position: { x: 1, y: 0 } } }],
    });
    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 2,
      entries: [
        { objectId: "a/1", patch: { position: { x: 5, y: 0 } } },
        { objectId: "a/2", patch: { position: { x: 9, y: 9 } } },
      ],
    });

    expect(sent).toHaveLength(0);
    jest.advanceTimersByTime(33);

    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("mol-amend");
    expect(sent[0].mols).toHaveLength(1);
    expect(sent[0].mols[0].molId).toBe("m/1");
    expect(sent[0].mols[0].entries).toHaveLength(2);
    const entry1 = sent[0].mols[0].entries.find((e) => e.objectId === "a/1");
    expect(entry1.patch.position).toEqual({ x: 5, y: 0 });
    forwarder.close();
  });

  test("不同 molId 各自成组，seq 取批内最大", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 3,
      entries: [{ objectId: "a/1", patch: { position: { x: 1, y: 0 } } }],
    });
    bus.emit("amend", {
      kind: "amend",
      molId: "m/2",
      seq: 7,
      entries: [{ objectId: "b/1", patch: { position: { x: 2, y: 2 } } }],
    });
    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 5,
      entries: [{ objectId: "a/1", patch: { data: { color: "red" } } }],
    });
    jest.advanceTimersByTime(33);

    expect(sent).toHaveLength(1);
    expect(sent[0].mols).toHaveLength(2);
    const mol1 = sent[0].mols.find((m) => m.molId === "m/1");
    const mol2 = sent[0].mols.find((m) => m.molId === "m/2");
    expect(mol1.seq).toBe(5);
    expect(mol2.seq).toBe(7);
    expect(mol1.entries).toHaveLength(1);
    expect(mol1.entries[0].patch.position).toEqual({ x: 1, y: 0 });
    expect(mol1.entries[0].patch.data).toEqual({ color: "red" });
    forwarder.close();
  });

  test("append items 按序累积为单条 append", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 1,
      entries: [
        { objectId: "a/1", patch: { append: { key: "points", items: [{ x: 1, y: 1 }] } } },
      ],
    });
    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 2,
      entries: [
        { objectId: "a/1", patch: { append: { key: "points", items: [{ x: 2, y: 2 }] } } },
      ],
    });
    jest.advanceTimersByTime(33);

    expect(sent).toHaveLength(1);
    const entry = sent[0].mols[0].entries.find((e) => e.objectId === "a/1");
    expect(entry.patch.append).toEqual({
      key: "points",
      items: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    });
    forwarder.close();
  });

  test("end-mol 先冲出残余缓冲再即时发 mol-end", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 4,
      entries: [{ objectId: "a/1", patch: { position: { x: 3, y: 3 } } }],
    });
    bus.emit("amend", { kind: "end-mol", molId: "m/1" });

    expect(sent).toHaveLength(2);
    expect(sent[0].kind).toBe("mol-amend");
    expect(sent[0].mols[0].molId).toBe("m/1");
    expect(sent[0].mols[0].seq).toBe(4);
    expect(sent[1]).toEqual({ kind: "mol-end", molId: "m/1" });
    expect(forwarder.pendingCount).toBe(0);

    // 缓冲已冲出：到期间隔不再重发
    jest.advanceTimersByTime(100);
    expect(sent).toHaveLength(2);
    forwarder.close();
  });

  test("abort-mol 丢弃该分子缓冲并即时发 mol-abort", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 1,
      entries: [{ objectId: "a/1", patch: { position: { x: 1, y: 1 } } }],
    });
    bus.emit("amend", { kind: "abort-mol", molId: "m/1" });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ kind: "mol-abort", molId: "m/1" });
    expect(forwarder.pendingCount).toBe(0);

    // 缓冲已丢弃：到期间隔不再发出
    jest.advanceTimersByTime(100);
    expect(sent).toHaveLength(1);
    forwarder.close();
  });

  test("close 清定时器并丢弃未发缓冲", () => {
    const bus = createBus();
    const sent = [];
    const forwarder = createAmendForwarder({
      boardCore: { activityEventBus: bus },
      sendAwareness: (data) => sent.push(data),
      intervalMs: 33,
    });

    bus.emit("amend", {
      kind: "amend",
      molId: "m/1",
      seq: 1,
      entries: [{ objectId: "a/1", patch: { position: { x: 1, y: 0 } } }],
    });
    expect(forwarder.pendingCount).toBe(1);

    forwarder.close();
    expect(forwarder.pendingCount).toBe(0);
    jest.advanceTimersByTime(100);
    expect(sent).toHaveLength(0);

    // close 后退订：后续事件不再转发
    bus.emit("amend", { kind: "begin-mol", molId: "m/2", entries: [] });
    expect(sent).toHaveLength(0);
  });
});
