/**
 * @file Core Worker 同步接线测试
 * @description createBoard 携带 syncUrl 时连接中继并与对等端互相同步；中继不可达时降级离线。
 * @module host/tests/core-worker-sync.test
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";
import { CoreWorkerRuntime } from "../core-worker.js";
import { BoardApi } from "../../kernel/api/board-api.js";
import { BoardCore } from "../../kernel/board/board-core.js";
import { createDefaultAomRenderHooks } from "../../kernel/board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../kernel/board/persistence-adapter.js";
import { createRelayServer } from "../sync/relay-server.js";
import { createNetworkCoordinator } from "../sync/network-coordinator.js";

/**
 * 测试用假 Worker 宿主
 * @class
 */
class FakeWorkerHost {
  constructor() {
    this.postedMessages = [];
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  postMessage(message) {
    this.postedMessages.push(message);
  }

  emit(message) {
    for (const handler of this.listeners.get("message") ?? []) {
      handler({ data: message });
    }
  }
}

/**
 * 发 RPC 并等待响应
 * @param {FakeWorkerHost} host - 假宿主
 * @param {string} method - 方法名
 * @param {Object} params - 参数
 * @returns {Promise<Object>} 响应结果
 */
async function rpc(host, method, params) {
  const msgId = `rpc-${Math.random().toString(36).slice(2)}`;
  host.emit({ type: "rpc", msgId, method, params });
  for (let i = 0; i < 200; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const response = host.postedMessages.find(
      (m) => m.type === "rpc-response" && m.msgId === msgId,
    );
    if (response) {
      if (response.error) throw new Error(response.error);
      return response.result;
    }
  }
  throw new Error(`RPC 超时：${method}`);
}

/**
 * 轮询直至条件满足
 * @param {Function} predicate - 判定函数
 * @param {string} label - 条件描述
 * @returns {Promise<void>}
 */
async function until(predicate, label) {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`until 超时：${label}`);
}

/**
 * 创建对等端（内核 + 协调器直连中继）
 * @param {string} source - 端标识
 * @param {number} port - 中继端口
 * @returns {Promise<Object>} 对等端
 */
async function connectPeer(source, port) {
  const boardCore = new BoardCore({
    width: 800,
    height: 600,
    source,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
  const api = new BoardApi(boardCore);
  const coordinator = createNetworkCoordinator({
    boardCore,
    boardApi: api,
    url: `ws://127.0.0.1:${port}`,
    boardId: "test-room",
  });
  await coordinator.connect();
  return { boardCore, api, coordinator };
}

/**
 * 经 RPC 在 worker 内创建并提交一笔笔画
 * @param {FakeWorkerHost} host - 假宿主
 * @param {string} id - 对象 id
 * @returns {Promise<void>}
 */
async function createStrokeViaRpc(host, id) {
  await rpc(host, "createObject", {
    type: "StrokeObject",
    props: {
      id,
      position: { x: 10, y: 10 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    },
  });
  await rpc(host, "commitObjects", { objectIds: [id] });
}

describe("CoreWorker 同步接线", () => {
  jest.setTimeout(30000);

  /** @type {Object|null} */
  let server = null;
  /** @type {Object[]} */
  let peers = [];

  afterEach(async () => {
    for (const peer of peers) {
      await peer.coordinator.close();
    }
    peers = [];
    await server?.close();
    server = null;
  });

  test("createBoard 携带 syncUrl 时连接中继并与对等端互相同步", async () => {
    server = createRelayServer({ port: 0 });
    const host = new FakeWorkerHost();
    const runtime = new CoreWorkerRuntime(host);
    runtime.start();

    await rpc(host, "createBoard", {
      width: 800,
      height: 600,
      source: "worker",
      syncUrl: `ws://127.0.0.1:${server.port}`,
      boardId: "test-room",
    });
    expect(server.roomSize("test-room")).toBe(1);

    const peer = await connectPeer("peer", server.port);
    peers = [peer];

    // worker → 对等端
    await createStrokeViaRpc(host, "worker/1");
    await until(
      () => peer.boardCore.getObjectById("worker/1") != null,
      "对等端看到 worker/1",
    );
    // 记录来源为 createBoard 传入的 source
    const records = peer.boardCore.operationLog.toJSON();
    expect(records.some((r) => r.source === "worker")).toBe(true);

    // 对等端 → worker（经 RPC 查询验证对象到达）
    peer.api.createObject("StrokeObject", {
      id: "peer/1",
      position: { x: 100, y: 100 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    });
    await peer.api.commitObjects(["peer/1"]);
    await until(async () => {
      const result = await rpc(host, "queryObjects", { ids: ["peer/1"] });
      return result?.some?.((item) => item?.id === "peer/1") === true;
    }, "worker 看到 peer/1");

    await rpc(host, "destroyBoard");
    await until(
      () => server.roomSize("test-room") === 1,
      "destroyBoard 后 worker 退出房间（仅剩对等端）",
    );
  });

  test("中继不可达时降级离线运行", async () => {
    const host = new FakeWorkerHost();
    const runtime = new CoreWorkerRuntime(host);
    runtime.start();

    // 未监听的端口：连接失败不应阻塞 createBoard
    await rpc(host, "createBoard", {
      width: 800,
      height: 600,
      source: "worker",
      syncUrl: "ws://127.0.0.1:1",
      boardId: "test-room",
    });
    await createStrokeViaRpc(host, "worker/1");
    await rpc(host, "destroyBoard");
  });
});
