/**
 * @file CLI 命令实现
 * @description 板会话上的各命令处理器；命令只经 session.api（BoardApi 契约面）执行，文件模式与 daemon 模式同一条路。
 * @module cli/commands
 * @author Zhou Chenyu
 */

import fs from "node:fs/promises";
import { resolveBoardPath } from "./board-path.js";
import {
  loadChoices,
  setChoice,
  removeChoice,
  findChoiceOf,
} from "./choice-buffer.js";
import { isValidChoiceName } from "../kernel/board/active-object-manager.js";

/**
 * 宽松化 JSON 文本：单引号转双引号、裸属性名补引号、裸字符串值补引号
 * @param {string} text - 原始文本
 * @returns {string} 宽松化后的文本
 *
 * @description
 * PowerShell 传参会吃掉内嵌双引号（如 `"#000"` 变成裸 token `#000`），故值位置上
 * 的裸 token（`#` 开头或字母开头，非 true/false/null）也补引号；数字、布尔、null、
 * 已带引号的字符串与嵌套结构不受影响。
 */
function relaxJsonText(text) {
  let relaxed = text.replace(/'/g, '"');
  relaxed = relaxed.replace(
    /([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g,
    '$1"$2"$3',
  );
  relaxed = relaxed.replace(
    /([:\[,]\s*)(#[0-9a-fA-F]{3,8}|[a-zA-Z_$][\w$-]*)(\s*[,}\]])/g,
    (match, prefix, value, suffix) => {
      if (value === "true" || value === "false" || value === "null") {
        return match;
      }
      return `${prefix}"${value}"${suffix}`;
    },
  );
  return relaxed;
}

/**
 * 宽松解析 JSON：先试严格解析；失败则宽松化后重试
 * @param {string} text - 待解析文本
 * @returns {Object} 解析结果
 *
 * @description
 * PowerShell/cmd 手写 JSON 转义繁琐，宽松模式兼容 `'{radius: 20}'`、`{'a':1}`、
 * `{color: #000}`（引号被 shell 吃掉）这类写法。复杂结构仍建议写标准 JSON 或用 --data @文件。
 */
function parseLenientJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(relaxJsonText(text));
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
    const filePath = resolveBoardPath(dataText.slice(1));
    const text = await fs.readFile(filePath, "utf-8");
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
 * 按 --json 模式输出：--json 输出纯 JSON，默认输出人类可读文本
 * @param {Object} flags - 命令标志
 * @param {*} jsonValue - --json 模式下的输出值
 * @param {string} humanText - 默认模式下的输出文本
 * @returns {void}
 */
function printResult(flags, jsonValue, humanText) {
  if (flags.json === true) {
    console.log(JSON.stringify(jsonValue, null, 2));
  } else {
    console.log(humanText);
  }
}

/**
 * create 命令：创建空板并打印确认
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（json）
 * @returns {Promise<void>}
 *
 * @description
 * 板目录已存在时在开会话阶段报错；创建成功后默认输出人类可读确认，--json 输出板概要。
 */
async function cmdCreate(session, _args, flags) {
  if (flags.json === true) {
    const info = await session.api.queryBoardInfo();
    console.log(JSON.stringify(info, null, 2));
    return;
  }
  console.log(`板已创建：${session.rootPath}`);
}

/**
 * info 命令：打印板元数据与统计
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（json）
 * @returns {Promise<void>}
 */
async function cmdInfo(session, _args, flags) {
  const info = await session.api.queryBoardInfo();
  if (flags.json === true) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }
  const config = info.boardConfig
    ? `${info.boardConfig.width}×${info.boardConfig.height}`
    : "未设置";
  const lines = [
    `板配置：${config}`,
    `记录：${info.records} 条（HEAD ${info.head ?? "无"}）`,
    `活动链：${info.chain.length > 0 ? info.chain.join(" → ") : "（空）"}`,
    `对象：${info.objects}（trash：${info.trash}）`,
  ];
  console.log(lines.join("\n"));
}

/**
 * list 命令：列出活动与 trash 对象
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（json）
 * @returns {Promise<void>}
 */
async function cmdList(session, _args, flags) {
  const { objects, trash } = await session.api.queryObjectList();
  if (flags.json === true) {
    console.log(JSON.stringify({ objects, trash }, null, 2));
    return;
  }
  const lines = [];
  if (objects.length > 0) {
    lines.push("对象：");
    for (const obj of objects) {
      lines.push(`  ${obj.id}  ${obj.type}`);
    }
  }
  if (trash.length > 0) {
    lines.push("trash：");
    for (const id of trash) {
      lines.push(`  ${id}`);
    }
  }
  if (lines.length === 0) {
    console.log("（空板）");
    return;
  }
  console.log(lines.join("\n"));
}

/**
 * show 命令：打印单个对象的序列化数据
 * @param {Object} session - 板会话
 * @param {string[]} args - 位置参数（对象 id）
 * @param {Object} flags - 标志（json）
 * @returns {Promise<void>}
 */
async function cmdShow(session, args, flags) {
  const id = args[0];
  if (!id) throw new Error("show 需要一个对象 id。");
  const data = await session.api.queryObject(id);
  if (!data) throw new Error(`对象不存在：${id}`);
  if (flags.json === true) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`${id}  ${data.type ?? "?"}`);
  console.log(JSON.stringify(data, null, 2));
}

/**
 * add 命令：创建并提交一个对象
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（type、data、position、source、json）
 * @returns {Promise<void>}
 *
 * @description
 * 对象 id 由 CLI 侧 id 池按板上计数续号分配，创建后经 commit 入静态图并记录日志。
 * 默认输出单行 id（脚本捕获用）；--json 输出 {"id": ...}。
 */
async function cmdAdd(session, _args, flags) {
  const type = flags.type;
  if (!type) throw new Error("add 需要 --type。");
  const data = await parseDataArgument(flags.data);
  const position = parsePosition(flags.position);
  const props = { position, data };
  if (typeof flags.property === "string") {
    props.property = parseLenientJson(flags.property);
  }
  const id = await session.api.addObject(type, props);
  printResult(flags, { id }, id);
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
  printResult(flags, { deleted: args }, `deleted: ${args.join(", ")}`);
}

/**
 * undo 命令：撤销一步
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（source）
 * @returns {Promise<void>}
 */
async function cmdUndo(session, args, flags) {
  const targetNodeId = args[0];
  const result = await session.api.undo(targetNodeId);
  printResult(
    flags,
    { undone: result.undone, targetNodeId: result.targetNodeId ?? null },
    result.undone
      ? `undo ok（撤销 ${result.targetNodeId}）`
      : `undo：无可撤销目标${targetNodeId ? `（${targetNodeId} 不在活动链上）` : "（无本端操作）"}`,
  );
}

/**
 * redo 命令：重做一步
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（source）
 * @returns {Promise<void>}
 */
async function cmdRedo(session, _args, flags) {
  const result = await session.api.redo();
  printResult(
    flags,
    { redone: result.redone, targetNodeId: result.targetNodeId ?? null },
    result.redone
      ? `redo ok（重做 ${result.targetNodeId}）`
      : "redo：无最近撤销可重做",
  );
}

/**
 * ops 命令：打印操作日志记录明细
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（source、type、limit）
 * @returns {Promise<void>}
 */
async function cmdOps(session, _args, flags) {
  const options = {};
  if (typeof flags.source === "string") options.source = flags.source;
  if (typeof flags.type === "string") options.type = flags.type;
  if (typeof flags.limit === "string") {
    const limit = Number(flags.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`无效 limit：${flags.limit}（应为正整数）`);
    }
    options.limit = limit;
  }
  const records = await session.api.queryOperations(options);
  if (flags.json === true) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  for (const record of records) {
    console.log(
      `${record.id}  ${record.type}  ${record.source}  ${record.time}${record.parentId ? `  （父 ${record.parentId}）` : ""}`,
    );
  }
}

/**
 * 将时间回溯树结构排版为缩进文本
 * @param {Object} tree - queryUndoTree 返回的树结构
 * @returns {string} 缩进树文本
 *
 * @description
 * 活动链节点不标状态，HEAD 节点标 [HEAD]，活动链外的已撤销分支节点标 [已撤销]。
 * 多成员节点按成员类型加号相连：聚合节点（超分子折叠段）以花括号包裹、
 * 多对象分子节点以方括号包裹，discard 型取消选择成员带 (discard) 后缀。
 */
function formatUndoTree(tree) {
  if (tree.nodes.length === 0) return "（空树）";
  return tree.nodes
    .map((node) => {
      const indent = "  ".repeat(Math.max(0, node.depth - 1));
      const marks = [];
      if (node.isHead) marks.push("HEAD");
      if (!node.active) marks.push("已撤销");
      const suffix = marks.length > 0 ? `  [${marks.join(", ")}]` : "";
      let type;
      if (node.memberTypes != null) {
        const joined = node.memberTypes
          .map((t) => t.replace(/-object$/, ""))
          .join("+");
        // 聚合节点（超分子折叠段）花括号包裹，多对象分子节点方括号包裹
        type =
          node.supraId != null
            ? `{${joined}}`
            : node.molId != null
              ? `[${joined}]`
              : joined;
      } else {
        type = node.type ?? "?";
      }
      return `${indent}${node.id}  ${type}${suffix}`;
    })
    .join("\n");
}

/**
 * tree 命令：以缩进树形式打印时间回溯树
 * @param {Object} session - 板会话
 * @param {string[]} _args - 位置参数（未使用）
 * @param {Object} flags - 标志（json）
 * @returns {Promise<void>}
 */
async function cmdTree(session, _args, flags) {
  const tree = await session.api.queryUndoTree();
  if (flags.json === true) {
    console.log(JSON.stringify(tree, null, 2));
    return;
  }
  console.log(formatUndoTree(tree));
  if (tree.redoStack.length > 0) {
    console.log(
      `重做栈：${tree.redoStack.map((entry) => entry.targetId).join(", ")}`,
    );
  }
}

/**
 * 解析逗号分隔的数对
 * @param {string} text - "x,y" 文本
 * @param {string} flagName - 标志名（错误提示用）
 * @returns {{x: number, y: number}} 坐标
 */
function parsePair(text, flagName) {
  const [x, y] = String(text).split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`无效 ${flagName}：${text}（应为 "x,y"）`);
  }
  return { x, y };
}

/**
 * 解析四元矩阵参数
 * @param {string} text - "a,b,c,d" 文本
 * @param {string} flagName - 标志名（错误提示用）
 * @returns {{a: number, b: number, c: number, d: number}} 矩阵线性部分
 */
function parseMatrix(text, flagName) {
  const [a, b, c, d] = String(text).split(",").map(Number);
  if (![a, b, c, d].every(Number.isFinite)) {
    throw new Error(`无效 ${flagName}：${text}（应为 "a,b,c,d"）`);
  }
  return { a, b, c, d };
}

/**
 * 2x2 矩阵左乘：返回 delta × current
 * @param {{a: number, b: number, c: number, d: number}} delta - 增量矩阵
 * @param {{a: number, b: number, c: number, d: number}} current - 当前矩阵
 * @returns {{a: number, b: number, c: number, d: number}} 乘积
 */
function multiplyMatrix(delta, current) {
  return {
    a: delta.a * current.a + delta.b * current.c,
    b: delta.a * current.b + delta.b * current.d,
    c: delta.c * current.a + delta.d * current.c,
    d: delta.c * current.b + delta.d * current.d,
  };
}

/**
 * 由 flags 构造 modify patch；增量标志换算为全量（CLI 侧读当前值计算）
 * @param {Object} flags - 标志
 * @param {Object} current - 对象当前状态（含 position、transform）
 * @returns {Promise<Object>} patch（position/transform/property/data 子集）
 */
async function buildModifyPatch(flags, current) {
  const patch = {};
  if (typeof flags.displacement === "string") {
    const d = parsePair(flags.displacement, "displacement");
    patch.position = {
      x: (current?.position?.x ?? 0) + d.x,
      y: (current?.position?.y ?? 0) + d.y,
    };
  }
  if (typeof flags["transform-delta"] === "string") {
    const delta = parseMatrix(flags["transform-delta"], "transform-delta");
    const base = current?.transform ?? { a: 1, b: 0, c: 0, d: 1 };
    patch.transform = multiplyMatrix(delta, base);
  }
  if (typeof flags.position === "string") {
    patch.position = parsePair(flags.position, "position");
  }
  if (typeof flags.transform === "string") {
    patch.transform = parseMatrix(flags.transform, "transform");
  }
  if (typeof flags.property === "string") {
    patch.property = parseLenientJson(flags.property);
  }
  if (typeof flags.data === "string") {
    patch.data = await parseDataArgument(flags.data);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error(
      "modify 需要至少一个修改标志（--displacement/--transform-delta/--position/--transform/--property/--data）。",
    );
  }
  return patch;
}

/**
 * 修改是否含全量标志（choice 全量仅单对象 choice 允许）
 * @param {Object} flags - 标志
 * @returns {boolean} 是否含全量标志
 */
function hasFullPatchFlags(flags) {
  return ["position", "transform", "property", "data"].some(
    (key) => typeof flags[key] === "string",
  );
}

/**
 * 确保对象在 AOM 活动图中（未选中则补选择），返回其当前状态
 * @param {Object} session - 板会话
 * @param {string[]} ids - 对象 id 列表
 * @param {Object} [options] - 选择选项（supraKey 指定超分子；choice 命名选择）
 * @returns {Promise<Object[]>} 对象当前状态（queryObjects 摘要）
 */
async function ensureActive(session, ids, options) {
  const summaries = await session.api.queryObjects(ids);
  const missing = ids.filter((id, i) => !summaries[i]);
  if (missing.length > 0) {
    throw new Error(`对象不存在：${missing.join(", ")}`);
  }
  const inactive = ids.filter((id, i) => !summaries[i].isActive);
  if (inactive.length > 0) {
    await session.api.addActiveObjects(inactive, options);
  }
  return summaries;
}

/**
 * 解析 choice 的成员对象 id 列表
 * @param {Object} session - 板会话
 * @param {string} name - choice 名
 * @returns {Promise<string[]>} 成员对象 id 列表
 * @throws {Error} choice 不存在时
 *
 * @description
 * daemon 模式优先走 AOM 注册表（权威：在册即在板上且活动）；注册表未命中再回退
 * buffer 文件（daemon 重启后未恢复的种子）。文件模式选择不跨进程驻留，buffer 文件
 * 是唯一载体。
 */
async function resolveChoiceMembers(session, name) {
  if (session.mode === "daemon") {
    const choices = await session.api.queryChoices();
    const choice = choices.find((h) => h.name === name);
    if (choice) return choice.ids;
  }
  const buffer = await loadChoices(session.rootPath);
  const ids = buffer.choices[name];
  if (!ids) throw new Error(`choice 不存在：${name}`);
  return ids;
}

/**
 * choose 命令：把对象选入命名 choice（同一对象同时只属一个 choice）
 * @param {Object} session - 板会话
 * @param {string[]} args - 位置参数（对象 id 列表）
 * @param {Object} flags - 标志（choice）
 * @returns {Promise<void>}
 */
async function cmdChoose(session, args, flags) {
  const name = typeof flags.choice === "string" ? flags.choice : null;
  if (!name) throw new Error("choose 需要 --choice <名>。");
  if (!isValidChoiceName(name)) {
    throw new Error(`非法 choice 名：${name}（不可为空、含 "/" 或以 "~" 开头）。`);
  }
  if (args.length === 0) throw new Error("choose 需要至少一个对象 id。");
  const summaries = await session.api.queryObjects(args);
  const missing = args.filter((id, i) => !summaries[i]);
  if (missing.length > 0) {
    throw new Error(`对象不存在：${missing.join(", ")}`);
  }
  await session.api.addActiveObjects(args, { choice: name });
  // buffer 文件仍维护：daemon 重启后的自愈种子
  await setChoice(session.rootPath, name, args);
  printResult(flags, { choice: name, ids: args }, `choose ok（${name}：${args.join(", ")}）`);
}

/**
 * choices 命令：列出全部 choice 及成员状态
 * @param {Object} session - 板会话
 * @returns {Promise<void>}
 *
 * @description
 * daemon 模式以 AOM 注册表为权威（在册成员必然在板上且活动，无需 missing/active 标注）；
 * buffer 文件中未恢复的 choice（daemon 重启后未再操作）以 active:false 标注。
 * 文件模式选择不跨进程驻留，直接列 buffer 文件并标注。
 */
async function cmdChoices(session, _args, flags) {
  const buffer = await loadChoices(session.rootPath);
  const out = {};
  const registered = new Set();
  if (session.mode === "daemon") {
    for (const { name, ids } of await session.api.queryChoices()) {
      registered.add(name);
      out[name] = ids.map((id) => ({ id, missing: false, active: true }));
    }
  }
  for (const [name, ids] of Object.entries(buffer.choices)) {
    if (registered.has(name)) continue;
    const summaries = await session.api.queryObjects(ids);
    out[name] = ids.map((id, i) => ({
      id,
      missing: !summaries[i],
      active: summaries[i]?.isActive ?? false,
    }));
  }
  if (flags.json === true) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const entries = Object.entries(out);
  if (entries.length === 0) {
    console.log("（无 choice）");
    return;
  }
  const lines = [];
  for (const [name, members] of entries) {
    lines.push(`${name}（${members.length} 成员）：`);
    for (const member of members) {
      lines.push(
        `  ${member.id}${member.active ? "  active" : "  active:false"}${member.missing ? "  missing" : ""}`,
      );
    }
  }
  console.log(lines.join("\n"));
}

/**
 * unchoose 命令：结束一个 choice（--apply 提交修改 / --discard 放弃修改）
 * @param {Object} session - 板会话
 * @param {string[]} args - 位置参数（choice 名）
 * @param {Object} flags - 标志（apply、discard）
 * @returns {Promise<void>}
 *
 * @description
 * 两标志必传其一。--apply 经 commitObjects 提交（含取消选择分子）；--discard 经 discardActiveObjects 放弃。
 * 文件模式下选择不跨进程驻留，本命令主要语义是清理 buffer（apply/discard 对不在 AOM 的对象为空操作）。
 */
async function cmdUnchoose(session, args, flags) {
  const name = args[0];
  if (!name) throw new Error("unchoose 需要 choice 名。");
  const apply = flags.apply === true;
  const discard = flags.discard === true;
  if (apply === discard) {
    throw new Error("unchoose 需要且只能传 --apply 或 --discard 之一。");
  }
  const ids = await resolveChoiceMembers(session, name);
  const summaries = await session.api.queryObjects(ids);
  const alive = ids.filter((id, i) => summaries[i]);
  if (alive.length > 0) {
    if (apply) {
      await session.api.commitObjects(alive);
    } else {
      await session.api.discardActiveObjects(alive);
    }
  }
  await removeChoice(session.rootPath, name);
  const dropped = ids.length - alive.length;
  printResult(
    flags,
    {
      choice: name,
      action: apply ? "apply" : "discard",
      dropped,
    },
    `unchoose ok（${name}，${apply ? "已提交" : "已放弃"}${dropped > 0 ? `，${dropped} 个对象已不在板上` : ""}）`,
  );
}

/**
 * modify 命令：修改 choice 或单对象
 * @param {Object} session - 板会话
 * @param {string[]} args - 位置参数（对象 id；与 --choice 二选一）
 * @param {Object} flags - 标志（choice 与修改标志）
 * @returns {Promise<void>}
 *
 * @description
 * 语义矩阵：
 * - choice 增量（--displacement/--transform-delta）：逐成员换算后批量修改
 * - choice 全量（--position/--transform/--property/--data）：仅单成员 choice 允许
 * - 单对象（args[0]，不在任何 choice）：自动 choose→modify→commit 超分子链，一条记录原子完成
 * - 单对象（在某 choice）：按该 choice 语义修改
 *
 * daemon 模式 choice 修改驻留 AOM（等 unchoose --apply 一次性提交）；
 * 文件模式 choice 修改原子完成 choose→modify→commit（每次一条记录）。
 */
async function cmdModify(session, args, flags) {
  const choiceName = typeof flags.choice === "string" ? flags.choice : null;
  if (choiceName) {
    await modifyChoice(session, choiceName, flags);
    return;
  }
  const id = args[0];
  if (!id) throw new Error("modify 需要对象 id 或 --choice <名>。");
  // 注册表权威（对象摘要携带所属 choice 名）；未驻留时回退 buffer 文件（重启后未恢复的 choice）
  const summary = await queryOne(session, id);
  const owner = summary.choice ?? (await findChoiceOf(session.rootPath, id));
  if (owner) {
    await modifyChoice(session, owner, flags, id);
    return;
  }
  // 单对象未选中：choose→modify→commit 超分子链，一条记录原子完成
  // supraKey 显式传给每个分子操作，否则其内部各自开启内层超分子，合并不到一处
  const patch = await buildModifyPatch(flags, summary);
  const supraKey = `cli-supra/${Date.now()}`;
  await session.api.beginSupra(supraKey);
  try {
    await session.api.addActiveObjects([id], { supraKey });
    await session.api.modifyObject(id, patch);
    await session.api.commitObjects([id], { supraKey });
    await session.api.endSupra(supraKey);
  } catch (error) {
    await session.api.abortSupra(supraKey);
    throw error;
  }
  printResult(flags, { objectId: id, committed: true }, `modify ok（${id}，超分子链）`);
}

/**
 * 查询单个对象当前状态（不存在时报错）
 * @param {Object} session - 板会话
 * @param {string} id - 对象 id
 * @returns {Promise<Object>} 对象摘要
 */
async function queryOne(session, id) {
  const [summary] = await session.api.queryObjects([id]);
  if (!summary) throw new Error(`对象不存在：${id}`);
  return summary;
}

/**
 * 按 choice 语义修改对象
 * @param {Object} session - 板会话
 * @param {string} name - choice 名
 * @param {Object} flags - 修改标志
 * @param {string} [onlyId] - 仅修改该成员（单对象走 choice 路径时）
 * @returns {Promise<void>}
 */
async function modifyChoice(session, name, flags, onlyId) {
  const all = await resolveChoiceMembers(session, name);
  const ids = onlyId ? [onlyId] : all;
  if (hasFullPatchFlags(flags) && ids.length > 1) {
    throw new Error(
      `choice ${name} 含 ${ids.length} 个对象，全量修改（--position/--transform/--property/--data）仅单对象 choice 允许；请用增量标志（--displacement/--transform-delta）。`,
    );
  }
  const summaries = await session.api.queryObjects(ids);
  const missing = ids.filter((id, i) => !summaries[i]);
  if (missing.length > 0) {
    throw new Error(`对象不存在：${missing.join(", ")}`);
  }
  // 逐对象换算 patch（增量依赖各自当前值）
  const patches = [];
  for (let i = 0; i < ids.length; i++) {
    patches.push({
      objectId: ids[i],
      patch: await buildModifyPatch(flags, summaries[i]),
    });
  }
  if (session.mode === "daemon") {
    // daemon 模式：驻留 AOM，修改等 unchoose --apply 一次性提交；
    // 自愈重选携带 choice，重启后重建注册表
    await ensureActive(session, ids, { choice: name });
    await session.api.modifyObjects(patches);
    printResult(
      flags,
      { choice: name, ids, committed: false, pending: true },
      `modify ok（${name}：${ids.join(", ")}，驻留待提交）`,
    );
    return;
  }
  // 文件模式：choose→modify→commit 超分子链原子完成（supraKey 显式传入，见单对象路径）
  const supraKey = `cli-supra/${Date.now()}`;
  await session.api.beginSupra(supraKey);
  try {
    await ensureActive(session, ids, { supraKey, choice: name });
    await session.api.modifyObjects(patches);
    await session.api.commitObjects(ids, { supraKey });
    await session.api.endSupra(supraKey);
  } catch (error) {
    await session.api.abortSupra(supraKey);
    throw error;
  }
  printResult(
    flags,
    { choice: name, ids, committed: true },
    `modify ok（${name}：${ids.join(", ")}，已提交）`,
  );
}

/**
 * 命令表
 * @description 键为命令名；create 标志为 true 的命令在板目录不存在时创建空板。
 * @type {Object<string, {run: Function, create?: boolean}>}
 */
const COMMANDS = {
  create: { run: cmdCreate, create: true },
  info: { run: cmdInfo },
  list: { run: cmdList },
  show: { run: cmdShow },
  add: { run: cmdAdd },
  delete: { run: cmdDelete },
  undo: { run: cmdUndo },
  redo: { run: cmdRedo },
  ops: { run: cmdOps },
  tree: { run: cmdTree },
  choose: { run: cmdChoose },
  choices: { run: cmdChoices },
  unchoose: { run: cmdUnchoose },
  modify: { run: cmdModify },
};

export { COMMANDS };
