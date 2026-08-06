/**
 * @file CLI 命令实现
 * @description 板会话上的各命令处理器；所有变更命令以 --source 为操作作者。
 * @module cli/commands
 * @author Zhou Chenyu
 */

import { IncrementalIdPool } from "../kernel/utils/incremental-id-pool.js";

/**
 * 解析位置参数
 * @param {string} [text] - "x,y" 形式的坐标文本
 * @returns {{x: number, y: number}} 位置
 */
function parsePosition(text) {
  if (typeof text !== "string") return { x: 0, y: 0 };
  const [x, y] = text.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`无效位置：${text}（应为 "x,y"）`);
  }
  return { x, y };
}

/**
 * info 命令：打印板元数据与统计
 * @param {Object} session - 板会话
 * @returns {Promise<void>}
 */
async function cmdInfo(session) {
  const live = session.boardCore.getAllObjects();
  const meta = session.boardCore.collectSessionMeta();
  console.log(
    JSON.stringify(
      {
        boardConfig: meta.boardConfig,
        records: session.boardCore.operationLog.size,
        head: session.boardCore.undoTree.head?.shareId ?? null,
        objects: live.length,
        trash: session.boardCore.trash.size,
        coreIdCounters: meta.coreIdCounters,
        objectIdCounters: meta.objectIdCounters,
      },
      null,
      2,
    ),
  );
}

/**
 * list 命令：列出活动与 trash 对象
 * @param {Object} session - 板会话
 * @returns {Promise<void>}
 */
async function cmdList(session) {
  const live = session.boardCore
    .getAllObjects()
    .map((obj) => ({ id: obj.id, type: obj.type ?? obj.constructor.name }));
  const trash = [...session.boardCore.trash.keys()];
  console.log(JSON.stringify({ objects: live, trash }, null, 2));
}

/**
 * show 命令：打印单个对象的序列化数据
 * @param {Object} session - 板会话
 * @param {string[]} args - 位置参数（对象 id）
 * @returns {Promise<void>}
 */
async function cmdShow(session, args) {
  const id = args[0];
  if (!id) throw new Error("show 需要一个对象 id。");
  const obj = session.boardCore.getObjectById(id);
  if (!obj) throw new Error(`对象不存在：${id}`);
  console.log(JSON.stringify(obj.serialize(), null, 2));
}

/**
 * add 命令：创建并提交一个对象
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（type、data、position、source）
 * @returns {Promise<void>}
 *
 * @description
 * 对象 id 由 CLI 侧 id 池按板上计数续号分配，创建后经 commit 入静态图并记录日志。
 */
async function cmdAdd(session, _args, flags) {
  const type = flags.type;
  if (!type) throw new Error("add 需要 --type。");
  const data = flags.data ? JSON.parse(flags.data) : undefined;
  const position = parsePosition(flags.position);
  const source = flags.source;

  const counters = session.api.getObjectIdCounters();
  const pool = new IncrementalIdPool(source, counters[source] ?? 0);
  const id = pool.allocate();

  session.api.createObject(type, { id, position, data });
  session.api.commitObjects([id]);
  session.api.reportObjectIdCounter(source, pool.counter);
  console.log(id);
}

/**
 * delete 命令：删除对象（移入 trash，可撤销）
 * @param {Object} session - 板会话
 * @param {string[]} args - 位置参数（对象 id 列表）
 * @param {Object} flags - 标志（source）
 * @returns {Promise<void>}
 */
async function cmdDelete(session, args, flags) {
  if (args.length === 0) throw new Error("delete 需要至少一个对象 id。");
  session.api.deleteObjects(args);
  console.log(`deleted: ${args.join(", ")}`);
}

/**
 * undo 命令：撤销一步
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（source）
 * @returns {Promise<void>}
 */
async function cmdUndo(session, _args, flags) {
  session.api.undo();
  console.log("undo ok");
}

/**
 * redo 命令：重做一步
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（source）
 * @returns {Promise<void>}
 */
async function cmdRedo(session, _args, flags) {
  session.api.redo();
  console.log("redo ok");
}

/**
 * 命令表
 * @description 键为命令名；create 标志为 true 的命令在板目录不存在时创建空板。
 * @type {Object<string, {run: Function, create?: boolean}>}
 */
const COMMANDS = {
  create: { run: cmdInfo, create: true },
  info: { run: cmdInfo },
  list: { run: cmdList },
  show: { run: cmdShow },
  add: { run: cmdAdd },
  delete: { run: cmdDelete },
  undo: { run: cmdUndo },
  redo: { run: cmdRedo },
};

export { COMMANDS };
