/**
 * @file Core Worker 入口
 * @description
 * 提供 Core Worker 的入口与运行时封装。
 * Worker 侧持有 BoardCore + BoardApi + ViewportCore，通过 JSON-RPC 风格的消息协议响应 UI 侧请求。
 * 领域分发委托给 BoardApi（api/board-api.js），本文件只负责消息路由、生命周期和渲染编排。
 * 当文件运行在真正的 WorkerGlobalScope 中时会自动启动；测试环境可通过导出的工厂手动创建 runtime。
 * @module host/core-worker
 * @author Zhou Chenyu
 */

import { createDefaultPersistenceAdapter } from "../kernel/board/persistence-adapter.js";
import { createDefaultAomRenderHooks } from "../kernel/board/aom-render-hooks.js";
import { BoardCore } from "../kernel/board/board-core.js";
import { ViewportCore } from "../renderers/canvas/viewport-core.js";
import { Logger } from "../utils/log/logger.js";
import { logBus } from "../utils/log/log-bus.js";
import { createConsolePrinter } from "../utils/log/console-printer.js";
import { handleDebugQuery } from "./debug-helper.js";
import { BoardApi } from "../kernel/api/board-api.js";
import { BOARD_API_ROUTES } from "../kernel/api/board-api-routes.js";
import { createTauriDriver } from "../io/driver/tauri.js";
import { bindRoot } from "../io/driver/io-driver.js";
import { createPersistenceAdapter } from "../io/adapter/persistence.js";
import { createSessionStore } from "../kernel/store/session-store.js";
import { createNetworkCoordinator } from "./sync/network-coordinator.js";
import { createJournaler } from "../kernel/store/journaler.js";

/**
 * 判断值是否可作为 Worker 消息宿主
 * @param {*} host - 待判断宿主
 * @returns {boolean} 是否具备 message 监听与 postMessage 能力
 */
function isWorkerMessageHost(host) {
  return Boolean(
    host &&
    typeof host.postMessage === "function" &&
    typeof host.addEventListener === "function" &&
    typeof host.removeEventListener === "function",
  );
}

/**
 * 判断当前上下文是否为真正的 WorkerGlobalScope
 * @param {*} value - 待判断值
 * @returns {boolean} 是否位于 WorkerGlobalScope
 */
function isWorkerGlobalScopeInstance(value) {
  return Boolean(
    typeof WorkerGlobalScope !== "undefined" &&
    value instanceof WorkerGlobalScope,
  );
}

/**
 * 规整 viewportId 以便作为 Map key 使用
 * @param {string | number} viewportId - viewport 标识
 * @returns {string} 规整后的 key
 */
function normalizeViewportKey(viewportId) {
  return String(viewportId ?? "");
}

/**
 * Core Worker 运行时
 * @class
 * @description
 * 封装 Worker 线程的消息分发、BoardCore 生命周期与 RPC 路由。
 * 接通 ViewportCore、viewport-change / request-render-flush 与 render-frame 回传。
 * @author Zhou Chenyu
 */
class CoreWorkerRuntime {
  /**
   * Worker 消息宿主
   * @type {{ postMessage: Function, addEventListener: Function, removeEventListener: Function }}
   */
  #host;

  /**
   * 当前 BoardCore 实例
   * @type {BoardCore | null}
   */
  #boardCore;

  /**
   * Engine 侧 BoardApi 分发器
   * @type {BoardApi | null}
   */
  #boardApi;

  /**
   * 当前 ViewportCore 注册表
   * @type {Map<string, ViewportCore>}
   */
  #viewportCores;

  /**
   * 绑定后的消息监听器
   * @type {(event: MessageEvent | { data?: any }) => void}
   */
  #messageListener;

  /**
   * Worker 运行时 Logger
   * @type {Logger}
   */
  #log;

  /**
   * Worker 日志转发取消函数
   * @type {Function | null}
   */
  #offWorkerLogs;

  /** Worker 运行时 DEBUG 日志订阅取消函数 */
  #offDebugLog;

  /**
   * runtime 是否已启动
   * @type {boolean}
   */
  #started;

  /**
   * 渲染帧 flush 是否已调度
   * @type {boolean}
   */
  #flushScheduled;

  /**
   * 日志跟随者（持久化模式非空）
   * @type {Object | null}
   */
  #journaler;

  /**
   * 网络协调器（syncUrl 存在且连接成功时非空）
   * @type {Object | null}
   */
  #coordinator;

  /**
   * 等待主线程 io-response 的挂起表
   * @type {Map<string, { resolve: Function, reject: Function }>}
   */
  #ioPending;

  /**
   * io-invoke 消息序号
   * @type {number}
   */
  #ioMsgSeq;

  /**
   * @param {{ postMessage: Function, addEventListener: Function, removeEventListener: Function }} host - Worker 消息宿主
   */
  constructor(host) {
    if (!isWorkerMessageHost(host)) {
      throw new TypeError(
        "CoreWorkerRuntime requires a host with postMessage/addEventListener/removeEventListener.",
      );
    }

    this.#host = host;
    this.#boardCore = null;
    this.#boardApi = null;
    this.#viewportCores = new Map();
    this.#messageListener = this.#handleMessageEvent.bind(this);
    this.#log = new Logger("CoreWorker", "INFO", logBus);
    this.#offWorkerLogs = null;
    this.#started = false;
    this.#flushScheduled = false;
    this.#journaler = null;
    this.#coordinator = null;
    this.#ioPending = new Map();
    this.#ioMsgSeq = 0;
  }

  /**
   * 启动 Worker runtime
   * @returns {CoreWorkerRuntime} 当前 runtime 实例
   */
  start() {
    if (this.#started) {
      return this;
    }

    this.#started = true;
    this.#host.addEventListener("message", this.#messageListener);
    this.#offDebugLog = createConsolePrinter(logBus, {
      levels: ["DEBUG"],
      timestamps: true,
    });
    this.#offWorkerLogs = logBus.onLevels(["WARN", "ERROR"], (entry) => {
      this.#postMessage({
        type: "worker-log",
        level: entry.level,
        logger: entry.logger,
        args: [...(entry.args ?? [])],
        meta: entry.meta ?? {},
        timestamp: entry.timestamp,
      });
    });
    this.#postMessage({ type: "ready" });
    return this;
  }

  /**
   * 停止 Worker runtime
   * @returns {void}
   */
  stop() {
    if (!this.#started) {
      return;
    }

    this.#host.removeEventListener("message", this.#messageListener);
    this.#offDebugLog?.();
    this.#offDebugLog = null;
    this.#offWorkerLogs?.();
    this.#offWorkerLogs = null;
    this.#destroyAllViewportCores();
    this.#boardCore = null;
    this.#started = false;
  }

  /**
   * 向宿主发送消息
   * @param {Object} message - 待发送消息
   * @param {Transferable[]} [transferList=[]] - 可转移对象列表
   * @returns {void}
   */
  #postMessage(message, transferList = []) {
    if (Array.isArray(transferList) && transferList.length > 0) {
      this.#host.postMessage(message, transferList);
      return;
    }

    this.#host.postMessage(message);
  }

  /**
   * 处理主线程回传的 IO 执行结果
   * @param {Object} message - io-response 消息
   * @returns {void}
   */
  #handleIoResponse(message) {
    const pending = this.#ioPending.get(message?.msgId);
    if (!pending) return;
    this.#ioPending.delete(message.msgId);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error ?? "io-invoke failed"));
    }
  }

  /**
   * 处理宿主消息事件
   * @param {MessageEvent | { data?: any }} event - 宿主消息事件
   * @returns {void}
   */
  #handleMessageEvent(event) {
    const message = event?.data;
    if (!message || typeof message !== "object") {
      return;
    }

    switch (message.type) {
      case "rpc":
        this.#handleRpcMessage(message);
        return;
      case "rpc-batch":
        this.#handleBatchMessage(message);
        return;
      case "viewport-change":
        this.#handleViewportChange(message);
        return;
      case "request-render-flush":
        this.#handleRenderFlush(message);
        return;
      case "debug-request":
        this.#handleDebugRequest(message);
        return;
      case "io-response":
        this.#handleIoResponse(message);
        return;
      default:
        return;
    }
  }

  /**
   * 处理 RPC 请求消息
   * @param {{ msgId?: string, method?: string, params?: Record<string, any> }} message - RPC 请求消息
   * @returns {void}
   */
  #handleRpcMessage(message) {
    const msgId = message?.msgId;
    const method = message?.method;
    const params = message?.params ?? {};

    if (typeof msgId !== "string" || typeof method !== "string") {
      this.#log.warn("Ignoring malformed rpc message.", message);
      return;
    }

    try {
      const result = this.#dispatchRpc(method, params);
      if (result instanceof Promise) {
        result
          .then((value) => {
            this.#postMessage({
              type: "rpc-response",
              msgId,
              result: value,
            });
          })
          .catch((error) => {
            this.#postMessage({
              type: "rpc-response",
              msgId,
              error: {
                code: error?.code ?? "INTERNAL_ERROR",
                message: error?.message ?? String(error),
              },
            });
          });
        return;
      }

      this.#postMessage({
        type: "rpc-response",
        msgId,
        result,
      });
    } catch (error) {
      this.#postMessage({
        type: "rpc-response",
        msgId,
        error: {
          code: error?.code ?? "INTERNAL_ERROR",
          message: error?.message ?? String(error),
        },
      });
    }
  }

  /**
   * 处理批量 RPC 请求
   * @description
   * 批量消息为 fire-and-forget，不产生 rpc-response；
   * 单条目失败不影响其余条目执行，全部失败条目以 rpc-batch-error 统一回传。
   * @param {{ batchId?: number, items?: Array<{ method: string } & Record<string, any>> }} message - 批量请求消息
   * @returns {void}
   */
  #handleBatchMessage(message) {
    const items = message?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const errors = [];
    items.forEach((item, index) => {
      try {
        const { method, ...params } = item;
        this.#invokeBoardApi(method, params);
      } catch (error) {
        errors.push({
          index,
          method: item?.method ?? "unknown",
          code: error?.code ?? "INTERNAL_ERROR",
          message: error?.message ?? String(error),
        });
        this.#log.error(
          `Batch item failed: ${item?.method ?? "unknown"}`,
          error,
        );
      }
    });

    if (errors.length > 0) {
      this.#postMessage({
        type: "rpc-batch-error",
        batchId: message?.batchId,
        errors,
      });
    }
  }

  /**
   * 分发 RPC 方法
   * @param {string} method - RPC 方法名
   * @param {Record<string, any>} params - RPC 参数
   * @returns {*}
   */
  #dispatchRpc(method, params) {
    switch (method) {
      case "createBoard":
        return this.createBoard(params);
      case "destroyBoard":
        return this.destroyBoard();
      case "createViewport":
        return this.createViewport(params.options);
      case "destroyViewport":
        return this.destroyViewport(params.viewportId);
      default:
        return this.#invokeBoardApi(method, params);
    }
  }

  /**
   * 创建 Worker 侧 BoardCore
   * @param {{ width?: number, height?: number, rootPath?: string }} [options={}] - Board 初始化选项
   * @returns {Promise<{ ok: boolean }>} 创建结果
   *
   * @description
   * rootPath 有效时进入持久化模式：tauri driver 经主线程转发落地文件，
   * 既有板从会话存储恢复（树、对象、trash、层叠图、计数器），随后挂接日志跟随者增量落盘。
   */
  async createBoard(options = {}) {
    if (this.#boardCore) {
      throw new Error("BoardCore already created.");
    }

    const persistence = await this.#setupPersistence(options.rootPath);

    // 盘上板配置优先：板尺寸是文档数据（决定区块划分），重开必须与原值一致
    const boardConfig = persistence?.session?.meta?.boardConfig;
    this.#boardCore = new BoardCore({
      width: boardConfig?.width || options.width,
      height: boardConfig?.height || options.height,
      rootPath: options.rootPath,
      source: options.source,
      persistenceAdapter:
        persistence?.adapter ?? createDefaultPersistenceAdapter(),
      aomRenderHooks: createDefaultAomRenderHooks(),
      hitRecords: persistence?.session?.records?.length
        ? persistence.session.records
        : undefined,
      lastTime: persistence?.session?.meta?.lastTime,
      coreIdCounters: persistence?.session?.meta?.coreIdCounters,
      objectIdCounters: persistence?.session?.meta?.objectIdCounters,
    });

    const renderHooks = this.#createViewportRenderHooks();
    this.#boardCore.aomRenderHooks = renderHooks;
    this.#boardCore.activeObjectManager.renderHooks = renderHooks;

    if (persistence) {
      this.#boardCore.restoreSession(persistence.session);
      this.#journaler = createJournaler({
        boardCore: this.#boardCore,
        store: persistence.store,
        collectMeta: () => this.#boardCore.collectSessionMeta(),
      });
      this.#journaler.attach({
        nextSegmentSeq: persistence.session.nextSegmentSeq,
        lastTime: persistence.session.meta?.lastTime ?? 0,
        knownObjects: persistence.session.objects,
        knownTrash: persistence.session.trash,
      });
    }

    this.#boardApi = new BoardApi(this.#boardCore);

    // 同步：syncUrl 存在时连接中继；连接失败降级为离线运行
    if (typeof options.syncUrl === "string" && options.syncUrl !== "") {
      this.#coordinator = createNetworkCoordinator({
        boardCore: this.#boardCore,
        boardApi: this.#boardApi,
        url: options.syncUrl,
        boardId:
          typeof options.boardId === "string" && options.boardId !== ""
            ? options.boardId
            : options.rootPath,
      });
      try {
        await this.#coordinator.connect();
        this.#log.info(`已连接同步中继：${options.syncUrl}`);
      } catch (error) {
        this.#log.warn(`同步中继连接失败，离线运行：${error?.message ?? error}`);
        await this.#coordinator.close();
        this.#coordinator = null;
      }
    }

    return { ok: true };
  }

  /**
   * 装配持久化（rootPath 有效时）
   * @param {string} [rootPath] - 白板根路径
   * @returns {Promise<{ adapter: Object, store: Object, session: Object } | null>} 持久化上下文，内存模式为 null
   * @private
   */
  async #setupPersistence(rootPath) {
    if (typeof rootPath !== "string" || rootPath.trim() === "") {
      return null;
    }
    const driver = createTauriDriver({
      invoke: (command, args) => this.#forwardIoInvoke(command, args),
    });
    // 板存储需要读、写、列目录、建目录与删除（journaler 调和会移除对象文件）
    const registered = await driver.registerRoot(rootPath, {
      read: true,
      write: true,
      ls: true,
      mkdir: true,
      rm: true,
      hide: false,
      zip: false,
    });
    if (!registered?.rootId) {
      this.#log.warn(`持久化根目录注册失败，回退内存模式：${rootPath}`);
      return null;
    }
    const { rootId } = registered;
    const store = createSessionStore(bindRoot(driver, rootId));
    if (!(await store.exists())) {
      await store.create();
    }
    const session = await store.loadAll();
    return {
      adapter: createPersistenceAdapter({ driver, rootId }),
      store,
      session,
    };
  }

  /**
   * 转发 IO 调用到主线程执行
   * @param {string} command - Rust command 名称
   * @param {Object} args - 参数
   * @returns {Promise<*>} 执行结果
   * @private
   */
  #forwardIoInvoke(command, args) {
    const msgId = `io-${++this.#ioMsgSeq}`;
    return new Promise((resolve, reject) => {
      this.#ioPending.set(msgId, { resolve, reject });
      this.#postMessage({ type: "io-invoke", msgId, command, args });
    });
  }

  /**
   * 销毁 Worker 侧 BoardCore
   * @returns {Promise<{ ok: boolean }>} 销毁结果
   */
  async destroyBoard() {
    if (this.#coordinator) {
      await this.#coordinator.close();
      this.#coordinator = null;
    }
    if (this.#journaler) {
      await this.#journaler.detach();
      this.#journaler = null;
    }
    this.#destroyAllViewportCores();
    this.#boardApi = null;
    this.#boardCore = null;
    return { ok: true };
  }

  /**
   * 创建 Worker 侧 ViewportCore
   * @param {{ viewportId?: string | number, width?: number, height?: number }} [options={}] - Viewport 初始化选项
   * @returns {void}
   */
  createViewport(options = {}) {
    const boardCore = this.#requireBoardCore();
    const viewportId = options?.viewportId;
    if (
      viewportId === undefined ||
      viewportId === null ||
      String(viewportId).trim() === ""
    ) {
      throw new TypeError("createViewport requires a valid viewportId.");
    }

    const viewportKey = normalizeViewportKey(viewportId);
    const width = Number.isFinite(options?.width) ? options.width : 0;
    const height = Number.isFinite(options?.height) ? options.height : 0;
    const existingViewportCore = this.#viewportCores.get(viewportKey);

    if (existingViewportCore) {
      if (existingViewportCore.resize(width, height)) {
        existingViewportCore.requestRenderLayersRefresh();
      }
      return;
    }

    const viewportCore = new ViewportCore({
      boardCore,
      viewportId,
      width,
      height,
      postRenderFrame: (message, transferList = []) => {
        this.#postMessage(message, transferList);
      },
    });

    this.#viewportCores.set(viewportKey, viewportCore);
    viewportCore.requestRenderLayersRefresh();
  }

  /**
   * 销毁 Worker 侧 ViewportCore
   * @param {string | number} viewportId - Viewport 标识
   * @returns {void}
   */
  destroyViewport(viewportId) {
    const viewportCore = this.#resolveViewportCore(viewportId);
    if (!viewportCore) return;

    viewportCore.destroy();
    this.#viewportCores.delete(normalizeViewportKey(viewportId));
  }

  /**
   * 获取当前可用的 BoardCore
   * @returns {BoardCore} 当前 BoardCore 实例
   * @throws {Error} Board 尚未创建时抛出
   */
  #requireBoardCore() {
    if (!this.#boardCore) {
      throw new Error("BoardCore is not initialized. Call createBoard first.");
    }

    return this.#boardCore;
  }

  /**
   * 创建绑定到 ViewportCore 集合的 AOM 渲染钩子
   * @returns {import("../kernel/board/aom-render-hooks.js").AomRenderHooks}
   */
  #createViewportRenderHooks() {
    return {
      /**
       * 刷新所有 ViewportCore 的活动层
       * @description
       * 仅失效显式传入的对象。未传对象时刷新全部活动 drawable。
       * @param {import("../kernel/objects/basic-obj.js").BasicObject[]} objectInstances - 受影响对象
       */
      requestActiveRender: (objectInstances = []) => {
        if (this.#viewportCores.size === 0) return;

        for (const viewportCore of this.#viewportCores.values()) {
          const renderer = viewportCore.renderer;
          if (!renderer) continue;

          const targetObjects =
            objectInstances.length > 0
              ? objectInstances
              : (renderer.collectActiveDrawables?.() ?? []);

          if (typeof renderer.invalidateActiveObjects === "function") {
            renderer.invalidateActiveObjects(targetObjects);
          }
          viewportCore.markFrameDirty();
        }
      },

      /**
       * 刷新所有 ViewportCore 的静态层
       * @param {import("../kernel/chunk/chunk.js").Chunk[]} chunks - 需要刷新的区块
       */
      requestStaticRender: (chunks = []) => {
        if (this.#viewportCores.size === 0) return;

        for (const viewportCore of this.#viewportCores.values()) {
          if (chunks.length > 0) {
            viewportCore.renderer?.invalidateChunks?.(chunks);
            viewportCore.markFrameDirty();
            continue;
          }

          viewportCore.requestViewportStaticRefresh?.();
        }
      },

      /**
       * 按对象范围刷新 ViewportCore 的静态层
       * @param {import("../kernel/objects/basic-obj.js").BasicObject[]} objectInstances - 受影响对象
       * @param {import("../kernel/chunk/chunk.js").Chunk[]} fallbackChunks - 回退区块
       * @param {Map<string, import("../kernel/range/index.js").RectangleRange>} previousWorldRects - 旧世界范围快照
       */
      requestStaticRenderForObjects: (
        objectInstances = [],
        fallbackChunks = [],
        previousWorldRects = new Map(),
      ) => {
        if (this.#viewportCores.size === 0) return;

        for (const viewportCore of this.#viewportCores.values()) {
          const dirtyRects = viewportCore.renderer?.invalidateCachedObjects?.(
            objectInstances,
            { previousWorldRects },
          );

          if (Array.isArray(dirtyRects) && dirtyRects.length > 0) {
            viewportCore.syncChunkBufferWithViewport?.();
            viewportCore.markFrameDirty();
            continue;
          }

          if (fallbackChunks.length > 0) {
            viewportCore.renderer?.invalidateChunks?.(fallbackChunks);
            viewportCore.markFrameDirty();
            continue;
          }

          viewportCore.requestViewportStaticRefresh?.();
        }
      },

      /**
       * 刷新所有 ViewportCore 当前视口
       * @param {import("../kernel/objects/basic-obj.js").BasicObject[]} _objectInstances - 受影响对象
       */
      flushViewportForObjects: (_objectInstances = []) => {
        if (this.#viewportCores.size === 0) return;

        for (const viewportCore of this.#viewportCores.values()) {
          viewportCore.flushViewportRender?.();
        }
      },
    };
  }

  /**
   * 销毁全部 ViewportCore
   * @returns {void}
   */
  #destroyAllViewportCores() {
    for (const viewportCore of this.#viewportCores.values()) {
      viewportCore.destroy();
    }
    this.#viewportCores.clear();
  }

  /**
   * 解析目标 ViewportCore
   * @param {string | number | undefined} viewportId - viewport 标识
   * @returns {ViewportCore | undefined}
   */
  #resolveViewportCore(viewportId) {
    if (viewportId !== undefined && viewportId !== null) {
      return this.#viewportCores.get(normalizeViewportKey(viewportId));
    }

    if (this.#viewportCores.size === 1) {
      return this.#viewportCores.values().next().value;
    }

    return undefined;
  }

  /**
   * 安排一次渲染帧 flush（同周期去重）
   * @description
   * 在对象 mutation RPC 完成后安排渲染回传，消除 rAF 等待延迟。
   * 同一 microtask 周期内多次调用只执行一次 flush。
   * @returns {void}
   */
  #scheduleFlushRenderFrames() {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    queueMicrotask(() => {
      this.#flushScheduled = false;
      for (const viewportCore of this.#viewportCores.values()) {
        viewportCore.flushRenderFrame();
      }
    });
  }

  /**
   * 立即刷新所有 ViewportCore 的渲染帧（无去重，直接执行）
   * @returns {void}
   */
  #flushRenderFrames() {
    for (const viewportCore of this.#viewportCores.values()) {
      viewportCore.flushRenderFrame();
    }
  }

  /**
   * 将 RPC 方法转发到 Engine 侧 BoardApi
   * @description
   * 通过 {@link ./api/board-api-routes.js} 的路由表分发，
   * 并按路由条目声明的 flush 时机在调用完成后调度渲染帧 flush。
   * @param {string} method - RPC 方法名
   * @param {Record<string, any>} params - RPC 参数
   * @returns {*} 调用结果（异步方法返回 Promise）
   */
  #invokeBoardApi(method, params = {}) {
    const api = this.#boardApi;
    if (!api) {
      throw new Error("BoardApi is not initialized. Call createBoard first.");
    }

    const route = BOARD_API_ROUTES[method];
    if (!route) {
      throw new Error(`Unknown RPC method: ${method}`);
    }

    const result = route.invoke(api, params);

    if (route.flush === "sync") {
      this.#scheduleFlushRenderFrames();
    } else if (route.flush === "async" && result instanceof Promise) {
      return result.then((value) => {
        this.#scheduleFlushRenderFrames();
        return value;
      });
    }

    return result;
  }

  /**
   * 处理视口变更消息
   * @param {{ viewportId?: string | number, origin?: { x?: number, y?: number }, zoom?: number, viewportSize?: { width?: number, height?: number } }} message - 视口变更消息
   * @returns {void}
   */
  #handleViewportChange(message) {
    const viewportCore = this.#resolveViewportCore(message?.viewportId);
    if (!viewportCore) {
      this.#log.throttledWarn(
        "viewport-change-unknown-viewport",
        `viewport-change ignored for unknown viewport: ${String(
          message?.viewportId,
        )}`,
      );
      return;
    }

    viewportCore.onViewportChange({
      origin: message?.origin,
      zoom: message?.zoom,
      viewportSize: message?.viewportSize,
      force: message?.force,
    });
  }

  /**
   * 处理渲染 flush 请求
   * @param {{ viewportId?: string | number }} message - 渲染 flush 请求消息
   * @returns {void}
   */
  #handleRenderFlush(message) {
    const viewportId = message?.viewportId;
    if (viewportId !== undefined && viewportId !== null) {
      const viewportCore = this.#resolveViewportCore(viewportId);
      if (!viewportCore) {
        this.#log.throttledWarn(
          "render-flush-unknown-viewport",
          `request-render-flush ignored for unknown viewport: ${String(
            viewportId,
          )}`,
        );
        return;
      }

      viewportCore.flushRenderFrame();
      return;
    }

    for (const viewportCore of this.#viewportCores.values()) {
      viewportCore.flushRenderFrame();
    }
  }

  /**
   * 处理调试请求，输出调试信息到 Logger
   * @param {{ query?: string, chunkId?: number, [key: string]: any }} message - 调试请求消息
   * @returns {void}
   * @private
   */
  #handleDebugRequest(message) {
    const { query, ...params } = message;
    const boardCore = this.#requireBoardCore();
    handleDebugQuery(boardCore, query, params);
  }
}

/**
 * 创建一个可手动控制的 CoreWorkerRuntime
 * @param {{ postMessage: Function, addEventListener: Function, removeEventListener: Function }} host - Worker 消息宿主
 * @returns {CoreWorkerRuntime} 新建的 runtime
 */
function createCoreWorkerRuntime(host) {
  return new CoreWorkerRuntime(host);
}

const defaultWorkerHost = globalThis?.self;
if (isWorkerGlobalScopeInstance(defaultWorkerHost)) {
  createCoreWorkerRuntime(defaultWorkerHost).start();
}

export { CoreWorkerRuntime, createCoreWorkerRuntime };
