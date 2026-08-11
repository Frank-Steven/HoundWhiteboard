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
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** daemon 描述文件名（写在板目录下，供 CLI 自动发现） */
const DAEMON_FILE = ".daemon.json";

/**
 * 活动 daemon 全局引用路径（CLI 免路径时据此定位当前 daemon；可用 HWB_DAEMON_REF 覆盖，测试隔离用）
 * @returns {string} 引用文件路径
 */
function activeDaemonFile() {
  return (
    process.env.HWB_DAEMON_REF ??
    path.join(os.homedir(), ".hound-whiteboard", "daemon.json")
  );
}

/**
 * 读取活动 daemon 引用的板目录
 * @returns {Promise<string|null>} 板目录；无活动 daemon 时为 null
 */
async function readActiveDaemonRoot() {
  try {
    const text = await fs.readFile(activeDaemonFile(), "utf-8");
    const desc = JSON.parse(text);
    return typeof desc?.rootPath === "string" ? desc.rootPath : null;
  } catch {
    return null;
  }
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
 * @param {string} options.rootPath - 板目录（必须是既有板）
 * @param {string} [options.source] - 协作身份；省略时用设备自动身份
 * @param {string} [options.boardId] - 中继房间 id；省略时用板目录路径
 * @param {string} [options.relayUrl] - 中继地址；省略时 daemon 不参与协作
 * @param {number} [options.port=0] - 监听端口（0 为随机）
 * @param {string} [options.host="127.0.0.1"] - 监听地址
 * @returns {Promise<{port: number, source: string, close: Function}>} daemon 句柄
 *
 * @description
 * 启动后在板目录写入 `.daemon.json`（pid/port/source/boardId），CLI 据此自动发现并连接。
 * 板目录已有活 daemon（描述文件指向可连通的端口）时拒绝重复启动。
 */
async function startBoardDaemon(options) {
  const rootPath = options?.rootPath;
  if (typeof rootPath !== "string" || rootPath.trim() === "") {
    throw new Error("缺少板目录路径。");
  }

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

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      void handleRpcMessage(session, ws, data);
    });
  });

  const desc = {
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
  // 全局活动引用：CLI 免路径时据此连接当前 daemon
  await fs.mkdir(path.dirname(activeDaemonFile()), { recursive: true });
  await fs.writeFile(
    activeDaemonFile(),
    JSON.stringify({ ...desc, rootPath }, null, 2),
    "utf-8",
  );

  const close = async () => {
    closed = true;
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
    await fs.rm(activeDaemonFile(), { force: true });
  };

  return { port, source, close };
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
      // 响应前落盘：daemon 崩溃不丢操作；客户端回退文件模式时也能读到最新数据
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

/**
 * 探测端口上是否有活 daemon
 * @param {number} port - 端口
 * @returns {Promise<boolean>} 是否可连通
 * @private
 */
function isDaemonAlive(port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (alive) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* 忽略 */
      }
      resolve(alive);
    };
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => finish(false), 500);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      finish(true);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

export { startBoardDaemon, readDaemonDescriptor, readActiveDaemonRoot, DAEMON_FILE };
