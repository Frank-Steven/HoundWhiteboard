// SPDX-License-Identifier: MIT

/**
 * @file SubFrame 转发器
 * @description 订阅内核手势中间帧事件，节流合批后经协调器 volatile 通道广播。
 * @module host/sync/subframe-forwarder
 * @author Zhou Chenyu
 */

/**
 * 默认转发间隔（毫秒，约 30fps）
 * @type {number}
 */
const DEFAULT_SUBFRAME_INTERVAL_MS = 33;

/**
 * 创建 SubFrame 转发器
 * @param {Object} options - 选项
 * @param {import("../../kernel/board/board-core.js").BoardCore} options.boardCore - 白板核心
 * @param {(data: Object) => void} options.sendAwareness - awareness 发送面（协调器的 sendAwareness）
 * @param {number} [options.intervalMs=33] - 转发间隔（毫秒）
 * @returns {{ close: () => void, pendingCount: number }} 转发器句柄
 *
 * @description
 * 手势中间帧（modifyObject/appendListItem 等写入口的 subframe 事件）按对象合批：
 * position/transform/data 后帧覆盖前帧，append/replace 按序累积；到期间隔一次性
 * 打包为 `{kind:"subframe", ops:[...]}` 发出。volatile 语义：丢了不补，commit 纠正。
 */
function createSubframeForwarder(options) {
  const {
    boardCore,
    sendAwareness,
    intervalMs = DEFAULT_SUBFRAME_INTERVAL_MS,
  } = options;

  /**
   * 待转发预览表（objectId → 合批中的预览操作）
   * @type {Map<string, Object>}
   */
  const pending = new Map();

  /**
   * 转发定时器
   * @type {ReturnType<typeof setTimeout> | null}
   */
  let timer = null;

  /**
   * 合批一条预览操作
   * @param {Object} op - 预览操作
   * @returns {void}
   */
  const merge = (op) => {
    if (typeof op?.objectId !== "string") return;
    const existing = pending.get(op.objectId) ?? { objectId: op.objectId };
    if (op.create && typeof op.create === "object") {
      // 创建上下文全量覆盖（同 id 重复创建按后者为准）
      existing.create = { ...op.create };
    }
    if (op.patch && typeof op.patch === "object") {
      // position/transform/data 为全量值：后帧覆盖前帧
      existing.patch = { ...existing.patch, ...op.patch };
    }
    if (op.append) {
      existing.appends = [
        ...(existing.appends ?? []),
        { key: op.append.key, items: [...op.append.items] },
      ];
    }
    if (op.replace) {
      existing.replaces = [
        ...(existing.replaces ?? []),
        { ...op.replace },
      ];
    }
    pending.set(op.objectId, existing);
  };

  /**
   * 到期间隔转发一批
   * @returns {void}
   */
  const flush = () => {
    timer = null;
    if (pending.size === 0) return;
    const ops = [...pending.values()];
    pending.clear();
    sendAwareness({ kind: "subframe", ops });
  };

  const unsubscribe = boardCore.activityEventBus.on("subframe", (op) => {
    merge(op);
    if (timer === null) {
      timer = setTimeout(flush, intervalMs);
    }
  });

  return {
    /**
     * 待转发缓冲中的对象数（测试观测用）
     * @type {number}
     */
    get pendingCount() {
      return pending.size;
    },

    /**
     * 停止转发：退订并清定时器（缓冲中未发出的预览直接丢弃）
     * @returns {void}
     */
    close() {
      unsubscribe();
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
    },
  };
}

export { createSubframeForwarder, DEFAULT_SUBFRAME_INTERVAL_MS };
