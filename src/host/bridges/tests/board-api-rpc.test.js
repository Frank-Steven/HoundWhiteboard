import { jest } from "@jest/globals";

import { BoardApiRpc } from "../board-api-rpc.js";

/**
 * 测试用假 RPC 端点
 * @class
 */
class FakeRpcEndpoint {
  /**
   * @constructor
   */
  constructor() {
    this.postedMessages = [];
    this.listeners = new Map();
  }

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
   * 取消事件监听器
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
   * 向端点注入一条消息
   * @param {Object} message - 要注入的消息
   * @returns {void}
   */
  emit(message) {
    for (const handler of this.listeners.get("message") ?? []) {
      handler({ data: message });
    }
  }
}

describe("BoardApiRpc", () => {
  test("waitUntilReady 应在收到 ready 消息后 resolve", async () => {
    const endpoint = new FakeRpcEndpoint();
    const boardApi = new BoardApiRpc(endpoint);

    const readyPromise = boardApi.waitUntilReady();
    endpoint.emit({ type: "ready" });

    await expect(readyPromise).resolves.toBeUndefined();
    expect(boardApi.isReady()).toBe(true);

    boardApi.destroy();
  });

  test("createObject 应发送 rpc 请求并在收到 rpc-response 后 resolve", async () => {
    const endpoint = new FakeRpcEndpoint();
    const boardApi = new BoardApiRpc(endpoint);

    const createPromise = boardApi.createObject("StrokeObject", {
      id: 7,
      position: { x: 1, y: 2 },
      data: { points: [{ x: 0, y: 0 }] },
    });

    expect(endpoint.postedMessages).toHaveLength(1);
    expect(endpoint.postedMessages[0]).toEqual(
      expect.objectContaining({
        type: "rpc",
        method: "createObject",
        params: {
          type: "StrokeObject",
          props: {
            id: 7,
            position: { x: 1, y: 2 },
            data: { points: [{ x: 0, y: 0 }] },
          },
        },
      }),
    );

    endpoint.emit({
      type: "rpc-response",
      msgId: endpoint.postedMessages[0].msgId,
      result: 7,
    });

    await expect(createPromise).resolves.toBe(7);

    boardApi.destroy();
  });

  test("eraseData 应发送 rpc 请求并在收到 rpc-response 后 resolve", async () => {
    const endpoint = new FakeRpcEndpoint();
    const boardApi = new BoardApiRpc(endpoint);

    const payload = {
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      radius: 8,
      source: "test",
    };
    const erasePromise = boardApi.eraseData(payload);

    expect(endpoint.postedMessages).toHaveLength(1);
    expect(endpoint.postedMessages[0]).toEqual(
      expect.objectContaining({
        type: "rpc",
        method: "eraseData",
        params: payload,
      }),
    );

    endpoint.emit({
      type: "rpc-response",
      msgId: endpoint.postedMessages[0].msgId,
      result: { modified: ["s1"], created: [], deleted: [] },
    });

    await expect(erasePromise).resolves.toEqual({
      modified: ["s1"],
      created: [],
      deleted: [],
    });

    boardApi.destroy();
  });

  test("eraseData 不进批处理合并，逐次立即发送", async () => {
    const endpoint = new FakeRpcEndpoint();
    const boardApi = new BoardApiRpc(endpoint);

    boardApi.eraseData({ points: [{ x: 0, y: 0 }], radius: 8, source: "t" }).catch(() => { });
    boardApi.eraseData({ points: [{ x: 1, y: 1 }], radius: 8, source: "t" }).catch(() => { });

    expect(endpoint.postedMessages).toHaveLength(2);
    expect(endpoint.postedMessages[0].method).toBe("eraseData");
    expect(endpoint.postedMessages[1].method).toBe("eraseData");

    boardApi.destroy();
  });

  test("destroy 应拒绝所有 pending 请求", async () => {
    const endpoint = new FakeRpcEndpoint();
    const boardApi = new BoardApiRpc(endpoint);

    const queryPromise = boardApi.queryObjects([1, 2, 3]);
    boardApi.destroy();

    await expect(queryPromise).rejects.toThrow("BoardApiRpc destroyed.");
  });

  describe("错误与超时", () => {
    test("RPC 请求超时应以 RPC_TIMEOUT reject", async () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint, { timeoutMs: 20 });

      await expect(boardApi.queryObjects([1])).rejects.toMatchObject({
        code: "RPC_TIMEOUT",
      });

      boardApi.destroy();
    });

    test("Worker 返回 error 时应以对应 code/message reject", async () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      const promise = boardApi.deleteObjects(["missing"]);
      endpoint.emit({
        type: "rpc-response",
        msgId: endpoint.postedMessages[0].msgId,
        error: { code: "INTERNAL_ERROR", message: "Object missing not found." },
      });

      await expect(promise).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        message: "Object missing not found.",
      });

      boardApi.destroy();
    });

    test("waitUntilReady 超时应以 RPC_READY_TIMEOUT reject", async () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint, { timeoutMs: 20 });

      await expect(boardApi.waitUntilReady()).rejects.toMatchObject({
        code: "RPC_READY_TIMEOUT",
      });

      boardApi.destroy();
    });

    test("destroy 应幂等，重复调用不抛错", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      boardApi.destroy();
      expect(() => boardApi.destroy()).not.toThrow();
    });

    test("#call 前 flush 失败应立即 reject 而不是悬挂到超时", async () => {
      const endpoint = new FakeRpcEndpoint();
      endpoint.postMessage = (message) => {
        if (message.type === "rpc-batch") {
          throw new Error("endpoint broken");
        }
        endpoint.postedMessages.push(message);
      };
      const boardApi = new BoardApiRpc(endpoint, { timeoutMs: 5000 });

      boardApi.modifyObject(1, { data: {} });
      await expect(boardApi.queryObjects([1])).rejects.toMatchObject({
        code: "RPC_FLUSH_ERROR",
      });

      boardApi.destroy();
    });
  });

  describe("flush 与批处理错误回执", () => {
    test("flush 应立即发送挂起的批缓冲", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      boardApi.modifyObject(1, { data: { radius: 5 } });
      expect(endpoint.postedMessages).toHaveLength(0);

      boardApi.flush();

      expect(endpoint.postedMessages).toHaveLength(1);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");

      boardApi.destroy();
    });

    test("rpc-batch 消息应携带递增 batchId", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      boardApi.modifyObject(1, { data: { a: 1 } });
      boardApi.flush();
      boardApi.modifyObject(2, { data: { b: 2 } });
      boardApi.flush();

      expect(endpoint.postedMessages).toHaveLength(2);
      expect(endpoint.postedMessages[0].batchId).toBe(1);
      expect(endpoint.postedMessages[1].batchId).toBe(2);

      boardApi.destroy();
    });

    test("收到 rpc-batch-error 时应通知 onBatchError 订阅者", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);
      const received = [];
      boardApi.onBatchError((errors, batchId) => {
        received.push({ errors, batchId });
      });

      endpoint.emit({
        type: "rpc-batch-error",
        batchId: 3,
        errors: [
          {
            index: 1,
            method: "modifyObject",
            code: "INTERNAL_ERROR",
            message: "boom",
          },
        ],
      });

      expect(received).toHaveLength(1);
      expect(received[0].batchId).toBe(3);
      expect(received[0].errors).toHaveLength(1);
      expect(received[0].errors[0]).toMatchObject({
        index: 1,
        method: "modifyObject",
      });

      boardApi.destroy();
    });

    test("onBatchError 返回的取消函数应停止后续通知", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);
      const handler = jest.fn();
      const off = boardApi.onBatchError(handler);

      off();
      endpoint.emit({
        type: "rpc-batch-error",
        batchId: 1,
        errors: [{ index: 0, method: "deleteObjects", code: "X", message: "y" }],
      });

      expect(handler).not.toHaveBeenCalled();

      boardApi.destroy();
    });

    test("订阅者抛错不应影响其他订阅者与后续消息分发", async () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);
      const goodHandler = jest.fn();
      boardApi.onBatchError(() => {
        throw new Error("bad handler");
      });
      boardApi.onBatchError(goodHandler);

      endpoint.emit({
        type: "rpc-batch-error",
        batchId: 2,
        errors: [{ index: 0, method: "modifyObject", code: "X", message: "y" }],
      });

      expect(goodHandler).toHaveBeenCalledTimes(1);

      // 后续 rpc-response 仍正常分发
      const promise = boardApi.queryObjects([1]);
      endpoint.emit({
        type: "rpc-response",
        msgId: endpoint.postedMessages[0].msgId,
        result: [],
      });
      await expect(promise).resolves.toEqual([]);

      boardApi.destroy();
    });
  });

  describe("批处理顺序屏障", () => {
    test("modifyObject 批缓冲应先于 commitObjects 发出", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      // 不 await：批缓冲仍挂起时直接发起顺序调用，验证 #call 的同步 flush 屏障
      boardApi.modifyObject(1, { data: { radius: 5 } });
      boardApi.commitObjects([1]).catch(() => { });

      expect(endpoint.postedMessages).toHaveLength(2);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");
      expect(endpoint.postedMessages[0].items).toEqual([
        {
          method: "modifyObject",
          objectId: 1,
          patch: { data: { radius: 5 } },
        },
      ]);
      expect(endpoint.postedMessages[1].type).toBe("rpc");
      expect(endpoint.postedMessages[1].method).toBe("commitObjects");
      expect(endpoint.postedMessages[1].params).toEqual({ objectIds: [1] });

      boardApi.destroy();
    });

    test("amendMol 批缓冲应先于 endMol 发出（分子管线保序）", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      // 不 await：amend 批缓冲仍挂起时直接发起确认式 endMol，验证 #call 的同步 flush 屏障
      boardApi.amendMol("demo/mol-1", { "1": { position: { x: 3, y: 4 } } });
      boardApi.endMol("demo/mol-1").catch(() => { });

      expect(endpoint.postedMessages).toHaveLength(2);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");
      expect(endpoint.postedMessages[0].items).toEqual([
        {
          method: "amendMol",
          molId: "demo/mol-1",
          patchesByObject: { "1": { position: { x: 3, y: 4 } } },
        },
      ]);
      expect(endpoint.postedMessages[1].type).toBe("rpc");
      expect(endpoint.postedMessages[1].method).toBe("endMol");
      expect(endpoint.postedMessages[1].params).toEqual({
        molId: "demo/mol-1",
      });

      boardApi.destroy();
    });

    test("modifyObject 批缓冲应先于 eraseData 发出", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      boardApi.modifyObject("s1", { data: { points: [{ x: 0, y: 0 }] } }).catch(() => { });
      boardApi.eraseData({ points: [{ x: 1, y: 1 }], radius: 8, source: "t" }).catch(() => { });

      expect(endpoint.postedMessages).toHaveLength(2);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");
      expect(endpoint.postedMessages[1].type).toBe("rpc");
      expect(endpoint.postedMessages[1].method).toBe("eraseData");

      boardApi.destroy();
    });

    test("appendListItem 批缓冲应先于 deleteObjects 发出", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      boardApi.appendListItem(2, "points", [{ x: 1, y: 1 }]);
      boardApi.deleteObjects([2]).catch(() => { });

      expect(endpoint.postedMessages).toHaveLength(2);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");
      expect(endpoint.postedMessages[0].items).toEqual([
        {
          method: "appendListItem",
          objectId: 2,
          key: "points",
          items: [{ x: 1, y: 1 }],
        },
      ]);
      expect(endpoint.postedMessages[1].type).toBe("rpc");
      expect(endpoint.postedMessages[1].method).toBe("deleteObjects");

      boardApi.destroy();
    });

    test("同帧多次 modifyObject 应合并为一条批消息且 patch 按规则合并", () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      boardApi.modifyObject(1, {
        position: { x: 1, y: 1 },
        data: { radius: 1 },
      });
      boardApi.modifyObject(1, {
        position: { x: 2, y: 2 },
        data: { stroke: 3 },
      });
      boardApi.commitObjects([1]).catch(() => { });

      expect(endpoint.postedMessages).toHaveLength(2);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");
      expect(endpoint.postedMessages[0].items).toEqual([
        {
          method: "modifyObject",
          objectId: 1,
          patch: {
            position: { x: 2, y: 2 },
            data: { radius: 1, stroke: 3 },
          },
        },
      ]);

      boardApi.destroy();
    });

    test("无后续顺序调用时批缓冲应随微任务自动 flush", async () => {
      const endpoint = new FakeRpcEndpoint();
      const boardApi = new BoardApiRpc(endpoint);

      const modifyPromise = boardApi.modifyObject(1, { data: { radius: 5 } });
      expect(endpoint.postedMessages).toHaveLength(0);

      await modifyPromise;

      expect(endpoint.postedMessages).toHaveLength(1);
      expect(endpoint.postedMessages[0].type).toBe("rpc-batch");
      expect(endpoint.postedMessages[0].items).toEqual([
        {
          method: "modifyObject",
          objectId: 1,
          patch: { data: { radius: 5 } },
        },
      ]);

      boardApi.destroy();
    });
  });
});
