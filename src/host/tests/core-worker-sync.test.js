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
import { createSubframeForwarder } from "../sync/subframe-forwarder.js";
import { installNoopOffscreenCanvas } from "../../test-support/noop-canvas.js";

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

  test("中继断线后自动重连并补齐离线期间的操作", async () => {
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
    const peer = await connectPeer("peer", server.port);
    peers = [peer];

    // 中继下线：worker 离线编辑（不入对端）
    const port = server.port;
    await server.close();
    server = null;
    await createStrokeViaRpc(host, "worker/offline-1");
    expect(peer.boardCore.getObjectById("worker/offline-1")).toBeUndefined();

    // 中继在原地址恢复：worker 每 3s 自动重连，增量补发离线记录
    server = createRelayServer({ port });
    const peer2 = await connectPeer("peer", port);
    peers.push(peer2);
    // 重连后 peer 端重新加入同一房间并请求增量（worker 响应后补齐）；
    // 重连定时器 3s，并行负载下放宽等待窗口
    const start = Date.now();
    for (;;) {
      if (peer2.boardCore.getObjectById("worker/offline-1") != null) break;
      if (Date.now() - start > 10000) {
        throw new Error("until 超时：对等端补齐 worker 离线记录");
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await rpc(host, "destroyBoard");
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

  test("中继地址无响应（挂起无事件）时按连接超时降级", async () => {
    // 模拟向死地址发 SYN 的挂死套接字：永不触发任何事件
    class HangingWebSocket {
      constructor() {
        this.readyState = 0;
      }
      addEventListener() {}
      send() {}
      close() {
        this.readyState = 3;
      }
    }

    const boardCore = new BoardCore({
      width: 800,
      height: 600,
      source: "hang-test",
      aomRenderHooks: createDefaultAomRenderHooks(),
      persistenceAdapter: createDefaultPersistenceAdapter(),
    });
    const coordinator = createNetworkCoordinator({
      boardCore,
      boardApi: new BoardApi(boardCore),
      url: "ws://192.0.2.1:8377", // TEST-NET-1 保留地址，不可达
      boardId: "test-room",
      connectTimeoutMs: 100,
      WebSocketImpl: HangingWebSocket,
    });

    await expect(coordinator.connect()).rejects.toThrow("中继连接超时");
  });

  test("远程中间帧驱动渲染器预览坐标，commit 后清除", async () => {
    const restoreCanvas = installNoopOffscreenCanvas();
    try {
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
      await rpc(host, "createViewport", {
        options: { viewportId: "v1", width: 800, height: 600 },
      });

      const peer = await connectPeer("peer", server.port);
      peers = [peer];

      // 基线对象同步到双端
      peer.api.createObject("StrokeObject", {
        id: "peer/1",
        position: { x: 10, y: 10 },
        property: { width: 2 },
        data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      });
      await peer.api.commitObjects(["peer/1"]);
      await until(
        () =>
          rpc(host, "queryObjects", { ids: ["peer/1"] }).then(
            (r) => r?.some?.((item) => item?.id === "peer/1") === true,
          ),
        "worker 看到 peer/1",
      );

      // peer 选择并拖动：中间帧经 volatile 通道到达 worker
      // （渲染侧预览应用由 renderer 单测覆盖；此处验证集成链路收到并转发）
      const peerForwarder = createSubframeForwarder({
        boardCore: peer.boardCore,
        sendAwareness: (data) => peer.coordinator.sendAwareness(data),
        intervalMs: 20,
      });
      await peer.api.addActiveObjects(["peer/1"]);
      peer.api.modifyObject("peer/1", { position: { x: 60, y: 0 } });
      await until(
        () => {
          const message = host.postedMessages.find(
            (m) =>
              m.type === "awareness" &&
              m.awarenessType === "subframe" &&
              Array.isArray(m.data?.ops),
          );
          return (
            message?.data?.ops?.some(
              (o) =>
                o.objectId === "peer/1" && o.patch?.position?.x === 60,
            ) === true
          );
        },
        "worker 收到并转发 subframe 中间帧",
      );

      // peer 提交：终点帧到达 worker（预览清理的触发信号）
      await peer.api.commitObjects(["peer/1"]);
      await until(
        () => {
          const message = host.postedMessages
            .filter((m) => m.type === "awareness" && m.awarenessType === "subframe")
            .at(-1);
          return (
            message?.data?.ops?.some(
              (o) => o.objectId === "peer/1" && o.end === true,
            ) === true
          );
        },
        "worker 收到手势终点帧",
      );
      await rpc(host, "destroyBoard");
      peerForwarder.close();
    } finally {
      restoreCanvas();
    }
  });
});
