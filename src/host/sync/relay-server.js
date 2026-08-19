/**
 * @file 同步中继服务器
 * @description 按板房间组织的 WebSocket 无状态中继：成员管理、消息转发、INIT 定向、心跳踢幽灵；不缓存任何记录。
 * @module host/sync/relay-server
 * @author Zhou Chenyu
 */

import { WebSocketServer } from "ws";

/**
 * 中继消息协议（JSON over WebSocket）
 *
 * 客户端 → 服务器：
 * - `{type:"join", boardId, source}` 加入房间
 * - `{type:"records", records:[]}` 操作记录广播
 * - `{type:"aom", event:{}}` AOM 活动事件广播
 * - `{type:"awareness", data:{}}` awareness 广播（volatile：可丢、不进日志不参与收敛）
 * - `{type:"request-init", lastSeen?, openMols?}` 请求增量日志（无 lastSeen 为全量；openMols 为未闭合分子清单，供对端对账重放）
 * - `{type:"respond-init", to, records, openMols?}` 定向全量响应
 * - `{type:"digest", digest}` 周期状态摘要
 *
 * 服务器 → 客户端：
 * - `{type:"joined", source, peers:[]}` 加入确认与成员列表
 * - `{type:"peer-joined", source}` / `{type:"peer-left", source}` 成员变动
 * - `{type:"records", source, records:[]}` 记录转发（附来源）
 * - `{type:"aom", source, event:{}}` AOM 事件转发
 * - `{type:"awareness", source, data:{}}` awareness 转发
 * - `{type:"request-init", source, lastSeen?, openMols?}` 增量请求转发
 * - `{type:"respond-init", source, records, openMols?}` 全量响应转发（定向）
 * - `{type:"digest", source, digest}` 摘要转发
 *
 * 连接管理：
 * - 心跳：服务器按 heartbeatMs 周期 ping 全部连接，一轮未回 pong 的连接被 terminate
 *   （走与 close 相同的移出路径，广播 peer-left）；ws 客户端与浏览器/undici WebSocket
 *   均按协议自动回 pong，正常端无感
 * - 同 source 重复 join：踢旧迎新——旧连接被 terminate（不广播 peer-left，由新连接的
 *   peer-joined 覆盖成员关系），合法重连可快速顶替半开死连接
 * - 默认绑定 127.0.0.1（仅本机）；显式传 host 才绑其他接口
 */

/**
 * 校验非空字符串字段
 * @param {*} value - 待校验值
 * @returns {boolean} 是否合法
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * 向单个连接发送消息
 * @param {WebSocket} ws - 连接
 * @param {Object} message - 消息体
 * @returns {void}
 */
function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * 创建同步中继服务器
 * @param {Object} [options={}] - 服务器选项
 * @param {number} [options.port=0] - 监听端口（0 为随机）
 * @param {string} [options.host="127.0.0.1"] - 监听地址（默认仅本机；跨设备需显式传 "0.0.0.0"）
 * @param {number} [options.heartbeatMs=30000] - 心跳间隔毫秒数（<=0 关闭心跳）；一轮未回 pong 的连接被 terminate
 * @returns {{ready: Promise<void>, port: number, address: () => Object|string|null, close: () => Promise<void>, roomSize: (boardId: string) => number}} 服务器句柄
 *
 * @description
 * 无状态纯转发：房间成员管理、房间内广播（不回发发送者）、request-init 广播、
 * respond-init 定向。记录本身不经服务器缓存；迟到与离线合并由各端重连对账负责。
 */
function createRelayServer(options = {}) {
  const heartbeatMs = options.heartbeatMs ?? 30000;
  const wss = new WebSocketServer({
    port: options.port ?? 0,
    host: options.host ?? "127.0.0.1",
  });
  /**
   * 监听就绪承诺：显式 host 时绑定经 DNS 查找为异步，就绪前 port/address 不可用
   * @type {Promise<void>}
   */
  const ready = new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  /**
   * 房间表
   * @type {Map<string, Map<string, WebSocket>>}
   */
  const rooms = new Map();

  /**
   * 向房间内除排除者外全部成员广播
   * @param {Map<string, WebSocket>} room - 房间
   * @param {string|null} exceptSource - 排除的来源
   * @param {Object} message - 消息体
   * @returns {void}
   */
  const broadcast = (room, exceptSource, message) => {
    for (const [source, ws] of room) {
      if (source === exceptSource) continue;
      send(ws, message);
    }
  };

  /**
   * 移出连接并广播离开
   * @param {WebSocket} ws - 连接
   * @returns {void}
   */
  const removeConnection = (ws) => {
    if (!ws.boardId || !ws.source) return;
    const room = rooms.get(ws.boardId);
    if (!room) return;
    if (room.get(ws.source) !== ws) return;
    room.delete(ws.source);
    broadcast(room, null, { type: "peer-left", source: ws.source });
    if (room.size === 0) {
      rooms.delete(ws.boardId);
    }
  };

  /**
   * 处理已加入房间后的业务消息
   * @param {WebSocket} ws - 连接
   * @param {Object} message - 已解析消息
   * @returns {void}
   */
  const handleRoomMessage = (ws, message) => {
    const room = rooms.get(ws.boardId);
    if (!room) return;
    switch (message.type) {
      case "records":
        if (!Array.isArray(message.records)) return;
        broadcast(room, ws.source, {
          type: "records",
          source: ws.source,
          records: message.records,
        });
        return;
      case "aom":
        if (message.event === undefined || message.event === null) return;
        broadcast(room, ws.source, {
          type: "aom",
          source: ws.source,
          event: message.event,
        });
        return;
      case "awareness":
        // volatile 通道：纯转发，无确认无重发无缓存
        if (message.data === undefined || message.data === null) return;
        broadcast(room, ws.source, {
          type: "awareness",
          source: ws.source,
          data: message.data,
        });
        return;
      case "request-init":
        broadcast(room, ws.source, {
          type: "request-init",
          source: ws.source,
          ...(message.lastSeen && typeof message.lastSeen === "object"
            ? { lastSeen: message.lastSeen }
            : {}),
          ...(Array.isArray(message.openMols)
            ? { openMols: message.openMols }
            : {}),
        });
        return;
      case "respond-init": {
        if (!isNonEmptyString(message.to)) return;
        const target = room.get(message.to);
        if (!target) return;
        send(target, {
          type: "respond-init",
          source: ws.source,
          records: message.records,
          ...(Array.isArray(message.openMols)
            ? { openMols: message.openMols }
            : {}),
        });
        return;
      }
      case "digest":
        broadcast(room, ws.source, {
          type: "digest",
          source: ws.source,
          digest: message.digest,
        });
        return;
      default:
        return;
    }
  };

  wss.on("connection", (ws) => {
    // 心跳存活标记：每轮 ping 前置 false，收到 pong 置回 true
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!message || typeof message.type !== "string") return;

      if (!ws.source) {
        // 首条消息必须是 join
        if (
          message.type !== "join" ||
          !isNonEmptyString(message.boardId) ||
          !isNonEmptyString(message.source)
        ) {
          return;
        }
        ws.boardId = message.boardId;
        ws.source = message.source;
        let room = rooms.get(message.boardId);
        if (!room) {
          room = new Map();
          rooms.set(message.boardId, room);
        }
        // 同 source 踢旧迎新：先落新连接再 terminate 旧连接，
        // 旧连接的 close 因房间表已易主而不再广播 peer-left
        const previous = room.get(message.source);
        const peers = [...room.keys()].filter((s) => s !== message.source);
        room.set(message.source, ws);
        if (previous && previous !== ws) {
          previous.terminate();
        }
        send(ws, { type: "joined", source: message.source, peers });
        broadcast(room, message.source, {
          type: "peer-joined",
          source: message.source,
        });
        return;
      }

      handleRoomMessage(ws, message);
    });
    ws.on("close", () => removeConnection(ws));
    ws.on("error", () => removeConnection(ws));
  });

  /**
   * 心跳定时器：一轮未回 pong 的连接 terminate（经 close 走 removeConnection 广播 peer-left），
   * 存活连接置假后 ping 一轮；幽灵连接（进程被杀、网络分区等半开状态）借此及时清出房间
   * @type {NodeJS.Timeout|null}
   */
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          for (const ws of wss.clients) {
            if (!ws.isAlive) {
              ws.terminate();
              continue;
            }
            ws.isAlive = false;
            ws.ping();
          }
        }, heartbeatMs)
      : null;

  return {
    /**
     * 监听就绪承诺（ready 前 port/address 不可用）
     * @type {Promise<void>}
     */
    ready,

    /**
     * 实际监听端口
     * @type {number}
     */
    get port() {
      const address = wss.address();
      return typeof address === "object" && address !== null ? address.port : 0;
    },

    /**
     * 实际监听地址（net.Server.address() 原样返回）
     * @returns {Object|string|null} 地址信息
     */
    address() {
      return wss.address();
    },

    /**
     * 查询房间成员数
     * @param {string} boardId - 板 id
     * @returns {number} 成员数
     */
    roomSize(boardId) {
      return rooms.get(boardId)?.size ?? 0;
    },

    /**
     * 关闭服务器并断开全部连接
     * @returns {Promise<void>}
     */
    close() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      for (const ws of wss.clients) {
        ws.terminate();
      }
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

export { createRelayServer };
