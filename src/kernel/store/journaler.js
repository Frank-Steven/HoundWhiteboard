/**
 * @file 日志跟随者
 * @description 订阅操作日志增长，合批后将新记录落为日志段，并把对象文件与板元数据对齐到当前白板状态。
 * @module kernel/store/journaler
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

/**
 * 创建日志跟随者
 * @param {Object} params - 参数
 * @param {import("../board/board-core.js").BoardCore} params.boardCore - 白板核心
 * @param {ReturnType<import("./session-store.js").createSessionStore>} params.store - 会话存储
 * @param {() => Object} [params.collectMeta] - 附加板元数据收集器（flush 时并入 board.json）
 * @returns {Object} 跟随者操作面
 *
 * @description
 * 记录经 append 事件入队，微任务合批后自动落盘；flush 可显式等待排空。
 * 对象文件按当前白板状态调和（序列化比对，仅写差异），撤销/重做/远端记录引起的任何状态迁移统一收敛。
 */
function createJournaler({ boardCore, store, collectMeta }) {
  /** @type {(() => void)|null} 追加事件退订函数 */
  let unsubscribe = null;

  /** @type {Object[]} 待落盘记录队列 */
  let pendingRecords = [];

  /** @type {boolean} 是否已排定微任务 flush */
  let flushScheduled = false;

  /** @type {Promise<void>} flush 串行链 */
  let flushing = Promise.resolve();

  /** @type {{nextSegmentSeq: number, lastTime: number}} 段序号与最新时间标记 */
  let state = { nextSegmentSeq: 0, lastTime: 0 };

  /**
   * 已落盘对象的内容指纹
   * @type {Map<string, {location: "objects"|"trash", json: string}>}
   */
  const lastSync = new Map();

  /**
   * 已落盘区块元数据的内容指纹
   * @type {Map<number, string>}
   */
  const lastChunkSync = new Map();

  /**
   * 归一化 trash 条目（层位边集合转数组，使其可 JSON 序列化）
   * @param {Object} entry - trash 条目
   * @returns {Object} 归一化后的条目
   */
  const normalizeTrashEntry = (entry) => ({
    data: entry.data,
    chunks: (entry.chunks ?? []).map((c) => ({
      chunkId: c.chunkId,
      below: [...c.below],
      above: [...c.above],
    })),
  });

  /**
   * 将对象文件对齐到当前白板状态
   * @returns {Promise<void>}
   *
   * @description
   * 活动对象写入 objects/，trash 对象写入 trash/；内容或位置有变化才落盘；
   * 既非活动亦非 trash（如撤销新增）的对象从盘上移除。
   */
  const reconcileObjects = async () => {
    const liveIds = new Set();
    for (const obj of boardCore.getAllObjects()) {
      const data = obj.serialize();
      const json = JSON.stringify(data);
      liveIds.add(obj.id);
      const prev = lastSync.get(obj.id);
      if (prev?.json === json && prev.location === "objects") continue;
      await store.writeObject(data);
      if (prev?.location === "trash") await store.removeTrashObject(obj.id);
      lastSync.set(obj.id, { location: "objects", json });
    }
    for (const [id, entry] of boardCore.trash) {
      const normalized = normalizeTrashEntry(entry);
      const json = JSON.stringify(normalized);
      const prev = lastSync.get(id);
      if (prev?.json === json && prev.location === "trash") continue;
      await store.writeTrashEntry(normalized);
      if (prev?.location === "objects") await store.removeObject(id);
      lastSync.set(id, { location: "trash", json });
    }
    for (const [id, prev] of lastSync) {
      if (liveIds.has(id) || boardCore.trash.has(id)) continue;
      if (prev.location === "objects") await store.removeObject(id);
      else await store.removeTrashObject(id);
      lastSync.delete(id);
    }
  };

  /**
   * 将区块元数据文件对齐到当前层叠图状态
   * @returns {Promise<void>}
   */
  const reconcileChunks = async () => {
    for (const { chunk } of boardCore.chunkLoaded.values()) {
      if (!chunk?.objectManager) continue;
      const metadata = {
        tierGraph: chunk.objectManager.staticGraph.toArray(),
        objectCoverIndex: chunk.objectManager.serializeObjectCoverChunks(),
      };
      const json = JSON.stringify(metadata);
      if (lastChunkSync.get(chunk.id) === json) continue;
      await store.writeChunkMetadata(chunk.id, metadata);
      lastChunkSync.set(chunk.id, json);
    }
  };

  /**
   * 执行一轮落盘：日志段 → 对象调和 → 区块调和 → 板元数据
   * @returns {Promise<void>}
   */
  const doFlush = async () => {
    if (pendingRecords.length > 0) {
      const records = pendingRecords;
      pendingRecords = [];
      await store.appendSegment(state.nextSegmentSeq, records);
      state.nextSegmentSeq += 1;
      for (const record of records) {
        if (typeof record.time === "number" && record.time > state.lastTime) {
          state.lastTime = record.time;
        }
      }
    }
    await reconcileObjects();
    await reconcileChunks();
    await store.writeMeta({
      lastTime: state.lastTime,
      nextSegmentSeq: state.nextSegmentSeq,
      ...(collectMeta?.() ?? {}),
    });
  };

  /**
   * 显式排空：等待已排队的落盘完成
   * @returns {Promise<void>}
   */
  const flush = () => {
    flushing = flushing.then(doFlush);
    return flushing;
  };

  /**
   * 微任务合批调度
   * @returns {void}
   */
  const scheduleFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      void flush();
    });
  };

  return {
    /**
     * 挂接到白板核心
     * @param {Object} [options] - 挂接选项
     * @param {number} [options.nextSegmentSeq=0] - 下一个可用段序号（打开既有板时由存储读出）
     * @param {number} [options.lastTime=0] - 已落盘的最晚时间标记
     * @param {Object[]} [options.knownObjects=[]] - 盘上已有活动对象数据（指纹种子，避免首 flush 重写）
     * @param {Object[]} [options.knownTrash=[]] - 盘上已有 trash 条目（指纹种子）
     * @returns {void}
     */
    attach({ nextSegmentSeq = 0, lastTime = 0, knownObjects = [], knownTrash = [] } = {}) {
      if (unsubscribe !== null) {
        throw new Error("journaler 已挂接");
      }
      state = { nextSegmentSeq, lastTime };
      for (const data of knownObjects) {
        lastSync.set(data.id, { location: "objects", json: JSON.stringify(data) });
      }
      for (const data of knownTrash) {
        lastSync.set(data.id, { location: "trash", json: JSON.stringify(data) });
      }
      unsubscribe = boardCore.operationLog.onAppend((record) => {
        pendingRecords.push(record);
        scheduleFlush();
      });
    },

    /**
     * 显式排空落盘队列
     * @returns {Promise<void>}
     */
    flush,

    /**
     * 卸接：退订并排空
     * @returns {Promise<void>}
     */
    async detach() {
      unsubscribe?.();
      unsubscribe = null;
      await flush();
    },

    /**
     * 待落盘记录数
     * @type {number}
     */
    get pendingCount() {
      return pendingRecords.length;
    },
  };
}

export { createJournaler };
