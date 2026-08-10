/**
 * @file 网络协调器测试
 * @description 真实中继与双端内核下验证操作同步、并发收敛、迟到 INIT、乱序容忍窗与 AOM 远程互斥。
 * @module host/sync/tests/network-coordinator.test
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";
import { BoardApi } from "../../../kernel/api/board-api.js";
import { BoardCore } from "../../../kernel/board/board-core.js";
import { createDefaultAomRenderHooks } from "../../../kernel/board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../../kernel/board/persistence-adapter.js";
import { createRelayServer } from "../relay-server.js";
import { createNetworkCoordinator } from "../network-coordinator.js";

/**
 * 创建一个端（独立的 BoardCore 与 BoardApi）
 * @param {string} source - 端标识
 * @returns {{boardCore: BoardCore, api: BoardApi}} 端
 */
function createEnd(source) {
  const boardCore = new BoardCore({
    width: 800,
    height: 600,
    source,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
  return { boardCore, api: new BoardApi(boardCore) };
}

/**
 * 创建并连接一个端
 * @param {string} source - 端标识
 * @param {number} port - 中继端口
 * @param {string} boardId - 板 id
 * @param {Object} [options={}] - 协调器选项覆盖
 * @returns {Promise<Object>} 已连接端
 */
async function connectEnd(source, port, boardId, options = {}) {
  const end = createEnd(source);
  const coordinator = createNetworkCoordinator({
    boardCore: end.boardCore,
    boardApi: end.api,
    url: `ws://127.0.0.1:${port}`,
    boardId,
    ...options,
  });
  await coordinator.connect();
  return { ...end, coordinator };
}

/**
 * 创建并提交一笔静态笔画
 * @param {BoardApi} api - 内核 API
 * @param {string} id - 对象 id
 * @param {number} [x=0] - 位置 x
 * @returns {Promise<void>}
 */
async function createStroke(api, id, x = 0) {
  api.createObject("StrokeObject", {
    id,
    position: { x, y: 0 },
    property: { width: 2 },
    data: { points: [{ x, y: 0 }, { x: x + 10, y: 0 }] },
  });
  await api.commitObjects([id]);
}

/**
 * 轮询直至条件满足
 * @param {Function} predicate - 判定函数
 * @param {string} label - 条件描述
 * @param {number} [timeoutMs=4000] - 超时
 * @returns {Promise<void>}
 * @description
 * 注意：getObjectById 未命中返回 undefined，判定须用 `!= null`（宽松等）而不是 `!== null`，
 * 否则未命中会被误判为存在。
 */
async function until(predicate, label, timeoutMs = 4000) {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`until 超时：${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

/**
 * 收集端上日志的全部记录 id
 * @param {BoardCore} boardCore - 白板核心
 * @returns {string[]} 记录 id 数组
 */
function logIds(boardCore) {
  return boardCore.operationLog.toJSON().map((record) => record.id);
}

/**
 * 连接一个裸客户端（绕过协调器，手工收发）
 * @param {number} port - 中继端口
 * @param {string} boardId - 板 id
 * @param {string} source - 来源标识
 * @returns {Promise<Object>} 客户端句柄
 */
async function connectRawClient(port, boardId, source) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  /** @type {Object[]} */
  const messages = [];
  ws.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)));
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.send(JSON.stringify({ type: "join", boardId, source }));
  await until(
    () => messages.some((m) => m.type === "joined"),
    "raw joined",
  );
  return {
    messages,
    send: (message) => ws.send(JSON.stringify(message)),
    close: () =>
      new Promise((resolve) => {
        ws.addEventListener("close", resolve, { once: true });
        ws.close();
      }),
  };
}

describe("网络协调器", () => {
  jest.setTimeout(30000);

  /** @type {Object|null} */
  let server = null;
  /** @type {Object[]} */
  let ends = [];

  afterEach(async () => {
    for (const end of ends) {
      await end.coordinator.close();
    }
    ends = [];
    await server?.close();
    server = null;
  });

  test("双端基本同步：增、改、撤销跨端收敛", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1");
    const b = await connectEnd("b", server.port, "board-1");
    ends = [a, b];

    // a 增：b 收敛
    await createStroke(a.api, "a/1");
    await until(
      () => b.boardCore.getObjectById("a/1") != null,
      "b 收到 a/1",
    );

    // b 改（先选择再修改提交）：a 收敛到同位置
    await b.api.addActiveObjects(["a/1"]);
    b.api.modifyObject("a/1", { position: { x: 50, y: 0 } });
    await b.api.commitObjects(["a/1"]);
    await until(
      () => b.boardCore.getObjectById("a/1").position.x === 50,
      "b 本地位置生效",
    );
    await until(
      () => a.boardCore.getObjectById("a/1").position.x === 50,
      "a 收到 b 的修改",
    );

    // a 撤销 b 的修改（显式目标；undo() 缺省为各撤各的，只撤本端节点）
    const bModifyNodeId = a.boardCore.undoTree.head.shareId;
    a.api.undo(bModifyNodeId);
    await until(
      () => a.boardCore.getObjectById("a/1").position.x === 0,
      "a 撤销生效",
    );
    await until(
      () => b.boardCore.getObjectById("a/1").position.x === 0,
      "b 收敛撤销",
    );

    expect(logIds(a.boardCore).sort()).toEqual(logIds(b.boardCore).sort());
  });

  test("并发创建：两端各自新增后互见对方对象", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1");
    const b = await connectEnd("b", server.port, "board-1");
    ends = [a, b];

    await Promise.all([
      createStroke(a.api, "a/1", 0),
      createStroke(b.api, "b/1", 100),
    ]);

    await until(
      () =>
        a.boardCore.getObjectById("b/1") != null &&
        b.boardCore.getObjectById("a/1") != null,
      "双端互见",
    );
    expect(logIds(a.boardCore).sort()).toEqual(logIds(b.boardCore).sort());
  });

  test("迟到加入经 INIT 全量收敛", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1");
    ends = [a];
    await createStroke(a.api, "a/1", 0);
    await createStroke(a.api, "a/2", 20);

    const c = await connectEnd("c", server.port, "board-1");
    ends.push(c);
    await until(
      () => c.boardCore.operationLog.size === 2,
      "c 经 INIT 补齐日志",
    );
    expect(c.boardCore.getObjectById("a/1")).toBeDefined();
    expect(c.boardCore.getObjectById("a/2")).toBeDefined();
  });

  test("乱序记录经容忍窗缓冲整理", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1", {
      windowMs: 100,
    });
    ends = [a];

    // 第三端离线造两条记录，手工乱序投递
    const x = createEnd("x");
    await createStroke(x.api, "x/1", 0);
    await createStroke(x.api, "x/2", 20);
    const [op1, op2] = x.boardCore.operationLog.toJSON();

    const raw = await connectRawClient(server.port, "board-1", "x");
    raw.send({ type: "records", records: [op2] });
    await until(() => a.coordinator.pendingCount === 1, "op-2 入缓冲");
    expect(a.boardCore.getObjectById("x/2")).toBeUndefined();

    raw.send({ type: "records", records: [op1] });
    await until(
      () =>
        a.boardCore.getObjectById("x/1") != null &&
        a.boardCore.getObjectById("x/2") != null,
      "乱序整理后两条都应用",
    );
    expect(a.coordinator.pendingCount).toBe(0);

    await raw.close();
  });

  test("持续乱序超窗后请求全量", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1", {
      windowMs: 50,
      maxWindows: 2,
    });
    ends = [a];

    const x = createEnd("x");
    await createStroke(x.api, "x/1", 0);
    await createStroke(x.api, "x/2", 20);
    const [, op2] = x.boardCore.operationLog.toJSON();

    const raw = await connectRawClient(server.port, "board-1", "x");
    raw.send({ type: "records", records: [op2] });
    // op-1 永远不到：超窗后 a 广播 request-init
    await until(
      () => raw.messages.some((m) => m.type === "request-init"),
      "超窗后请求全量",
      4000,
    );

    await raw.close();
  });

  test("AOM 远程活动跨端互斥：远程 choose 锁定、unchoose 解锁", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1");
    const b = await connectEnd("b", server.port, "board-1");
    ends = [a, b];

    await createStroke(a.api, "a/1");
    await until(
      () => b.boardCore.getObjectById("a/1") != null,
      "b 收到 a/1",
    );

    await a.api.addActiveObjects(["a/1"]);
    await until(
      () => b.boardCore.activeObjectManager.isRemoteActive("a/1"),
      "b 登记远程活动",
    );

    // b 不可擦除远程活跃对象
    const erased = await b.api.eraseData({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      radius: 5,
    });
    expect(erased.deleted).toEqual([]);

    await a.api.discardActiveObjects(["a/1"]);
    await until(
      () => !b.boardCore.activeObjectManager.isRemoteActive("a/1"),
      "b 解锁",
    );
  });

  test("命名选择经中继同步：choose 事件携带 choice", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1");
    const b = await connectEnd("b", server.port, "board-1");
    ends = [a, b];

    await createStroke(a.api, "a/1");
    await until(
      () => b.boardCore.getObjectById("a/1") != null,
      "b 收到 a/1",
    );

    await a.api.addActiveObjects(["a/1"], { choice: "hold" });
    await until(
      () =>
        b.boardCore.activeObjectManager.remoteChoicesOf("a/1").length > 0,
      "b 登记远程命名选择",
    );
    expect(b.boardCore.activeObjectManager.remoteChoicesOf("a/1")).toEqual([
      { source: "a", name: "hold" },
    ]);

    // a 提交后 b 的命名选择注销
    await a.api.commitObjects(["a/1"]);
    await until(
      () => !b.boardCore.activeObjectManager.isRemoteActive("a/1"),
      "b 注销命名选择",
    );
  });

  test("awareness 消息经中继 volatile 转发，不进日志", async () => {
    server = createRelayServer({ port: 0 });
    /** @type {Object[]} */
    const received = [];
    const a = await connectEnd("a", server.port, "board-1");
    const b = await connectEnd("b", server.port, "board-1", {
      onAwareness: (message) => received.push(message),
    });
    ends = [a, b];

    const logSizeBefore = b.boardCore.operationLog.size;
    a.coordinator.sendAwareness({ kind: "cursor", point: { x: 3, y: 4 } });

    await until(() => received.length > 0, "b 收到 awareness");
    expect(received[0]).toEqual({
      source: "a",
      data: { kind: "cursor", point: { x: 3, y: 4 } },
    });
    // volatile：不写日志、不参与收敛
    expect(b.boardCore.operationLog.size).toBe(logSizeBefore);

    // peer-left 也以 awareness 形式通知（光标清场用）
    await a.coordinator.close();
    await until(
      () => received.some((m) => m.data?.kind === "peer-left"),
      "b 收到 peer-left 通知",
    );
  });

  test("摘要分歧触发全量重建请求", async () => {
    server = createRelayServer({ port: 0 });
    const a = await connectEnd("a", server.port, "board-1");
    ends = [a];

    const raw = await connectRawClient(server.port, "board-1", "watcher");
    raw.send({
      type: "digest",
      digest: { logSize: 999, head: "watcher/op-999", objects: 0 },
    });
    await until(
      () =>
        raw.messages.some(
          (m) => m.type === "request-init",
        ),
      "摘要落后触发 request-init",
    );

    await raw.close();
  });
});
