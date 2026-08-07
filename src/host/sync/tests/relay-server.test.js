/**
 * @file 同步中继服务器测试
 * @description 验证房间成员管理、记录与事件广播、INIT 定向与房间隔离。
 * @module host/sync/tests/relay-server.test
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";
import { createRelayServer } from "../relay-server.js";

/**
 * 连接一个测试客户端
 * @param {number} port - 服务器端口
 * @returns {Promise<Object>} 客户端句柄
 */
async function connectClient(port) {
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
  return {
    ws,
    messages,
    /**
     * 发送一条消息
     * @param {Object} message - 消息体
     * @returns {void}
     */
    send: (message) => ws.send(JSON.stringify(message)),

    /**
     * 等待满足条件的消息到达
     * @param {Function} predicate - 判定函数
     * @param {number} [timeoutMs=3000] - 超时
     * @returns {Promise<Object>} 命中的消息
     */
    waitFor: async (predicate, timeoutMs = 3000) => {
      const start = Date.now();
      for (;;) {
        const found = messages.find(predicate);
        if (found) return found;
        if (Date.now() - start > timeoutMs) {
          throw new Error(`waitFor 超时：${JSON.stringify(messages)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },

    /**
     * 关闭连接
     * @returns {Promise<void>}
     */
    close: () =>
      new Promise((resolve) => {
        ws.addEventListener("close", resolve, { once: true });
        ws.close();
      }),
  };
}

/**
 * 连接并加入房间
 * @param {number} port - 服务器端口
 * @param {string} boardId - 板 id
 * @param {string} source - 来源标识
 * @returns {Promise<Object>} 客户端句柄
 */
async function joinClient(port, boardId, source) {
  const client = await connectClient(port);
  client.send({ type: "join", boardId, source });
  await client.waitFor((m) => m.type === "joined");
  return client;
}

describe("同步中继服务器", () => {
  jest.setTimeout(20000);

  /** @type {{close: () => Promise<void>, port: number}|null} */
  let server = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  test("加入房间收到确认与现有成员列表", async () => {
    server = createRelayServer({ port: 0 });
    const a = await joinClient(server.port, "board-1", "dev-a");
    const b = await joinClient(server.port, "board-1", "dev-b");

    const joined = b.messages.find((m) => m.type === "joined");
    expect(joined.peers).toEqual(["dev-a"]);
    expect(server.roomSize("board-1")).toBe(2);

    // 后到的成员向现有成员广播 peer-joined
    const peerJoined = a.messages.find((m) => m.type === "peer-joined");
    expect(peerJoined.source).toBe("dev-b");

    await a.close();
    await b.close();
  });

  test("records 广播给房间内其他成员并附来源", async () => {
    server = createRelayServer({ port: 0 });
    const a = await joinClient(server.port, "board-1", "dev-a");
    const b = await joinClient(server.port, "board-1", "dev-b");

    a.send({ type: "records", records: [{ id: "dev-a/op-1" }] });

    const received = await b.waitFor((m) => m.type === "records");
    expect(received.source).toBe("dev-a");
    expect(received.records).toEqual([{ id: "dev-a/op-1" }]);

    // 发送者收不到自己的广播
    await expect(
      a.waitFor((m) => m.type === "records", 300),
    ).rejects.toThrow("waitFor 超时");

    await a.close();
    await b.close();
  });

  test("aom 事件与 digest 同样按房间广播", async () => {
    server = createRelayServer({ port: 0 });
    const a = await joinClient(server.port, "board-1", "dev-a");
    const b = await joinClient(server.port, "board-1", "dev-b");

    a.send({ type: "aom", event: { kind: "pickup", ids: ["o1"] } });
    const aom = await b.waitFor((m) => m.type === "aom");
    expect(aom.event).toEqual({ kind: "pickup", ids: ["o1"] });

    a.send({ type: "digest", digest: { logSize: 5 } });
    const digest = await b.waitFor((m) => m.type === "digest");
    expect(digest.digest).toEqual({ logSize: 5 });

    await a.close();
    await b.close();
  });

  test("request-init 广播到其他成员，respond-init 定向只到请求者", async () => {
    server = createRelayServer({ port: 0 });
    const newcomer = await joinClient(server.port, "board-1", "dev-new");
    const holderA = await joinClient(server.port, "board-1", "dev-a");
    const holderB = await joinClient(server.port, "board-1", "dev-b");

    newcomer.send({ type: "request-init" });
    await holderA.waitFor(
      (m) => m.type === "request-init" && m.source === "dev-new",
    );
    await holderB.waitFor(
      (m) => m.type === "request-init" && m.source === "dev-new",
    );

    holderA.send({
      type: "respond-init",
      to: "dev-new",
      records: [{ id: "dev-a/op-1" }],
      meta: { logSize: 1 },
    });
    const response = await newcomer.waitFor((m) => m.type === "respond-init");
    expect(response.source).toBe("dev-a");
    expect(response.records).toEqual([{ id: "dev-a/op-1" }]);

    // 非目标成员收不到定向响应
    await expect(
      holderB.waitFor((m) => m.type === "respond-init", 300),
    ).rejects.toThrow("waitFor 超时");

    await newcomer.close();
    await holderA.close();
    await holderB.close();
  });

  test("不同房间互不可见", async () => {
    server = createRelayServer({ port: 0 });
    const a = await joinClient(server.port, "board-1", "dev-a");
    const b = await joinClient(server.port, "board-2", "dev-b");

    a.send({ type: "records", records: [{ id: "dev-a/op-1" }] });
    await expect(
      b.waitFor((m) => m.type === "records", 300),
    ).rejects.toThrow("waitFor 超时");

    await a.close();
    await b.close();
  });

  test("断开后广播 peer-left 并释放房间", async () => {
    server = createRelayServer({ port: 0 });
    const a = await joinClient(server.port, "board-1", "dev-a");
    const b = await joinClient(server.port, "board-1", "dev-b");

    await b.close();
    const left = await a.waitFor((m) => m.type === "peer-left");
    expect(left.source).toBe("dev-b");

    await a.close();
    await a.waitFor(() => server.roomSize("board-1") === 0).catch(() => {});
    expect(server.roomSize("board-1")).toBe(0);
  });
});
