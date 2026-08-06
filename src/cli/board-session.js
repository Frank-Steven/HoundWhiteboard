/**
 * @file CLI 板会话装配
 * @description 命令行组合根：node driver + 会话存储 + BoardCore + 日志跟随者 + BoardApi。
 * @module cli/board-session
 * @author Zhou Chenyu
 */

import { BoardApi } from "../kernel/api/board-api.js";
import { BoardCore } from "../kernel/board/board-core.js";
import { createJournaler } from "../kernel/store/journaler.js";
import { createSessionStore } from "../kernel/store/session-store.js";
import { bindRoot } from "../io/driver/io-driver.js";
import { createNodeDriver } from "../io/driver/node.js";

/**
 * 打开（或创建并打开）一个板会话
 * @param {string} rootPath - 板目录绝对路径
 * @param {Object} [options={}] - 会话选项
 * @param {boolean} [options.create=false] - 板目录不存在时创建空板
 * @param {number} [options.width=0] - 新建板的宽度（重开时以盘上配置为准）
 * @param {number} [options.height=0] - 新建板的高度
 * @param {string} [options.source="cli"] - 协作身份（记录的 source 与新对象 id 前缀）
 * @returns {Promise<{api: BoardApi, boardCore: BoardCore, store: Object, journaler: Object, meta: Object|null, flush: Function, close: Function}>} 板会话
 *
 * @description
 * 每次调用都是完整的「加载 → 可用」循环：盘上会话恢复进 BoardCore，
 * 日志跟随者以盘上内容为指纹种子挂接；调用方在命令结束后 flush + close。
 */
async function openBoardSession(rootPath, options = {}) {
  if (typeof rootPath !== "string" || rootPath.trim() === "") {
    throw new Error("缺少板目录路径。");
  }
  const driver = createNodeDriver(rootPath);
  const { rootId } = await driver.registerRoot(rootPath);
  const store = createSessionStore(bindRoot(driver, rootId));

  const exists = await store.exists();
  if (!exists && !options.create) {
    throw new Error(`板目录不存在或不是板：${rootPath}`);
  }
  if (exists && options.create) {
    throw new Error(`板已存在：${rootPath}`);
  }
  if (!exists) {
    await store.create();
  }

  const session = await store.loadAll();
  const meta = session.meta;
  // 盘上板配置优先：板尺寸是文档数据（决定区块划分），重开必须与原值一致
  const boardCore = new BoardCore({
    width: meta?.boardConfig?.width || options.width || 0,
    height: meta?.boardConfig?.height || options.height || 0,
    rootPath,
    source: options.source ?? "cli",
    hitRecords: session.records.length ? session.records : undefined,
    lastTime: meta?.lastTime ?? 0,
    coreIdCounters: meta?.coreIdCounters ?? {},
    objectIdCounters: meta?.objectIdCounters ?? {},
  });
  if (exists) {
    boardCore.restoreSession(session);
  }

  const journaler = createJournaler({
    boardCore,
    store,
    collectMeta: () => boardCore.collectSessionMeta(),
  });
  journaler.attach({
    nextSegmentSeq: meta?.nextSegmentSeq ?? 1,
    lastTime: meta?.lastTime ?? 0,
    knownObjects: session.objects,
    knownTrash: session.trash,
  });

  const api = new BoardApi(boardCore);
  return {
    api,
    boardCore,
    store,
    journaler,
    meta,
    flush: () => journaler.flush(),
    close: () => journaler.detach(),
  };
}

export { openBoardSession };
