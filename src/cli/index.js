#!/usr/bin/env node
/**
 * @file Hound Whiteboard CLI 入口
 * @description 命令行第二前端：直接以 BoardApi 契约读写板文件，全程 Node 环境。
 * @module cli/index
 * @author Zhou Chenyu
 */

import { openBoardSession } from "./board-session.js";
import { connectDaemon } from "./daemon-client.js";
import { readActiveDaemonRoot } from "./board-daemon.js";
import { resolveBoardPath } from "./board-path.js";
import { COMMANDS } from "./commands.js";

/**
 * 用法文本
 * @type {string}
 */
const USAGE = `用法：hwb <命令> [参数] [--path <板目录>] [--标志 值]

命令：
  create --path <板目录> [--width 800] [--height 600]   创建空板
  info [--path <板目录>]                                打印板元数据与统计（含活动链 chain）
  list [--path <板目录>]                                列出活动与 trash 对象
  show <对象id> [--path <板目录>]                       打印对象序列化数据
  add --type <类型> [--data '<json>'|"@文件"] [--position x,y] [--path <板目录>]   创建并提交对象
  delete <对象id...> [--path <板目录>]                  删除对象（可撤销）
  undo [<操作id>] [--path <板目录>]                     撤销；指定操作 id 时撤销该操作，省略时撤销本端最近操作
  redo [--path <板目录>]                                重做一步

通用标志：
  --path <板目录>   板目录路径（支持 ~ 展开）；省略时操作当前活动 daemon 持有的板
  --source <来源>   操作作者命名空间（默认 cli），决定新对象 id 前缀

协作模式：
  板目录存在 daemon（.daemon.json）时自动连接，操作经 daemon 执行；
  daemon 若连了中继，CLI 操作与 GUI 实时互见。启动 daemon：yarn daemon --path <板目录>
`;

/**
 * 解析命令行参数
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{command: string, args: string[], flags: Object}} 解析结果
 *
 * @description
 * 板目录经 --path 传入，位置参数全部是命令参数（对象 id / 操作 id），不参与路径。
 */
function parseArgv(argv) {
  const [command, ...rest] = argv;
  const args = [];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      args.push(token);
    }
  }
  return { command, args, flags };
}

/**
 * CLI 主流程：解析 → 开会话 → 执行命令 → 落盘 → 关闭
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  const { command, args, flags } = parsed;
  const spec = COMMANDS[command];
  let board;
  if (typeof flags.path === "string" && flags.path !== "") {
    board = resolveBoardPath(flags.path);
  } else if (spec && !spec.create) {
    // --path 省略时操作当前活动 daemon 持有的板
    board = (await readActiveDaemonRoot()) ?? undefined;
  }
  if (!spec || !board) {
    console.log(USAGE);
    if (command && command !== "help" && !board) {
      console.error("缺少板目录：传 --path <板目录>，或先启动 daemon 后可省略。");
    }
    process.exit(command === "help" || !command ? 0 : 1);
  }

  let session = null;
  let viaDaemon = false;
  if (!spec.create) {
    session = await connectDaemon(board);
    viaDaemon = session != null;
  }
  if (!session) {
    session = await openBoardSession(board, {
      create: spec.create === true,
      width: Number(flags.width ?? 0) || 0,
      height: Number(flags.height ?? 0) || 0,
      source: flags.source ?? "cli",
    });
  }
  try {
    await spec.run(session, args, { ...flags, source: flags.source ?? "cli" });
    if (!viaDaemon) {
      await session.flush();
    }
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
