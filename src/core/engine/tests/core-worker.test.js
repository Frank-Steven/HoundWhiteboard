/**
 * @file Core Worker 运行时测试
 * @author Zhou Chenyu
 */

import { CoreWorkerRuntime } from "../core-worker.js";

/**
 * 测试用假 Worker 宿主
 * @class
 */
class FakeWorkerHost {
  /**
   * 已发送消息列表
   * @type {Array<Object>}
   */
  postedMessages;

  /**
   * 事件监听器表
   * @type {Map<string, Set<Function>>}
   */
  listeners;

  /**
   * @constructor
   */
  constructor() {
    this.postedMessages = [];
    this.listeners = new Map();
  }

  /**
   * 注册事件监听器
   * @param {string} type - 事件类型
   * @param {Function} handler - 监听器
   * @returns {void}
   */
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
  }

  /**
   * 注销事件监听器
   * @param {string} type - 事件类型
   * @param {Function} handler - 监听器
   * @returns {void}
   */
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  /**
   * 发送消息
   * @param {Object} message - 消息体
   * @returns {void}
   */
  postMessage(message) {
    this.postedMessages.push(message);
  }

  /**
   * 向宿主注入一条消息
   * @param {Object} message - 要注入的消息
   * @returns {void}
   */
  emit(message) {
    for (const handler of this.listeners.get("message") ?? []) {
      handler({ data: message });
    }
  }
}

/**
 * 创建已启动的 runtime 与宿主
 * @returns {{ host: FakeWorkerHost, runtime: CoreWorkerRuntime }} 测试运行时
 */
function createStartedRuntime() {
  const host = new FakeWorkerHost();
  const runtime = new CoreWorkerRuntime(host);
  runtime.start();
  return { host, runtime };
}

/**
 * 向宿主发送 createBoard 请求
 * @param {FakeWorkerHost} host - 假宿主
 * @returns {void}
 */
function emitCreateBoard(host) {
  host.emit({
    type: "rpc",
    msgId: "create-board",
    method: "createBoard",
    params: { width: 800, height: 600 },
  });
}

describe("CoreWorkerRuntime 批处理错误回执", () => {
  test("单条目失败应回传 rpc-batch-error，其余条目正常执行", () => {
    const { host, runtime } = createStartedRuntime();
    try {
      emitCreateBoard(host);

      host.emit({
        type: "rpc-batch",
        batchId: 7,
        items: [
          {
            method: "createObject",
            type: "StrokeObject",
            props: {
              id: "s1",
              position: { x: 0, y: 0 },
              property: { width: 2 },
              data: {
                points: [
                  { x: 0, y: 0 },
                  { x: 10, y: 0 },
                ],
              },
            },
          },
          { method: "modifyObject", objectId: "missing", patch: { data: {} } },
          { method: "unknownMethod", foo: 1 },
        ],
      });

      const batchError = host.postedMessages.find(
        (message) => message.type === "rpc-batch-error",
      );
      expect(batchError).toBeDefined();
      expect(batchError.batchId).toBe(7);
      expect(batchError.errors).toHaveLength(2);
      expect(batchError.errors[0]).toMatchObject({
        index: 1,
        method: "modifyObject",
        code: "INTERNAL_ERROR",
      });
      expect(batchError.errors[1]).toMatchObject({
        index: 2,
        method: "unknownMethod",
        code: "INTERNAL_ERROR",
      });

      // 失败条目不影响成功条目生效
      host.emit({
        type: "rpc",
        msgId: "query-1",
        method: "queryObjects",
        params: { ids: ["s1"] },
      });
      const queryResponse = host.postedMessages.find(
        (message) =>
          message.type === "rpc-response" && message.msgId === "query-1",
      );
      expect(queryResponse.result).toHaveLength(1);
      expect(queryResponse.result[0].id).toBe("s1");
    } finally {
      runtime.stop();
    }
  });

  test("全部条目成功时不回传 rpc-batch-error", () => {
    const { host, runtime } = createStartedRuntime();
    try {
      emitCreateBoard(host);

      host.emit({
        type: "rpc-batch",
        batchId: 1,
        items: [
          {
            method: "createObject",
            type: "StrokeObject",
            props: {
              id: "s1",
              position: { x: 0, y: 0 },
              data: {
                points: [
                  { x: 0, y: 0 },
                  { x: 10, y: 0 },
                ],
              },
            },
          },
          { method: "commitObjects", objectIds: ["s1"] },
        ],
      });

      const batchError = host.postedMessages.find(
        (message) => message.type === "rpc-batch-error",
      );
      expect(batchError).toBeUndefined();
    } finally {
      runtime.stop();
    }
  });
});
