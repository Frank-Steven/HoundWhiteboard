/**
 * @file 同步控制台辅助测试
 * @description 验证 window.hwb 的设置/清除函数落 localStorage 并触发刷新，status 只读不刷新。
 * @module demo/config/tests/sync-console.test
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";
import { installSyncConsole } from "../sync-console.js";

/**
 * 内存版 localStorage
 * @class
 */
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.get(key) ?? null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

/**
 * 装配测试环境（内存存储 + reload 间谍 + 控制台间谍）
 * @returns {Object} 测试环境
 */
function setupEnv() {
  const storage = new MemoryStorage();
  const reload = jest.fn();
  const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
  delete globalThis.hwb;
  globalThis.localStorage = storage;
  globalThis.location = { reload };
  installSyncConsole();
  return { storage, reload, consoleLog, consoleWarn };
}

describe("同步控制台辅助", () => {
  afterEach(() => {
    delete globalThis.hwb;
    delete globalThis.localStorage;
    delete globalThis.location;
    jest.restoreAllMocks();
  });

  test("setRelay 写入存储并刷新，非法参数警告不刷新", () => {
    const { storage, reload, consoleWarn } = setupEnv();
    globalThis.hwb.setRelay("ws://192.168.1.5:8377");
    expect(storage.getItem("hwb-relay")).toBe("ws://192.168.1.5:8377");
    expect(reload).toHaveBeenCalledTimes(1);

    globalThis.hwb.setRelay("");
    expect(consoleWarn).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("setSource 与 setBoard 各自落键并刷新", () => {
    const { storage, reload } = setupEnv();
    globalThis.hwb.setSource("B");
    globalThis.hwb.setBoard("~/hound-whiteboard/demo-board-2");
    expect(storage.getItem("hwb-source")).toBe("B");
    expect(storage.getItem("hwb-board")).toBe("~/hound-whiteboard/demo-board-2");
    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("status 只读打印不刷新", () => {
    const { storage, reload, consoleLog } = setupEnv();
    storage.setItem("hwb-relay", "ws://127.0.0.1:8377");
    globalThis.hwb.status();
    expect(reload).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalled();
  });

  test("off 清除全部同步配置并刷新", () => {
    const { storage, reload } = setupEnv();
    storage.setItem("hwb-relay", "ws://x");
    storage.setItem("hwb-source", "B");
    storage.setItem("hwb-board", "~/b");
    globalThis.hwb.off();
    expect(storage.getItem("hwb-relay")).toBeNull();
    expect(storage.getItem("hwb-source")).toBeNull();
    expect(storage.getItem("hwb-board")).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("重复安装不覆盖已有 hwb", () => {
    const { storage } = setupEnv();
    globalThis.hwb.custom = "keep";
    installSyncConsole();
    expect(globalThis.hwb.custom).toBe("keep");
    expect(storage.getItem("hwb-relay")).toBeNull();
  });
});
