/**
 * @file Core Worker 持久化接线测试
 * @description 验证 worker 组合根的持久化装配：tauri driver 经主线程转发落地，重开后会话恢复，撤销历史穿越重开。
 * @author Zhou Chenyu
 */

import { CoreWorkerRuntime } from "../core-worker.js";
import { createMemoryDriver } from "../../io/driver/memory.js";
import { startBoardDaemon } from "../../cli/board-daemon.js";
import { openBoardSession } from "../../cli/board-session.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 测试用假 Worker 宿主（io-invoke 由内存驱动模拟的"Rust 侧"应答）
 * @class
 */
class FakeWorkerHost {
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
   * @constructor
   */
  constructor() {
    this.postedMessages = [];
    this.listeners = new Map();
  }

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
   * 注销事件监听器
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
   * 向宿主注入一条消息
   * @param {Object} message - 要注入的消息
   * @returns {void}
   */
  emit(message) {
    for (const handler of this.listeners.get("message") ?? []) {
      handler({ data: message });
    }
  }
}

/**
 * 创建内存文件系统模拟的 Rust command 处理器
 * @returns {{ handler: (command: string, args: Object) => Promise<*>, driver: Object }} 处理器与底层驱动
 */
function createMemoryCommandHandler() {
  const driver = createMemoryDriver({ rootId: "mem" });
  const handler = async (command, args) => {
    switch (command) {
      case "safe_io_register_root":
        // Rust 侧返回纯字符串 root_id（与真实 command 行为一致）
        return "mem";
      case "safe_io_unregister_root":
        return true;
      case "safe_io_fs_read":
        return driver.read(args.rootId, args.relPath);
      case "safe_io_fs_write":
        return driver.write(args.rootId, args.relPath, args.content);
      case "safe_io_fs_ls":
        return driver.ls(args.rootId, args.relPath);
      case "safe_io_fs_stat":
        return driver.stat(args.rootId, args.relPath);
      case "safe_io_fs_exists":
        return driver.exists(args.rootId, args.relPath);
      case "safe_io_fs_rm":
        return driver.rm(args.rootId, args.relPath);
      case "safe_io_fs_mv":
        return driver.mv(args.rootId, args.srcRel, args.destRel);
      case "safe_io_fs_mkdir":
        return driver.mkdir(args.rootId, args.relPath);
      default:
        throw new Error(`unknown command ${command}`);
    }
  };
  return { handler, driver };
}

/** RPC 消息序号 */
let msgSeq = 0;

/**
 * 发送 RPC 并等待响应（期间泵送全部 io-invoke 转发）
 * @param {FakeWorkerHost} host - 假宿主
 * @param {(command: string, args: Object) => Promise<*>} handler - Rust command 处理器
 * @param {string} method - RPC 方法名
 * @param {Object} [params] - RPC 参数
 * @returns {Promise<*>} RPC 结果
 */
async function rpcCall(host, handler, method, params = {}) {
  const msgId = `t-${++msgSeq}`;
  host.emit({ type: "rpc", msgId, method, params });
  for (let i = 0; i < 200; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const message of host.postedMessages) {
      if (message.type !== "io-invoke" || message.__handled) continue;
      message.__handled = true;
      try {
        const result = await handler(message.command, message.args);
        host.emit({ type: "io-response", msgId: message.msgId, ok: true, result });
      } catch (error) {
        host.emit({
          type: "io-response",
          msgId: message.msgId,
          ok: false,
          error: String(error?.message ?? error),
        });
      }
    }
    const response = host.postedMessages.find(
      (m) => m.type === "rpc-response" && m.msgId === msgId,
    );
    if (response) {
      if (response.error) throw new Error(response.error.message);
      return response.result;
    }
  }
  throw new Error(`rpc ${method} 超时`);
}

/**
 * 创建一笔静态笔画
 * @param {FakeWorkerHost} host - 假宿主
 * @param {Function} handler - Rust command 处理器
 * @param {string} id - 对象 id
 * @returns {Promise<void>}
 */
async function createStroke(host, handler, id) {
  await rpcCall(host, handler, "createObject", {
    type: "StrokeObject",
    props: {
      id,
      position: { x: 0, y: 0 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    },
  });
  await rpcCall(host, handler, "commitObjects", { objectIds: [id] });
}

/**
 * 轮询等待条件成立
 * @param {Function} probe - 探测函数
 * @param {number} [timeoutMs=2000] - 超时毫秒数
 * @returns {Promise<boolean>} 是否成立
 */
async function waitFor(probe, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

/**
 * 装配协作模式的 runtime：真 daemon（持板落盘）+ mock 盘预置 .daemon.json（探测命中，不 spawn）
 * @returns {{ host: FakeWorkerHost, runtime: CoreWorkerRuntime, handler: Function, driver: Object, daemon: Object, boardDir: string }} 测试上下文
 */
async function setup() {
  const host = new FakeWorkerHost();
  const runtime = new CoreWorkerRuntime(host);
  runtime.start();
  const { handler, driver } = createMemoryCommandHandler();
  // 真 daemon：临时板目录 + startBoardDaemon（协作通道对端，唯一落盘者）
  const boardDir = mkdtempSync(path.join(tmpdir(), "hwb-worker-collab-"));
  const session = await openBoardSession(boardDir, {
    create: true,
    width: 800,
    height: 600,
  });
  await session.flush();
  await session.close();
  const daemon = await startBoardDaemon({
    name: "worker-test",
    rootPath: boardDir,
    source: "worker-test",
  });
  // mock 盘预置 .daemon.json：worker 探测命中（不触发 spawn）
  await driver.write(
    "mem",
    ".daemon.json",
    JSON.stringify({
      name: "worker-test",
      port: daemon.port,
      source: "worker-test",
    }),
  );
  await rpcCall(host, handler, "createBoard", {
    width: 800,
    height: 600,
    rootPath: "/boards/demo",
  });
  return { host, runtime, handler, driver, daemon, boardDir };
}

describe("CoreWorker 持久化接线", () => {
  test("rootPath 有效时经协作通道落盘在 daemon（worker 零写盘）", async () => {
    const { host, handler, driver, daemon } = await setup();
    try {
      await createStroke(host, handler, "demo/1");
      // 协作同步：worker 操作广播 → daemon 应用 + 落盘
      const landed = await waitFor(async () => {
        const s = await openBoardSession(daemon.rootPath, { source: "check" });
        const found = s.api
          .queryObjectList()
          .objects.some((o) => o.id === "demo/1");
        await s.close();
        return found;
      });
      expect(landed).toBe(true);

      // worker 侧 mock 盘零写：无 write/mkdir/rm 类 io 命令
      const writes = host.postedMessages.filter(
        (m) =>
          m.type === "io-invoke" &&
          /write|mkdir|rm|cp|mv/.test(m.command),
      );
      expect(writes).toHaveLength(0);
    } finally {
      await daemon.close();
      rmSync(daemon.rootPath, { recursive: true, force: true });
    }
  });

  test("重开后经协作同步恢复，撤销穿越重开", async () => {
    const { host, handler, driver, daemon } = await setup();
    try {
      await createStroke(host, handler, "demo/1");
      await waitFor(async () => {
        const s = await openBoardSession(daemon.rootPath, { source: "check" });
        const found = s.api
          .queryObjectList()
          .objects.some((o) => o.id === "demo/1");
        await s.close();
        return found;
      });

      // 排空 io 转发后销毁
      await rpcCall(host, handler, "queryObjects", { ids: ["demo/1"] });
      await rpcCall(host, handler, "destroyBoard");

      // 重开同一板：worker 本地盘为空，经协作通道全量同步恢复
      await rpcCall(host, handler, "createBoard", {
        width: 800,
        height: 600,
        rootPath: "/boards/demo",
      });
      const restored = await waitFor(async () => {
        const objects = await rpcCall(host, handler, "queryObjects", {
          ids: ["demo/1"],
        });
        return objects.length === 1 && objects[0].id === "demo/1";
      });
      expect(restored).toBe(true);

      // 撤销穿越重开：worker undo 广播 → daemon 应用，对象消失
      await rpcCall(host, handler, "undo");
      const undone = await waitFor(async () => {
        const s = await openBoardSession(daemon.rootPath, { source: "check" });
        const found = s.api.queryObjectList().objects.length === 0;
        await s.close();
        return found;
      });
      expect(undone).toBe(true);
    } finally {
      await daemon.close();
      rmSync(daemon.rootPath, { recursive: true, force: true });
    }
    void driver;
  });

  test("rootPath 缺省保持内存模式（无 io 转发）", async () => {
    const host = new FakeWorkerHost();
    const runtime = new CoreWorkerRuntime(host);
    runtime.start();
    const { handler } = createMemoryCommandHandler();

    await rpcCall(host, handler, "createBoard", { width: 800, height: 600 });
    await createStroke(host, handler, "demo/1");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const ioInvokes = host.postedMessages.filter((m) => m.type === "io-invoke");
    expect(ioInvokes).toHaveLength(0);
  });
});
