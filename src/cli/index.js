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
import { resolveBoardPath, isExistingBoardDir } from "./board-path.js";
import { COMMANDS } from "./commands.js";

/**
 * 用法文本
 * @type {string}
 */
const USAGE = `用法：hwb <命令> <板目录> [参数] [--标志 值]

命令：
  create <板目录> [--width 800] [--height 600]   创建空板
  info <板目录>                                  打印板元数据与统计
  list <板目录>                                  列出活动与 trash 对象
  show <板目录> <对象id>                         打印对象序列化数据
  add <板目录> --type <类型> [--data '<json>'] [--position x,y]   创建并提交对象
  delete <板目录> <对象id...>                    删除对象（可撤销）
  undo <板目录>                                  撤销一步
  redo <板目录>                                  重做一步

通用标志：
  --source <来源>   操作作者命名空间（默认 cli），决定新对象 id 前缀

协作模式：
  板目录存在 daemon（.daemon.json）时自动连接，操作经 daemon 执行；
  daemon 若连了中继，CLI 操作与 GUI 实时互见。启动 daemon 见 yarn daemon。
`;

/**
 * 解析命令行参数
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{command: string, board: string|undefined, args: string[], flags: Object}} 解析结果
 */
function parseArgv(argv) {
  const [command, maybeBoard, ...rest] = argv;
  // 板目录缺省：首个位置参数以 -- 开头时视为命令标志而非板路径（免路径模式）
  const board =
    maybeBoard !== undefined && maybeBoard.startsWith("--")
      ? undefined
      : maybeBoard;
  const all =
    maybeBoard !== undefined && board === undefined
      ? [maybeBoard, ...rest]
      : rest;
  const args = [];
  const flags = {};
  for (let i = 0; i < all.length; i++) {
    const token = all[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = all[i + 1];
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
  return { command, board, args, flags };
}

/**
 * CLI 主流程：解析 → 开会话 → 执行命令 → 落盘 → 关闭
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  const { command, flags } = parsed;
  let board = parsed.board;
  let args = parsed.args;
  const spec = COMMANDS[command];
  if (board && spec && !spec.create) {
    const resolved = resolveBoardPath(board);
    if (await isExistingBoardDir(resolved)) {
      board = resolved;
    } else if (spec.positional === true) {
      // show/delete 等命令的首位置参数是对象 id：非板路径且有活动 daemon 时按对象 id 处理
      const activeRoot = await readActiveDaemonRoot();
      if (activeRoot) {
        args = [board, ...args];
        board = activeRoot;
      } else {
        board = resolved;
      }
    } else {
      board = resolved;
    }
  }
  if (!board && command !== "help" && spec && !spec.create) {
    // daemon 启动后 CLI 可免路径：从活动 daemon 引用取板目录
    board = (await readActiveDaemonRoot()) ?? undefined;
  }
  if (!spec || !board) {
    console.log(USAGE);
    if (command && command !== "help" && !board) {
      console.error("缺少板目录；已启动 daemon 时可直接省略，或传板目录路径。");
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
