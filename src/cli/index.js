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
import { parseArgv } from "./args.js";
import { COMMANDS } from "./commands.js";
import { readFileSync } from "node:fs";

/**
 * 包版本号（读 package.json，供 --version 输出）
 * @type {string}
 */
const VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
).version;

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
  add --type <类型> [--data '<json>'|"@文件"] [--property '<json>'] [--position x,y] [--path <板目录>]   创建并提交对象
  delete <对象id...> [--path <板目录>]                  删除对象（可撤销）
  undo [<操作id>] [--path <板目录>]                     撤销；指定操作 id 时撤销该操作，省略时撤销本端最近操作
  redo [--path <板目录>]                                重做一步
  ops [--source 来源] [--type 类型] [--limit N] [--path <板目录>]   打印操作记录明细
  tree [--path <板目录>]                                以缩进树打印时间回溯树（HEAD 与已撤销分支）
  choose <对象id...> --choice <名> [--path <板目录>]      把对象选入命名 choice buffer
  choices [--path <板目录>]                              列出全部 choice buffer 及成员状态
  unchoose <名> (--apply|--discard) [--path <板目录>]     提交或放弃一个 choice
  modify <对象id> <修改标志> [--path <板目录>]             修改单对象（未选中时自动成链提交）
  modify --choice <名> <修改标志> [--path <板目录>]        修改 choice 成员（增量逐对象换算）

修改标志：
  --displacement dx,dy        位置增量（choice/单对象均可）
  --transform-delta a,b,c,d   变换增量，左乘当前变换（choice/单对象均可）
  --position x,y              全量位置（choice 仅单成员允许）
  --transform a,b,c,d         全量变换（choice 仅单成员允许）
  --property '<json>'         全量样式属性（choice 仅单成员允许）
  --data '<json>'|"@文件"     全量数据（choice 仅单成员允许）


通用标志：
  --path <板目录>   板目录路径（支持 ~ 展开）；省略时操作当前活动 daemon 持有的板
  --source <来源>   操作作者命名空间（默认 cli），决定新对象 id 前缀
  --json            输出为纯 JSON（默认输出为人类可读文本）
  -h, --help        打印用法
  --version         打印版本号

协作模式：
  板目录存在 daemon（.daemon.json）时自动连接，操作经 daemon 执行；
  daemon 若连了中继，CLI 操作与 GUI 实时互见。启动 daemon：yarn daemon --path <板目录>
`;

/**
 * CLI 主流程：解析 → 开会话 → 执行命令 → 落盘 → 关闭
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  const { command, args, flags } = parsed;
  if (command === "--version" || flags.version === true) {
    console.log(VERSION);
    process.exit(0);
  }
  if (command === "-h" || command === "--help" || flags.help === true) {
    console.log(USAGE);
    process.exit(0);
  }
  const spec = COMMANDS[command];
  let board;
  if (typeof flags.path === "string" && flags.path !== "") {
    board = resolveBoardPath(flags.path);
  } else if (spec && !spec.create) {
    // --path 省略时操作当前活动 daemon 持有的板
    board = (await readActiveDaemonRoot()) ?? undefined;
  }
  if (!spec) {
    console.log(USAGE);
    if (command && command !== "help") {
      console.error(`未知命令：${command}`);
    }
    process.exit(command === "help" || !command ? 0 : 1);
  }
  if (!board) {
    console.log(USAGE);
    console.error("缺少板目录：传 --path <板目录>，或先启动 daemon 后可省略。");
    process.exit(1);
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
  // choice buffer 等命令需要模式与板目录：daemon 模式选择驻留 AOM，文件模式 modify 原子成链
  session.mode = viaDaemon ? "daemon" : "file";
  session.rootPath = board;
  try {
    await spec.run(session, args, flags);
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
