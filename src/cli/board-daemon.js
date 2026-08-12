/**
 * @file 板 daemon
 * @description 常驻进程持有板（BoardCore + BoardApi + 日志跟随者落盘），经 WebSocket 提供 BoardApi RPC，可选连中继参与协作。
 * @module cli/board-daemon
 * @author Zhou Chenyu
 */

import { WebSocketServer } from "ws";
import { openBoardSession } from "./board-session.js";
import { BOARD_API_ROUTES } from "../kernel/api/board-api-routes.js";
import { createNetworkCoordinator } from "../host/sync/network-coordinator.js";
import { createAmendForwarder } from "../host/sync/amend-forwarder.js";
import { resolveDeviceSource } from "../utils/device-identity.js";
import {
  isValidDaemonName,
  writeEntry,
  removeEntry,
  readEntry,
  isDaemonAlive,
} from "./daemon-registry.js";
import fs from "node:fs/promises";
import path from "node:path";

/** daemon 描述文件名（写在板目录下，标记板被哪个 daemon 持有） */
const DAEMON_FILE = ".daemon.json";

/**
 * 创建串行任务队列
 * @returns {{enqueue: Function, drain: Function}} 队列操作面
 *
 * @description
 * 队列保证前一条任务（RPC 的 invoke+落盘）完成后才执行下一条：并发客户端到达的
 * 异步方法（addObject/commitObjects 等内部有真实 await 让出）不会交错执行。
 * 单条失败不中断队列（错误已在任务内转为响应或日志）。
 */
function createQueue() {
  /** @type {Promise<void>} 队列尾链 */
  let tail = Promise.resolve();
  return {
    /**
     * 将任务排入队尾
     * @param {() => Promise<void>} task - 任务
     * @returns {Promise<void>} 任务结果
     */
    enqueue(task) {
      const run = tail.then(task);
      tail = run.catch(() => {});
      return run;
    },
    /**
     * 排空：等待全部已入队任务完成
     * @returns {Promise<void>}
     */
    drain() {
      return tail;
    },
  };
}

/**
 * 读取板目录下的 daemon 描述文件
 * @param {string} rootPath - 板目录
 * @returns {Promise<Object|null>} 描述；不存在或非法时为 null
 */
async function readDaemonDescriptor(rootPath) {
  try {
    const text = await fs.readFile(path.join(rootPath, DAEMON_FILE), "utf-8");
    const desc = JSON.parse(text);
    if (typeof desc?.port !== "number" || typeof desc?.source !== "string") {
      return null;
    }
    return desc;
  } catch {
    return null;
  }
}

/**
 * 启动板 daemon
 * @param {Object} options - 启动选项
 * @param {string} options.name - daemon 名（注册表唯一标识，不可与存活 daemon 重复）
 * @param {string} options.rootPath - 板目录（必须是既有板）
 * @param {string} [options.source] - 协作身份；省略时用设备自动身份
 * @param {string} [options.boardId] - 中继房间 id；省略时用板目录路径
 * @param {string} [options.relayUrl] - 中继地址；省略时 daemon 不参与协作
 * @param {number} [options.port=0] - 监听端口（0 为随机）
 * @param {string} [options.host="127.0.0.1"] - 监听地址
 * @returns {Promise<{name: string, rootPath: string, port: number, source: string, close: Function}>} daemon 句柄
 *
 * @description
 * 启动后登记注册表（~/.hound-whiteboard/daemons/<name>.json）并在板目录写入
 * `.daemon.json`（name/pid/port/source/boardId）。name 与存活 daemon 重复、
 * 板目录已被其它活 daemon 持有时拒绝启动。
 */
async function startBoardDaemon(options) {
  const name = options?.name;
  if (!isValidDaemonName(name)) {
    throw new Error(
      `非法 daemon name：${name}（仅允许字母/数字/.-_，不能重复）。`,
    );
  }
  const rootPath = options?.rootPath;
  if (typeof rootPath !== "string" || rootPath.trim() === "") {
    throw new Error("缺少板目录路径。");
  }

  // name 查重：注册表同名且存活的 daemon 拒绝启动；僵尸条目可覆盖
  const registered = await readEntry(name);
  if (registered !== null && (await isDaemonAlive(registered.port))) {
    throw new Error(
      `daemon ${name} 已在运行（板目录 ${registered.rootPath}，端口 ${registered.port}）。`,
    );
  }
  // 板目录占用检查：同一板目录只能被一个活 daemon 持有
  const existing = await readDaemonDescriptor(rootPath);
  if (existing && (await isDaemonAlive(existing.port))) {
    throw new Error(
      `板目录已有 daemon 在运行（端口 ${existing.port}，身份 ${existing.source}）。`,
    );
  }

  const source =
    typeof options.source === "string" && options.source !== ""
      ? options.source
      : resolveDeviceSource();
  const session = await openBoardSession(rootPath, { source });

  // 可选连中继：失败降级单机并每 3s 自动重试（中继可能后于 daemon 启动）；断线后同周期自动重连
  let coordinator = null;
  let amendForwarder = null;
  let relayRetryTimer = null;
  /** @type {boolean} daemon 已关闭：关闭后到达的 onDisconnect 不得再调度重试 */
  let closed = false;
  const scheduleRelayRetry = () => {
    if (closed) return;
    if (relayRetryTimer !== null) return;
    relayRetryTimer = setTimeout(() => {
      relayRetryTimer = null;
      void connectRelay();
    }, 3000);
  };
  const connectRelay = async () => {
    if (closed) return;
    const next = createNetworkCoordinator({
      boardCore: session.boardCore,
      boardApi: session.api,
      url: options.relayUrl,
      boardId: options.boardId ?? rootPath,
      onDisconnect: () => scheduleRelayRetry(),
    });
    try {
      await next.connect();
      coordinator = next;
      amendForwarder?.close();
      amendForwarder = createAmendForwarder({
        boardCore: session.boardCore,
        sendAwareness: (data) => coordinator?.sendAwareness(data),
      });
      relayRetryTimer = null;
      console.log(
        `[daemon] 已连接中继：${options.relayUrl}（房间 ${options.boardId ?? rootPath}）`,
      );
    } catch {
      // 失败实例的日志订阅已挂上：清理后再调度重试，避免累积空转订阅
      await next.close();
      scheduleRelayRetry();
    }
  };
  if (options.relayUrl) {
    try {
      await connectRelay();
      if (coordinator === null) {
        console.warn(`[daemon] 中继连接失败，按单机模式运行并每 3s 重试`);
      }
    } catch (error) {
      console.warn(
        `[daemon] 中继连接失败（${error?.message ?? error}），按单机模式运行并每 3s 重试`,
      );
    }
  }

  const wss = new WebSocketServer({
    port: options.port ?? 0,
    host: options.host ?? "127.0.0.1",
  });
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  const port = wss.address().port;

  // RPC 串行队列：并发客户端的写操作经队列逐个执行，invoke 与落盘不交错
  const queue = createQueue();
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message?.route === "daemon-shutdown") {
        // 管理停机：响应后异步关闭（close 内部排空既有 RPC），不入队列避免自死锁
        ws.send(JSON.stringify({ id: message.id, ok: true, result: null }));
        void (async () => {
          await close();
          process.exit(0);
        })();
        return;
      }
      queue.enqueue(() => handleRpcMessage(session, ws, data));
    });
  });

  const desc = {
    name,
    rootPath,
    pid: process.pid,
    port,
    source,
    boardId: options.boardId ?? null,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(rootPath, DAEMON_FILE),
    JSON.stringify(desc, null, 2),
    "utf-8",
  );
  // 注册表登记：CLI 按 name 定位 daemon
  await writeEntry(desc);

  const close = async () => {
    closed = true;
    // 排空 in-flight RPC：关闭前最后一次落盘不截断
    await queue.drain();
    if (relayRetryTimer !== null) {
      clearTimeout(relayRetryTimer);
      relayRetryTimer = null;
    }
    for (const ws of wss.clients) {
      try {
        ws.close();
      } catch {
        /* 忽略单个客户端关闭失败 */
      }
    }
    await new Promise((resolve) => wss.close(resolve));
    amendForwarder?.close();
    if (coordinator) {
      await coordinator.close();
    }
    await session.flush();
    await session.close();
    await fs.rm(path.join(rootPath, DAEMON_FILE), { force: true });
    await removeEntry(name);
  };

  return { name, rootPath, port, source, close };
}

/**
 * 分发一条 RPC 消息（BoardApi routes + flush 落盘）
 * @param {Object} session - 板会话
 * @param {Object} ws - WebSocket 连接
 * @param {*} data - 原始消息
 * @returns {Promise<void>}
 * @private
 */
async function handleRpcMessage(session, ws, data) {
  let message;
  try {
    message = JSON.parse(String(data));
  } catch {
    return;
  }
  const { id, route, params } = message ?? {};
  if (typeof id !== "number" || typeof route !== "string") {
    return;
  }
  const entry = BOARD_API_ROUTES[route];
  if (!entry) {
    ws.send(JSON.stringify({ id, ok: false, error: `未知 route：${route}` }));
    return;
  }
  try {
    const result = await entry.invoke(session.api, params ?? {});
    if (entry.flush === "sync" || entry.flush === "async") {
      // 响应前落盘：daemon 崩溃不丢操作；读命令直读时也能读到最新数据
      await session.flush();
    }
    ws.send(JSON.stringify({ id, ok: true, result: result ?? null }));
  } catch (error) {
    ws.send(
      JSON.stringify({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export { startBoardDaemon, readDaemonDescriptor, DAEMON_FILE, isDaemonAlive };
