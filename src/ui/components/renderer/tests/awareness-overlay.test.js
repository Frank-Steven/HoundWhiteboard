/**
 * @file awareness overlay 测试
 * @description 验证远程命名选择的装饰条目收集、刷新串行化与生命周期。
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";

import { AwarenessOverlay } from "../awareness-overlay.js";
import { RectangleRange } from "../../../../kernel/range/index.js";

/**
 * 创建 mock BoardApi RPC 面
 * @param {Object} options - 选项
 * @param {{ source: string, name?: string, ids: string[] }[]} options.choices - 远程选择列表
 * @returns {Object} mock RPC 面
 */
function createMockBoardApi({ choices = [] } = {}) {
  const summaries = new Map();
  for (const choice of choices) {
    for (const id of choice.ids) {
      summaries.set(id, {
        id,
        position: { x: 10, y: 10 },
        range: new RectangleRange(0, 0, 20, 20),
      });
    }
  }
  return {
    queryRemoteChoices: jest.fn(async () => choices),
    queryObjects: jest.fn(async (ids) =>
      ids.map((id) => summaries.get(id)).filter(Boolean),
    ),
  };
}

/**
 * 创建 mock 视口
 * @returns {Object} mock 视口
 */
function createMockViewport() {
  const listeners = new Set();
  return {
    registerUiOverlayProvider: jest.fn(),
    unregisterUiOverlayProvider: jest.fn(),
    addAwarenessListener: jest.fn((l) => listeners.add(l)),
    removeAwarenessListener: jest.fn((l) => listeners.delete(l)),
    sendAwareness: jest.fn(),
    worldRectToScreenRect: (rect) => rect,
    uiRenderer: { invalidateViewport: jest.fn() },
    emitAwareness(message) {
      for (const listener of listeners) listener(message);
    },
  };
}

describe("AwarenessOverlay", () => {
  test("start 注册 provider 与监听，远程选择画着色框与标签", async () => {
    const boardApi = createMockBoardApi({
      choices: [{ source: "dev-b", name: "hold", ids: ["b/1"] }],
    });
    const viewport = createMockViewport();
    const overlay = new AwarenessOverlay({ boardApi, viewport });

    overlay.start();
    await overlay.refresh();

    expect(viewport.registerUiOverlayProvider).toHaveBeenCalledTimes(1);
    expect(viewport.addAwarenessListener).toHaveBeenCalledTimes(1);

    const provider = viewport.registerUiOverlayProvider.mock.calls[0][0];
    const entries = provider();

    // 一个对象框 + 一个来源标签
    expect(entries).toHaveLength(2);
    const frame = entries.find((e) => e.objectId === "b/1");
    expect(frame.style.strokeStyle).toBeTruthy();
    expect(frame.style.lineDash).toEqual([6, 3]);
    const label = entries.find((e) =>
      e.source.startsWith("awareness-label:"),
    );
    expect(label).toBeDefined();
    expect(typeof label.draw).toBe("function");
    overlay.stop();
  });

  test("remote-activity 消息触发刷新，按来源稳定取色", async () => {
    const boardApi = createMockBoardApi({
      choices: [
        { source: "dev-b", name: "x", ids: ["b/1"] },
        { source: "dev-c", name: "y", ids: ["c/1"] },
      ],
    });
    const viewport = createMockViewport();
    const overlay = new AwarenessOverlay({ boardApi, viewport });
    overlay.start();
    await overlay.refresh();

    const before = boardApi.queryRemoteChoices.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(1);

    viewport.emitAwareness({ type: "awareness", awarenessType: "remote-activity" });
    await overlay.refresh();

    expect(
      boardApi.queryRemoteChoices.mock.calls.length,
    ).toBeGreaterThan(before);

    const provider = viewport.registerUiOverlayProvider.mock.calls[0][0];
    const entries = provider();
    const colors = entries
      .filter((e) => e.objectId)
      .map((e) => e.style.strokeStyle);
    expect(new Set(colors).size).toBe(2);
    overlay.stop();
  });

  test("刷新串行化：刷新期间的通知合并为一次追加刷新", async () => {
    const boardApi = createMockBoardApi({
      choices: [{ source: "dev-b", name: "hold", ids: ["b/1"] }],
    });
    const viewport = createMockViewport();
    const overlay = new AwarenessOverlay({ boardApi, viewport });
    overlay.start();
    await overlay.refresh();

    // 并发触发两次刷新：第一次进行中时第二次只标记待办
    const first = overlay.refresh();
    const second = overlay.refresh();
    await Promise.all([first, second]);

    // start 1 次 + 首次 refresh 内联 1 次 + 并发合并 1 次 = 至多 3 次拉取
    expect(
      boardApi.queryRemoteChoices.mock.calls.length,
    ).toBeLessThanOrEqual(3);
    overlay.stop();
  });

  test("stop 注销 provider 与监听并清空条目", async () => {
    const boardApi = createMockBoardApi({
      choices: [{ source: "dev-b", name: "hold", ids: ["b/1"] }],
    });
    const viewport = createMockViewport();
    const overlay = new AwarenessOverlay({ boardApi, viewport });
    overlay.start();
    await overlay.refresh();

    overlay.stop();

    expect(viewport.unregisterUiOverlayProvider).toHaveBeenCalledTimes(1);
    expect(viewport.removeAwarenessListener).toHaveBeenCalledTimes(1);
    const provider = viewport.registerUiOverlayProvider.mock.calls[0][0];
    expect(provider()).toEqual([]);
  });

  test("远程光标：cursor 消息画点，peer-left 移除", async () => {
    const boardApi = createMockBoardApi();
    const viewport = createMockViewport();
    const overlay = new AwarenessOverlay({ boardApi, viewport });
    overlay.start();
    await overlay.refresh();

    viewport.emitAwareness({
      type: "awareness",
      awarenessType: "cursor",
      source: "dev-b",
      data: { kind: "cursor", point: { x: 30, y: 40 } },
    });

    const provider = viewport.registerUiOverlayProvider.mock.calls[0][0];
    const cursorEntries = provider().filter((e) =>
      e.source.startsWith("awareness-cursor:"),
    );
    expect(cursorEntries).toHaveLength(1);
    expect(cursorEntries[0].geometry.worldPoint).toEqual({ x: 30, y: 40 });

    viewport.emitAwareness({
      type: "awareness",
      awarenessType: "peer-left",
      source: "dev-b",
    });
    expect(
      provider().filter((e) => e.source.startsWith("awareness-cursor:")),
    ).toEqual([]);
    overlay.stop();
  });

  test("远程光标过期自动消失", async () => {
    jest.useFakeTimers();
    try {
      const boardApi = createMockBoardApi();
      const viewport = createMockViewport();
      const overlay = new AwarenessOverlay({ boardApi, viewport });
      overlay.start();
      await overlay.refresh();

      viewport.emitAwareness({
        type: "awareness",
        awarenessType: "cursor",
        source: "dev-b",
        data: { kind: "cursor", point: { x: 1, y: 2 } },
      });
      const provider = viewport.registerUiOverlayProvider.mock.calls[0][0];
      expect(
        provider().filter((e) => e.source.startsWith("awareness-cursor:")),
      ).toHaveLength(1);

      jest.advanceTimersByTime(3500);
      expect(
        provider().filter((e) => e.source.startsWith("awareness-cursor:")),
      ).toEqual([]);
      overlay.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});
