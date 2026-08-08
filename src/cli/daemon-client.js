/**
 * @file daemon 客户端
 * @description 连接板 daemon 的 WebSocket RPC 客户端；提供与 BoardApi 同契约的会话面。
 * @module cli/daemon-client
 * @author Zhou Chenyu
 */

import { readDaemonDescriptor } from "./board-daemon.js";

/** 单次调用的超时毫秒数 */
const INVOKE_TIMEOUT_MS = 10000;
/** 连接 daemon 的超时毫秒数（daemon 繁忙时握手可能较慢，误判僵尸会回退文件模式读到未落盘的旧数据） */
const CONNECT_TIMEOUT_MS = 5000;

/**
 * 连接板目录下的 daemon
 * @param {string} rootPath - 板目录
 * @returns {Promise<Object|null>} 会话面（api/source/close）；无活 daemon 时为 null
 *
 * @description
 * 读取板目录 `.daemon.json` 自动发现 daemon；连接失败（僵尸描述文件）时返回 null，
 * 调用方回退文件直读直写模式。会话面 api 的方法与 BoardApi 同契约，经 RPC 转发。
 */
async function connectDaemon(rootPath) {
  const desc = await readDaemonDescriptor(rootPath);
  if (!desc) return null;

  const ws = await new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${desc.port}`);
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* 忽略 */
      }
      resolve(null);
    }, CONNECT_TIMEOUT_MS);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  if (!ws) return null;

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const entry = pending.get(message?.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) {
      entry.resolve(message.result);
    } else {
      entry.reject(new Error(message.error ?? "daemon 调用失败"));
    }
  });

  /**
   * 发送一次 RPC 调用
   * @param {string} route - route 名
   * @param {Object} [params={}] - 参数
   * @returns {Promise<*>} 结果
   */
  function invoke(route, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`daemon 调用超时：${route}`));
      }, INVOKE_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, route, params }));
    });
  }

  return {
    source: desc.source,
    api: {
      addObject: (type, props) => invoke("addObject", { type, props }),
      deleteObjects: (ids) => invoke("deleteObjects", { objectIds: ids }),
      undo: () => invoke("undo", {}),
      redo: () => invoke("redo", {}),
      queryBoardInfo: () => invoke("queryBoardInfo", {}),
      queryObjectList: () => invoke("queryObjectList", {}),
      queryObject: (objectId) => invoke("queryObject", { objectId }),
    },
    close() {
      try {
        ws.close();
      } catch {
        /* 忽略 */
      }
    },
  };
}

export { connectDaemon };
