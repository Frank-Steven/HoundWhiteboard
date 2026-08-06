#!/usr/bin/env node
/**
 * @file Hound Whiteboard CLI 入口
 * @description 无头第二前端：直接以 BoardApi 契约读写板文件，全程 Node 环境。
 * @module cli/index
 * @author Zhou Chenyu
 */

import { openBoardSession } from "./board-session.js";
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
`;

/**
 * 解析命令行参数
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{command: string, board: string|undefined, args: string[], flags: Object}} 解析结果
 */
function parseArgv(argv) {
  const [command, board, ...rest] = argv;
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
  return { command, board, args, flags };
}

/**
 * CLI 主流程：解析 → 开会话 → 执行命令 → 落盘 → 关闭
 * @returns {Promise<void>}
 */
async function main() {
  const { command, board, args, flags } = parseArgv(process.argv.slice(2));
  const spec = COMMANDS[command];
  if (!spec || (!board && command !== "help")) {
    console.log(USAGE);
    process.exit(command === "help" || !command ? 0 : 1);
  }

  const session = await openBoardSession(board, {
    create: spec.create === true,
    width: Number(flags.width ?? 0) || 0,
    height: Number(flags.height ?? 0) || 0,
    source: flags.source ?? "cli",
  });
  try {
    await spec.run(session, args, { ...flags, source: flags.source ?? "cli" });
    await session.flush();
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
