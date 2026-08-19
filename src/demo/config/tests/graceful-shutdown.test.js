/**
 * @file graceful-shutdown 测试
 * @description 验证关窗时销毁 BoardCore 的拦截顺序、超时兜底与重入保护。
 * @module demo/config/tests/graceful-shutdown.test
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";

const mockOnCloseRequested = jest.fn();
const mockClose = jest.fn();
const mockGetCurrentWindow = jest.fn(() => ({
  onCloseRequested: mockOnCloseRequested,
  close: mockClose,
}));

jest.unstable_mockModule("@tauri-apps/api/window", () => ({
  getCurrentWindow: mockGetCurrentWindow,
}));

const { installGracefulShutdown } = await import("../graceful-shutdown.js");

/**
 * 取最近一次注册的 close-requested 处理器
 * @returns {Function} 事件处理器
 */
function lastCloseHandler() {
  return mockOnCloseRequested.mock.calls.at(-1)[0];
}

describe("installGracefulShutdown", () => {
  beforeEach(() => {
    mockOnCloseRequested.mockReset();
    mockClose.mockReset();
    mockGetCurrentWindow.mockClear();
  });

  test("Tauri 关窗时先销毁 BoardCore 再真正关窗", async () => {
    const boardApi = {
      destroyBoard: jest.fn().mockResolvedValue({ ok: true }),
    };

    await installGracefulShutdown(boardApi, { tauriAvailable: true });

    expect(mockOnCloseRequested).toHaveBeenCalledTimes(1);
    const event = { preventDefault: jest.fn() };
    await lastCloseHandler()(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(boardApi.destroyBoard).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
    // 销毁必须先于真正关窗
    expect(
      boardApi.destroyBoard.mock.invocationCallOrder[0],
    ).toBeLessThan(mockClose.mock.invocationCallOrder[0]);
  });

  test("destroyBoard 挂起时超时兜底仍关窗", async () => {
    const boardApi = { destroyBoard: jest.fn(() => new Promise(() => {})) };

    await installGracefulShutdown(boardApi, {
      tauriAvailable: true,
      closeTimeoutMs: 20,
    });
    await lastCloseHandler()({ preventDefault: jest.fn() });

    expect(boardApi.destroyBoard).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test("destroyBoard 抛错时不阻塞关窗", async () => {
    const boardApi = {
      destroyBoard: jest.fn().mockRejectedValue(new Error("worker 已死")),
    };

    await installGracefulShutdown(boardApi, { tauriAvailable: true });
    await lastCloseHandler()({ preventDefault: jest.fn() });

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test("重入保护：自身 close 再次触发的 close-requested 直接放行", async () => {
    const boardApi = { destroyBoard: jest.fn().mockResolvedValue({}) };

    await installGracefulShutdown(boardApi, { tauriAvailable: true });
    const handler = lastCloseHandler();
    await handler({ preventDefault: jest.fn() });
    // close() 再次触发 close-requested
    const reentrantEvent = { preventDefault: jest.fn() };
    await handler(reentrantEvent);

    expect(reentrantEvent.preventDefault).not.toHaveBeenCalled();
    expect(boardApi.destroyBoard).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test("web 模式挂 beforeunload，触发时尽力销毁且不引入 Tauri API", async () => {
    const listeners = new Map();
    const originalAddEventListener = globalThis.addEventListener;
    globalThis.addEventListener = (type, cb) => listeners.set(type, cb);
    try {
      const boardApi = { destroyBoard: jest.fn().mockResolvedValue({}) };

      await installGracefulShutdown(boardApi, { tauriAvailable: false });

      expect(mockGetCurrentWindow).not.toHaveBeenCalled();
      const handler = listeners.get("beforeunload");
      expect(typeof handler).toBe("function");
      handler();
      expect(boardApi.destroyBoard).toHaveBeenCalledTimes(1);
    } finally {
      if (originalAddEventListener === undefined) {
        delete globalThis.addEventListener;
      } else {
        globalThis.addEventListener = originalAddEventListener;
      }
    }
  });
});
