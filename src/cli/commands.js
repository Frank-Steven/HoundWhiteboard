/**
 * @file CLI 命令实现
 * @description 板会话上的各命令处理器；命令只经 session.api（BoardApi 契约面）执行，文件模式与 daemon 模式同一条路。
 * @module cli/commands
 * @author Zhou Chenyu
 */

import fs from "node:fs/promises";

/**
 * 宽松解析 JSON：先试严格解析；失败则补裸属性名引号、单引号转双引号后重试
 * @param {string} text - 待解析文本
 * @returns {Object} 解析结果
 *
 * @description
 * PowerShell/cmd 手写 JSON 转义繁琐，宽松模式兼容 `'{radius: 20}'`、`{'a':1}` 这类写法。
 * 复杂结构仍建议写标准 JSON 或用 --data @文件。
 */
function parseLenientJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const relaxed = text
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
    try {
      return JSON.parse(relaxed);
    } catch (error) {
      throw new Error(
        `--data 不是合法 JSON：${error.message}（复杂数据建议写标准 JSON 或用 --data @文件）`,
      );
    }
  }
}

/**
 * 解析 --data 参数：@ 前缀从文件读取，否则按（宽松）JSON 解析
 * @param {string} dataText - --data 参数值（必传：对象数据无默认值）
 * @returns {Promise<Object>} 数据
 */
async function parseDataArgument(dataText) {
  if (typeof dataText !== "string" || dataText === "") {
    throw new Error("add 需要 --data（可用 --data '<json>' 或 --data @文件）。");
  }
  if (dataText.startsWith("@")) {
    const text = await fs.readFile(dataText.slice(1), "utf-8");
    return parseLenientJson(text);
  }
  return parseLenientJson(dataText);
}

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
  const info = await session.api.queryBoardInfo();
  console.log(JSON.stringify(info, null, 2));
}

/**
 * list 命令：列出活动与 trash 对象
 * @param {Object} session - 板会话
 * @returns {Promise<void>}
 */
async function cmdList(session) {
  const { objects, trash } = await session.api.queryObjectList();
  console.log(JSON.stringify({ objects, trash }, null, 2));
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
  const data = await session.api.queryObject(id);
  if (!data) throw new Error(`对象不存在：${id}`);
  console.log(JSON.stringify(data, null, 2));
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
  const data = await parseDataArgument(flags.data);
  const position = parsePosition(flags.position);
  const id = await session.api.addObject(type, { position, data });
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
  await session.api.deleteObjects(args);
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
  await session.api.undo();
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
  await session.api.redo();
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
