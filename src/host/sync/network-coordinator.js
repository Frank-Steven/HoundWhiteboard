/**
 * @file 网络协调器
 * @description BoardApi 的同步宿主薄包装：本地操作经中继广播，远程记录经延迟容忍窗接入 applyRemoteOperations。
 * @module host/sync/network-coordinator
 * @author Zhou Chenyu
 */

import { parseOperationId } from "../../kernel/hit/operation.js";

/**
 * 计算各来源已追加的最大操作序号
 * @param {Object[]} records - 记录数组
 * @returns {Map<string, number>} 来源到最大序号的映射
 */
function maxSeqBySource(records) {
  const map = new Map();
  for (const record of records) {
    const { n } = parseOperationId(record.id);
    if (n > (map.get(record.source) ?? 0)) {
      map.set(record.source, n);
    }
  }
  return map;
}

/**
 * 按超分子分组记录
 * @param {Map<string, Object>} pending - 待接入记录表（id → 记录）
 * @returns {Object[][]} 分组结果（独立记录单条成组，超分子成员按来源序号连续段同组）
 *
 * @description
 * 分组键为三级容器模型的 supraId（旧 supraOpId 不再作为分组依据）；旧记录无此字段时按独立记录处理。
 * 成员本就独立有效、分组只为同批美观：同 supraId 成员按来源序号排序后拆成连续段，
 * 段间空洞（超分子存续期间夹入其他提交）不阻塞成员各自接入。
 */
function groupPending(pending) {
  const groups = [];
  const bySupra = new Map();
  for (const record of pending.values()) {
    const supraId = record.supraId ?? null;
    if (supraId === null) {
      groups.push([record]);
      continue;
    }
    let group = bySupra.get(supraId);
    if (group === undefined) {
      group = [];
      bySupra.set(supraId, group);
    }
    group.push(record);
  }
  for (const group of bySupra.values()) {
    group.sort((a, b) => parseOperationId(a.id).n - parseOperationId(b.id).n);
    let run = [group[0]];
    groups.push(run);
    for (let i = 1; i < group.length; i += 1) {
      const prev = parseOperationId(group[i - 1].id).n;
      const curr = parseOperationId(group[i].id).n;
      if (curr !== prev + 1) {
        run = [];
        groups.push(run);
      }
      run.push(group[i]);
    }
  }
  return groups;
}

/**
 * 比较两条记录的全序（时间标记 + 来源决胜）
 * @param {Object} a - 记录 a
 * @param {Object} b - 记录 b
 * @returns {number} 比较结果
 */
function compareRecords(a, b) {
  if (a.time !== b.time) return a.time - b.time;
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
}

/**
 * 创建网络协调器
 * @param {Object} options - 协调器选项
 * @param {import("../../kernel/board/board-core.js").BoardCore} options.boardCore - 白板核心
 * @param {import("../../kernel/api/board-api.js").BoardApi} options.boardApi - 内核 API
 * @param {string} options.url - 中继服务器地址（ws://）
 * @param {string} options.boardId - 板 id（房间）
 * @param {number} [options.windowMs=500] - 延迟容忍窗长（毫秒）
 * @param {number} [options.maxWindows=3] - 连续容忍窗上限（到期后请求全量）
 * @param {number} [options.digestIntervalMs=30000] - 状态摘要周期（毫秒）
 * @param {number} [options.connectTimeoutMs=3000] - 连接超时（毫秒）；地址无响应（无 error 事件的挂起）时按超时拒绝
 * @param {Function} [options.WebSocketImpl] - WebSocket 实现（默认全局实现）
 * @param {Function} [options.onAwareness] - awareness 消息回调（{source, data}；peer-left 时 data 为 {kind:"peer-left"}）
 * @param {Function} [options.onDisconnect] - 非主动断开回调（宿主据此自动重连；主动 close 不触发）
 * @returns {Object} 协调器句柄
 *
 * @description
 * 本地 commit 与 AOM 活动即时广播；远程记录按来源序号连续性与父在日志判定预检后接入，
 * 乱序记录攒批经容忍窗整理；周期摘要校验落后或分歧时请求全量重建。
 * INIT 握手（request-init/respond-init）互换未闭合分子清单，对端缺失的在途分子
 * 经 awareness 重放 mol-begin/mol-amend 段（对账只依据 request-init 上的清单）。
 */
function createNetworkCoordinator(options) {
  const {
    boardCore,
    boardApi,
    url,
    boardId,
    windowMs = 500,
    maxWindows = 3,
    digestIntervalMs = 30000,
    connectTimeoutMs = 3000,
    WebSocketImpl = globalThis.WebSocket,
    onAwareness,
    onDisconnect,
  } = options;
  const source = boardCore.hitCommitter.source;
  const log = boardCore.operationLog;

  /** @type {WebSocket|null} */
  let ws = null;
  /** @type {"closed"|"connecting"|"joined"} */
  let state = "closed";
  /** @type {Map<string, Object>} 待接入记录（id → 记录） */
  const pending = new Map();
  /** @type {Map<string, number>} 各来源下一个期望序号 */
  const nextSeq = new Map(
    [...maxSeqBySource(log.toJSON())].map(([s, n]) => [s, n + 1]),
  );
  /** @type {number} 已连续经过的容忍窗数 */
  let windowsElapsed = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let windowTimer = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let digestTimer = null;
  /** @type {Function|null} */
  let unsubscribeAppend = null;
  /** @type {Function|null} */
  let unsubscribeActivity = null;
  /** @type {Object[]} 待发送记录缓冲（微任务合批） */
  const outbox = [];
  /** @type {boolean} 发送微任务是否已排队 */
  let sendScheduled = false;
  /** @type {boolean} 是否为调用方主动关闭（主动关闭不触发 onDisconnect） */
  let closedByUser = false;

  /**
   * 清理全部订阅与定时器（断线与主动关闭共用）
   * @returns {void}
   */
  const cleanup = () => {
    if (digestTimer !== null) {
      clearInterval(digestTimer);
      digestTimer = null;
    }
    if (windowTimer !== null) {
      clearTimeout(windowTimer);
      windowTimer = null;
    }
    unsubscribeAppend?.();
    unsubscribeAppend = null;
    unsubscribeActivity?.();
    unsubscribeActivity = null;
  };

  /**
   * 处理套接字断开：清理本地状态、清理远程选择登记、通知宿主（非主动关闭时）
   * @returns {void}
   */
  const onSocketClosed = () => {
    const wasJoined = state === "joined";
    state = "closed";
    ws = null;
    cleanup();
    if (wasJoined) {
      // 本端离线期间对端活动状态未知，清空待重连后重建
      for (const { source: remoteSource } of boardApi.queryRemoteChoices()) {
        boardApi.clearRemoteActivity(remoteSource);
      }
    }
    if (wasJoined && !closedByUser) {
      onDisconnect?.();
    }
  };

  /**
   * 微任务合批发送本地记录
   * @returns {void}
   *
   * @description
   * 同一同步行程连续产生的记录（如超分子成员随闭合连续物化）合批同批到达；
   * 成员本就独立有效，合批只为同批美观。
   */
  const scheduleSend = () => {
    if (sendScheduled) return;
    sendScheduled = true;
    queueMicrotask(() => {
      sendScheduled = false;
      if (outbox.length === 0) return;
      send({ type: "records", records: outbox.splice(0) });
    });
  };
  /**
   * 发送消息到中继
   * @param {Object} message - 消息体
   * @returns {void}
   */
  const send = (message) => {
    if (ws !== null && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  /**
   * 发送 awareness 消息（volatile：可丢、不进日志不参与收敛）
   * @param {Object} data - awareness 负载（如 {kind:"cursor", point}、mol-begin/mol-amend 重放）
   * @returns {void}
   */
  const sendAwareness = (data) => {
    send({ type: "awareness", data });
  };

  /**
   * 判定分组是否可接入（父在日志、来源序号连续）
   * @param {Object[]} group - 记录分组
   * @returns {boolean} 是否可接入
   */
  const isGroupApplicable = (group) => {
    const sorted = [...group].sort(compareRecords);
    const first = parseOperationId(sorted[0].id);
    if (first === null) return false;
    let expected = nextSeq.get(sorted[0].source) ?? 1;
    for (const record of sorted) {
      const parsed = parseOperationId(record.id);
      if (parsed === null || parsed.n !== expected) return false;
      if (
        record.parentId !== null &&
        !log.has(record.parentId) &&
        !sorted.some((member) => member.id === record.parentId)
      ) {
        return false;
      }
      expected += 1;
    }
    return true;
  };

  /**
   * 排空待接入缓冲：逐轮接入全部可接入分组
   * @returns {void}
   */
  const drain = () => {
    for (;;) {
      const applicable = groupPending(pending)
        .filter(isGroupApplicable)
        .sort((a, b) => compareRecords(a[0], b[0]));
      if (applicable.length === 0) return;
      for (const group of applicable) {
        for (const record of group) pending.delete(record.id);
        try {
          boardApi.applyRemoteOperations(group);
          const last = parseOperationId(group[group.length - 1].id);
          if (last !== null) {
            nextSeq.set(group[group.length - 1].source, last.n + 1);
          }
        } catch {
          // 预检未覆盖的竞态：放回缓冲等待后续整理
          for (const record of group) pending.set(record.id, record);
          return;
        }
      }
    }
  };

  /**
   * 容忍窗到期的处理：再整理一轮，连续超窗则请求全量
   * @returns {void}
   */
  const onWindowElapsed = () => {
    windowTimer = null;
    drain();
    if (pending.size === 0) {
      windowsElapsed = 0;
      return;
    }
    windowsElapsed += 1;
    if (windowsElapsed >= maxWindows) {
      windowsElapsed = 0;
      sendRequestInit();
    }
    scheduleWindow();
  };

  /**
   * 启动容忍窗计时（缓冲非空且未计时才会启动）
   * @returns {void}
   */
  const scheduleWindow = () => {
    if (pending.size === 0 || windowTimer !== null) return;
    windowTimer = setTimeout(onWindowElapsed, windowMs);
  };

  /**
   * 接入远程记录：去重入缓冲并立即尝试排空
   * @param {Object[]} records - 远程记录
   * @returns {void}
   */
  const ingestRecords = (records) => {
    for (const record of Array.isArray(records) ? records : []) {
      if (record?.source === undefined || record?.id === undefined) continue;
      if (parseOperationId(record.id) === null) continue;
      // 回环（本端发出经对端转发回来）由 log.has 去重；
      // 不按 source 跳过：同 source 重开会话的历史补发需要接入
      if (log.has(record.id) || pending.has(record.id)) continue;
      pending.set(record.id, record);
    }
    drain();
    scheduleWindow();
    if (pending.size === 0) {
      windowsElapsed = 0;
    }
  };

  /**
   * 计算本端状态摘要
   * @returns {{logSize: number, head: ?string, objects: number, stateHash: string, openMols: number}} 摘要
   */
  const localDigest = () => ({
    logSize: log.size,
    head: boardCore.undoTree.head?.shareId ?? null,
    objects: boardCore.getAllObjects().length,
    stateHash: boardApi.queryStateHash(),
    openMols: boardApi.queryOpenMols().length,
  });

  /**
   * 处理远程摘要：落后或同长分歧时请求全量重建；日志与 HEAD 一致但状态校验和分歧时本地自愈
   * @param {Object} digest - 远程摘要
   * @returns {void}
   */
  const handleDigest = (digest) => {
    if (!digest || typeof digest.logSize !== "number") return;
    const local = localDigest();
    if (digest.logSize > local.logSize) {
      sendRequestInit();
      return;
    }
    if (digest.logSize === local.logSize && digest.head !== local.head) {
      sendRequestInit();
      return;
    }
    // 效果层分歧（日志逐字节一致但效果未放全）：f(日志) 确定，本地重放即得正确状态；
    // 任一端有未闭合分子时活体合法偏离派生态，跳过本轮比对
    if (
      typeof digest.stateHash === "string" &&
      digest.logSize === local.logSize &&
      digest.head === local.head &&
      digest.stateHash !== local.stateHash &&
      digest.openMols === 0 &&
      boardApi.queryOpenMols().length === 0
    ) {
      const result = boardApi.repairStateFromLog();
      if (result.repaired) {
        console.warn(
          `[sync] 检测到效果层分歧，已从日志重放自愈（对象 ${result.fixedIds.join(", ")}）`,
        );
      }
    }
  };

  /**
   * 本端各来源的最大操作序号（lastSeen 摘要）
   * @returns {Object<string, number>} 来源到最大序号的映射
   */
  const localLastSeen = () => Object.fromEntries(maxSeqBySource(log.toJSON()));

  /**
   * 发送 request-init：携带 lastSeen 增量摘要与本端未闭合分子清单（供对端对账重放）
   * @param {Object<string, number>} [lastSeen] - 本端各来源最大序号（缺省为全量请求）
   * @returns {void}
   */
  const sendRequestInit = (lastSeen) => {
    send({
      type: "request-init",
      ...(lastSeen === undefined ? {} : { lastSeen }),
      openMols: boardApi.queryOpenMols(),
    });
  };

  /**
   * 按对端未闭合分子清单对账：经 awareness 重放对端缺失的在途分子 begin/amend 段
   * @param {Object[]} [peerMols] - 对端未闭合分子清单（queryOpenMols 形态）
   * @returns {void}
   *
   * @description
   * 对端清单无此 molId：重发 mol-begin（entries 取 queryMolAmendSince 的返回，含 create 快照）
   * 与全部 amend 段；对端 seq 落后：只补 seq 之后的 amend 段（对端已持 begin，不重发）。
   * 重放经 sendAwareness（与 forwarder 同一发送面），对端走正常 mol-begin/mol-amend 路径消费。
   */
  const reconcileOpenMols = (peerMols) => {
    if (!Array.isArray(peerMols)) return;
    const peerSeqByMol = new Map();
    for (const item of peerMols) {
      if (typeof item?.molId === "string" && typeof item?.seq === "number") {
        peerSeqByMol.set(item.molId, item.seq);
      }
    }
    for (const local of boardApi.queryOpenMols()) {
      const peerSeq = peerSeqByMol.get(local.molId);
      const payload = boardApi.queryMolAmendSince(local.molId, peerSeq ?? 0);
      if (payload === null) continue;
      if (peerSeq === undefined) {
        sendAwareness({
          kind: "mol-begin",
          molId: payload.molId,
          entries: payload.entries,
        });
      }
      if (payload.amends.length > 0) {
        sendAwareness({
          kind: "mol-amend",
          mols: payload.amends.map((frame) => ({
            molId: payload.molId,
            seq: frame.seq,
            entries: frame.entries,
          })),
        });
      }
    }
  };

  /**
   * 按请求方的 lastSeen 过滤缺口记录（无 lastSeen 为全量，向后兼容 INIT）
   * @param {Object<string, number>} [lastSeen] - 请求方各来源最大序号
   * @returns {Object[]} 缺口记录
   */
  const filterGapRecords = (lastSeen) => {
    const all = log.toJSON();
    if (!lastSeen || typeof lastSeen !== "object") return all;
    return all.filter((record) => {
      const parsed = parseOperationId(record.id);
      if (parsed === null) return false;
      return parsed.n > (lastSeen[record.source] ?? 0);
    });
  };

  /**
   * 重广播本端当前活动持有（重连后互斥状态重建）
   * @returns {void}
   *
   * @description
   * 断线时本端持有在对端被 peer-left 清理，重连后按 hold 逐条重发 choose 活动；
   * 对端按来源迁移语义登记，不产生重复持有。
   */
  const rebroadcastLocalActivity = () => {
    for (const hold of boardCore.activeObjectManager.queryLocalActivity()) {
      send({
        type: "aom",
        event: {
          kind: "choose",
          ids: [...hold.ids],
          source,
          time: Date.now(),
          ...(hold.name !== undefined ? { choice: hold.name } : {}),
        },
      });
    }
  };

  /**
   * 处理中继消息
   * @param {Object} message - 已解析消息
   * @returns {void}
   */
  const handleMessage = (message) => {
    switch (message.type) {
      case "joined":
        state = "joined";
        if (Array.isArray(message.peers) && message.peers.length > 0) {
          sendRequestInit(localLastSeen());
          rebroadcastLocalActivity();
        }
        digestTimer = setInterval(() => {
          send({ type: "digest", digest: localDigest() });
        }, digestIntervalMs);
        return;
      case "peer-joined":
        // 对端（重）加入：告知我方缺口并同步当前互斥状态
        sendRequestInit(localLastSeen());
        rebroadcastLocalActivity();
        return;
      case "peer-left":
        boardApi.clearRemoteActivity(message.source);
        onAwareness?.({ source: message.source, data: { kind: "peer-left" } });
        return;
      case "records":
        ingestRecords(message.records);
        return;
      case "aom":
        boardApi.applyRemoteActivity(message.event, message.source);
        return;
      case "awareness":
        // volatile 通道：转发给宿主，不进日志不参与收敛
        onAwareness?.({ source: message.source, data: message.data });
        return;
      case "request-init": {
        // 对账先于缺口响应：增量请求无缺口时的降噪早退不能跳过 amend 重放。
        // 只在 request-init 上对账：握手双方都会发 request-init（joined/peer-joined），
        // 单向覆盖已完备；respond-init 的 openMols 仅供协议完备，不再对账（避免同一清单触发重复重放）。
        reconcileOpenMols(message.openMols);
        const records = filterGapRecords(message.lastSeen);
        // 增量请求无缺口时不回应（降噪）；全量请求（无 lastSeen）总是回应（meta 供 id 续种）
        if (message.lastSeen && records.length === 0) return;
        send({
          type: "respond-init",
          to: message.source,
          records,
          meta: boardCore.collectSessionMeta(),
          openMols: boardApi.queryOpenMols(),
        });
        return;
      }
      case "respond-init":
        ingestRecords(message.records);
        return;
      case "digest":
        handleDigest(message.digest);
        return;
      default:
        return;
    }
  };

  return {
    /**
     * 当前状态
     * @type {"closed"|"connecting"|"joined"}
     */
    get state() {
      return state;
    },

    /**
     * 待接入缓冲中的记录数（测试观测用）
     * @type {number}
     */
    get pendingCount() {
      return pending.size;
    },

    /**
     * 连接并加入房间；joined 后兑现
     * @returns {Promise<void>}
     */
    connect() {
      if (state !== "closed") {
        return Promise.reject(new Error("协调器已连接"));
      }
      state = "connecting";
      unsubscribeAppend = log.onAppend((record) => {
        // 只广播本端产生的记录；远程应用的记录不回环
        if (record.source !== source) return;
        outbox.push(record);
        scheduleSend();
      });
      unsubscribeActivity = boardCore.activityEventBus.on("activity", (event) => {
        send({ type: "aom", event });
      });

      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          // 对端无响应（如死地址无 RST 的挂起）：主动关套接字并按失败拒绝
          try {
            ws?.close();
          } catch {
            // 关闭失败不影响拒绝
          }
          reject(new Error(`中继连接超时：${url}`));
        }, connectTimeoutMs);
        ws = new WebSocketImpl(url);
        ws.addEventListener("open", () => {
          send({ type: "join", boardId, source });
        });
        ws.addEventListener("message", (event) => {
          let message;
          try {
            message = JSON.parse(String(event.data));
          } catch {
            return;
          }
          handleMessage(message);
          if (message?.type === "joined") {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
        });
        ws.addEventListener("error", () => {
          if (state === "connecting" && !settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`中继连接失败：${url}`));
          }
        });
        ws.addEventListener("close", () => {
          onSocketClosed();
        });
      });
    },

    /**
     * 发送 awareness 消息（volatile：可丢、不进日志不参与收敛）
     * @param {Object} data - awareness 负载（如 {kind:"cursor", point}）
     * @returns {void}
     */
    sendAwareness(data) {
      sendAwareness(data);
    },

    /**
     * 显式转发一批操作记录到房间（协作桥接：本端经其它通道接入的远端记录原样广播）
     * @param {Object[]} records - 操作记录数组
     * @returns {void}
     */
    sendRecords(records) {
      if (!Array.isArray(records) || records.length === 0) return;
      send({ type: "records", records });
    },

    /**
     * 断开连接并停止全部定时器与订阅
     * @returns {Promise<void>}
     */
    async close() {
      closedByUser = true;
      cleanup();
      const socket = ws;
      ws = null;
      state = "closed";
      // readyState 3 = CLOSED；实例常量（socket.CLOSED）在 undici 上不存在，用数值
      if (socket !== null && socket.readyState !== 3) {
        await new Promise((resolve) => {
          // undici 在连接失败的套接字上不发 close 事件：以短超时兜底
          const timer = setTimeout(resolve, 100);
          socket.addEventListener(
            "close",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
          try {
            socket.close();
          } catch {
            clearTimeout(timer);
            resolve();
          }
        });
      }
    },
  };
}

export { createNetworkCoordinator };
