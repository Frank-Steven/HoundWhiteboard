/**
 * @file 同步中继服务器
 * @description 按板房间组织的 WebSocket 无状态中继：成员管理、消息转发、INIT 定向；不缓存任何记录。
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
 * - `{type:"respond-init", to, records, meta, openMols?}` 定向全量响应
 * - `{type:"digest", digest}` 周期状态摘要
 *
 * 服务器 → 客户端：
 * - `{type:"joined", source, peers:[]}` 加入确认与成员列表
 * - `{type:"peer-joined", source}` / `{type:"peer-left", source}` 成员变动
 * - `{type:"records", source, records:[]}` 记录转发（附来源）
 * - `{type:"aom", source, event:{}}` AOM 事件转发
 * - `{type:"awareness", source, data:{}}` awareness 转发
 * - `{type:"request-init", source, lastSeen?, openMols?}` 增量请求转发
 * - `{type:"respond-init", source, records, meta, openMols?}` 全量响应转发（定向）
 * - `{type:"digest", source, digest}` 摘要转发
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
 * @param {string} [options.host] - 监听地址
 * @returns {{port: number, close: () => Promise<void>, roomSize: (boardId: string) => number}} 服务器句柄
 *
 * @description
 * 无状态纯转发：房间成员管理、房间内广播（不回发发送者）、request-init 广播、
 * respond-init 定向。记录本身不经服务器缓存；迟到与离线合并由各端重连对账负责。
 */
function createRelayServer(options = {}) {
  const wss = new WebSocketServer({ port: options.port ?? 0, host: options.host });
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
          meta: message.meta,
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
        const peers = [...room.keys()];
        room.set(message.source, ws);
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

  return {
    /**
     * 实际监听端口
     * @type {number}
     */
    get port() {
      const address = wss.address();
      return typeof address === "object" && address !== null ? address.port : 0;
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
      for (const ws of wss.clients) {
        ws.terminate();
      }
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

export { createRelayServer };
