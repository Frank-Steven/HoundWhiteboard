// SPDX-License-Identifier: MIT

/**
 * @file amend 转发器
 * @description 订阅内核分子生命周期 amend 事件，begin/end/abort 即时转发，中间帧按间隔节流合批后经协调器 volatile 通道广播。
 * @module host/sync/amend-forwarder
 * @author Zhou Chenyu
 */

/**
 * 默认转发间隔（毫秒，约 30fps）
 * @type {number}
 */
const DEFAULT_AMEND_INTERVAL_MS = 33;

/**
 * 创建 amend 转发器
 * @param {Object} options - 选项
 * @param {import("../../kernel/board/board-core.js").BoardCore} options.boardCore - 白板核心
 * @param {(data: Object) => void} options.sendAwareness - awareness 发送面（协调器的 sendAwareness）
 * @param {number} [options.intervalMs=33] - 转发间隔（毫秒）
 * @returns {{ close: () => void, pendingCount: number }} 转发器句柄
 *
 * @description
 * 分子生命周期事件（BoardApi 写入口的 amend 事件）按分子分键缓冲合批：
 * position/transform/data 为绝对值后帧覆盖前帧（volatile 语义下后帧覆盖自纠正，
 * 不转 delta），append 的 items 按序累积；seq 取批内最大。到期间隔一次性打包为
 * `{kind:"mol-amend", mols:[...]}` 发出。begin-mol/end-mol/abort-mol 不合批即时
 * 转发：end-mol 先把残余缓冲冲出再发 mol-end（对端定格依据），abort-mol 丢弃该
 * 分子缓冲后发 mol-abort。volatile 语义：丢了不补，分子记录走可靠通道归位。
 */
function createAmendForwarder(options) {
  const {
    boardCore,
    sendAwareness,
    intervalMs = DEFAULT_AMEND_INTERVAL_MS,
  } = options;

  /**
   * 待转发缓冲表（molId → 合批中的分子帧）
   * @type {Map<string, { seq: number, entries: Map<string, { overwrites: Object, appendGroups: Map<string, Array<*> > }> }>}
   */
  const pending = new Map();

  /**
   * 转发定时器
   * @type {ReturnType<typeof setTimeout> | null}
   */
  let timer = null;

  /**
   * 合批一条 amend 消息
   * @param {Object} message - amend 消息（{molId, seq, entries}）
   * @returns {void}
   */
  const merge = (message) => {
    let buffered = pending.get(message.molId);
    if (!buffered) {
      buffered = { seq: 0, entries: new Map() };
      pending.set(message.molId, buffered);
    }
    buffered.seq = Math.max(buffered.seq, message.seq);
    for (const entry of message.entries ?? []) {
      if (typeof entry?.objectId !== "string") continue;
      let slot = buffered.entries.get(entry.objectId);
      if (!slot) {
        slot = { overwrites: {}, appendGroups: new Map() };
        buffered.entries.set(entry.objectId, slot);
      }
      for (const [key, value] of Object.entries(entry.patch ?? {})) {
        if (key === "append" && value && Array.isArray(value.items)) {
          // append 按 key 分组合并：items 按序累积为单条 append
          const items = slot.appendGroups.get(value.key) ?? [];
          items.push(...value.items);
          slot.appendGroups.set(value.key, items);
        } else {
          // position/transform/data 为绝对值：后帧覆盖前帧
          slot.overwrites[key] = value;
        }
      }
    }
  };

  /**
   * 展开一个分子的合批缓冲为 entries 数组
   * @param {Map<string, { overwrites: Object, appendGroups: Map<string, Array<*>> }>} entries - 合批缓冲
   * @returns {Array<{ objectId: string, patch: Object }>} 转发 entries
   */
  const buildEntries = (entries) => {
    const out = [];
    for (const [objectId, slot] of entries) {
      const groups = [...slot.appendGroups.entries()];
      const patch = { ...slot.overwrites };
      if (groups.length > 0) {
        patch.append = { key: groups[0][0], items: groups[0][1] };
      }
      out.push({ objectId, patch });
      // 同对象多 append key 的罕见情形：其余 key 各自单列一条 entry，接收端按序应用
      for (let i = 1; i < groups.length; i++) {
        out.push({
          objectId,
          patch: { append: { key: groups[i][0], items: groups[i][1] } },
        });
      }
    }
    return out;
  };

  /**
   * 冲出全部待转发缓冲（清空缓冲并停掉定时器）
   * @returns {void}
   */
  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    const mols = [...pending.entries()].map(([molId, buffered]) => ({
      molId,
      seq: buffered.seq,
      entries: buildEntries(buffered.entries),
    }));
    pending.clear();
    sendAwareness({ kind: "mol-amend", mols });
  };

  const unsubscribe = boardCore.activityEventBus.on("amend", (message) => {
    if (typeof message?.molId !== "string") return;
    switch (message.kind) {
      case "begin-mol":
        // 分子起点即时转发（不合批）
        sendAwareness({
          kind: "mol-begin",
          molId: message.molId,
          entries: message.entries,
        });
        break;
      case "amend":
        merge(message);
        if (timer === null) {
          timer = setTimeout(flush, intervalMs);
        }
        break;
      case "end-mol":
        // 残余缓冲先冲出（全表 flush），再发 mol-end 定格
        if (pending.has(message.molId)) flush();
        sendAwareness({ kind: "mol-end", molId: message.molId });
        break;
      case "abort-mol":
        // 中止分子：缓冲丢弃不冲出
        pending.delete(message.molId);
        if (pending.size === 0 && timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        sendAwareness({ kind: "mol-abort", molId: message.molId });
        break;
      default:
        break;
    }
  });

  return {
    /**
     * 待转发缓冲中的分子数（测试观测用）
     * @type {number}
     */
    get pendingCount() {
      return pending.size;
    },

    /**
     * 停止转发：退订并清定时器（缓冲中未发出的帧直接丢弃）
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

export { createAmendForwarder, DEFAULT_AMEND_INTERVAL_MS };
