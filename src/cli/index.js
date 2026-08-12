#!/usr/bin/env node
/**
 * @file Hound Whiteboard CLI 入口
 * @description 命令行前端：读命令直读板文件或经 daemon 查询，写命令一律经 daemon 执行。
 * @module cli/index
 * @author Zhou Chenyu
 */

import { openBoardSession } from "./board-session.js";
import { connectDaemonByName, shutdownDaemon } from "./daemon-client.js";
import {
  isValidDaemonName,
  readEntry,
  isEntryAlive,
  listEntries,
} from "./daemon-registry.js";
import { readDaemonDescriptor, isDaemonAlive } from "./board-daemon.js";
import { resolveBoardPath } from "./board-path.js";
import { parseArgv } from "./args.js";
import { COMMANDS, READ_COMMANDS, WRITE_COMMANDS } from "./commands.js";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 包版本号（读 package.json，供 --version 输出）
 * @type {string}
 */
const VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
).version;

/**
 * daemon 进程入口（spawn detached 的目标）
 * @type {string}
 */
const START_DAEMON_PATH = fileURLToPath(new URL("./start-daemon.js", import.meta.url));

/** 等待后台 daemon 就绪的超时毫秒数 */
const START_READY_TIMEOUT_MS = 15000;

/**
 * 用法文本
 * @type {string}
 */
const USAGE = `用法：hwb <命令> [--daemon <名> | --path <板目录>] [--标志 值]

daemon 管理：
  daemon start --name <名> --path <板目录> [--source <身份>]   后台启动 daemon（板必须已存在，用 create 建板）
  daemon stop --name <名>                                            停止 daemon（排空 in-flight、落盘、注销注册表）
  daemon status [--name <名>]                                        查单个 daemon；省略 name 时列出全部

建板（离线，不接 daemon）：
  create --path <板目录> [--width 800] [--height 600]   创建空板

读命令（--daemon <名> 经 daemon 查询，或 --path <板目录> 直读板文件）：
  info                                    打印板元数据与统计（含活动链 chain）
  list                                    列出活动与 trash 对象
  show <对象id>                           打印对象序列化数据
  ops [--source 来源] [--type 类型] [--limit N]   打印操作记录明细
  tree                                    以缩进树打印时间回溯树（HEAD 与已撤销分支）
  choices                                 列出全部 choice buffer 及成员状态

写命令（仅 --daemon <名>）：
  add --type <类型> [--data '<json>'|"@文件"] [--property '<json>'] [--position x,y]   创建并提交对象
  delete <对象id...>                      删除对象（可撤销）
  undo [<操作id>]                         撤销；指定操作 id 时撤销该操作，省略时撤销本端最近操作
  redo                                    重做一步
  choose <对象id...> --choice <名>        把对象选入命名 choice
  unchoose <名> (--apply|--discard)       提交或放弃一个 choice
  modify <对象id> <修改标志>               修改单对象（未选中时自动成链提交）
  modify --choice <名> <修改标志>          修改 choice 成员（增量逐对象换算）

修改标志：
  --displacement dx,dy        位置增量（choice/单对象均可）
  --transform-delta a,b,c,d   变换增量，左乘当前变换（choice/单对象均可）
  --position x,y              全量位置（choice 仅单成员允许）
  --transform a,b,c,d         全量变换（choice 仅单成员允许）
  --property '<json>'         全量样式属性（choice 仅单成员允许）
  --data '<json>'|"@文件"     全量数据（choice 仅单成员允许）

通用标志：
  --daemon <名>   目标 daemon（写命令必填；读命令与 --path 二选一）
  --path <板目录>  读命令直读板文件（不接 daemon，零写盘）；daemon start 指定板位置
  --source <来源>  操作作者命名空间（默认 cli），决定新对象 id 前缀
  --json          输出为纯 JSON（默认输出为人类可读文本）
  -h, --help      打印用法
  --version       打印版本号

协作模式：
  daemon 若连了中继（--relay），CLI 操作与 GUI 实时互见。
`;

/**
 * 等待后台 daemon 就绪（注册表条目出现且端口可连通）
 * @param {string} name - daemon 名
 * @returns {Promise<boolean>} 是否就绪
 */
async function waitDaemonReady(name) {
  const deadline = Date.now() + START_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const desc = await readEntry(name);
    if (desc !== null && (await isEntryAlive(desc))) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * daemon start 子命令：后台 spawn 并等待就绪
 * @param {Object} flags - 标志
 * @returns {Promise<void>}
 */
async function runDaemonStart(flags) {
  const name = flags.name;
  const rootPath = resolveBoardPath(flags.path);
  if (!isValidDaemonName(name)) {
    throw new Error(
      `非法 daemon name：${name}（仅允许字母/数字/.-_）。`,
    );
  }
  // 前置校验：name 查重与板目录占用（快速失败，避免后台进程起后才发现）
  const registered = await readEntry(name);
  if (registered !== null && (await isEntryAlive(registered))) {
    throw new Error(
      `daemon ${name} 已在运行（板目录 ${registered.rootPath}）。`,
    );
  }
  if (flags.create !== true) {
    // 板必须已存在（create 建板）；board.json 是板的标志文件
    try {
      await access(path.join(rootPath, "board.json"));
    } catch {
      throw new Error(
        `板目录不存在或不是板：${rootPath}（先用 hwb create --path <板目录> 建板）。`,
      );
    }
    const existing = await readDaemonDescriptor(rootPath);
    if (existing && (await isDaemonAlive(existing.port))) {
      throw new Error(
        `板目录已有 daemon 在运行（端口 ${existing.port}）。`,
      );
    }
  }  const childArgs = [
    START_DAEMON_PATH,
    "--name",
    name,
    "--path",
    rootPath,
  ];
  if (typeof flags.source === "string" && flags.source !== "") {
    childArgs.push("--source", flags.source);
  }
  if (typeof flags.relay === "string" && flags.relay !== "") {
    childArgs.push("--relay", flags.relay);
  }
  if (typeof flags["board-id"] === "string" && flags["board-id"] !== "") {
    childArgs.push("--board-id", flags["board-id"]);
  }
  if (typeof flags.port === "string" && flags.port !== "") {
    childArgs.push("--port", flags.port);
  }
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (!(await waitDaemonReady(name))) {
    throw new Error(`daemon ${name} 启动超时（${START_READY_TIMEOUT_MS}ms 内未就绪）。`);
  }
  const desc = await readEntry(name);
  console.log(`daemon ${name} 已启动（后台）：${desc.rootPath}（端口 ${desc.port}，身份 ${desc.source}）`);
}

/**
 * daemon status 子命令
 * @param {Object} flags - 标志
 * @returns {Promise<void>}
 */
async function runDaemonStatus(flags) {
  if (typeof flags.name === "string" && flags.name !== "") {
    const desc = await readEntry(flags.name);
    if (desc === null) throw new Error(`daemon ${flags.name} 未在运行。`);
    const alive = await isEntryAlive(desc);
    if (flags.json === true) {
      console.log(JSON.stringify({ ...desc, alive }, null, 2));
    } else {
      console.log(
        `${desc.name}  ${alive ? "运行中" : "已停止（僵尸条目）"}  板：${desc.rootPath}  端口：${desc.port}  身份：${desc.source}  启动：${desc.startedAt}`,
      );
    }
    return;
  }
  const entries = await listEntries();
  const out = [];
  for (const desc of entries) {
    const alive = await isEntryAlive(desc);
    if (flags.json === true) {
      out.push({ ...desc, alive });
    } else {
      console.log(
        `${desc.name}  ${alive ? "运行中" : "已停止（僵尸条目）"}  板：${desc.rootPath}  端口：${desc.port}  身份：${desc.source}  启动：${desc.startedAt}`,
      );
    }
  }
  if (flags.json === true) {
    console.log(JSON.stringify(out, null, 2));
  } else if (entries.length === 0) {
    console.log("（无 daemon）");
  }
}

/**
 * daemon 子命令分发
 * @param {string[]} args - 位置参数（子命令名）
 * @param {Object} flags - 标志
 * @returns {Promise<void>}
 */
async function runDaemonCommand(args, flags) {
  const sub = args[0];
  switch (sub) {
    case "start":
      await runDaemonStart(flags);
      return;
    case "stop": {
      const name = flags.name;
      if (!isValidDaemonName(name)) {
        throw new Error(`daemon stop 需要 --name <名>。`);
      }
      const ok = await shutdownDaemon(name);
      if (!ok) {
        throw new Error(`daemon ${name} 停机确认超时（注册表条目仍在）。`);
      }
      console.log(`daemon ${name} 已停止。`);
      return;
    }
    case "status":
      await runDaemonStatus(flags);
      return;
    default:
      throw new Error(`未知 daemon 子命令：${sub}（支持 start/status/stop）。`);
  }
}

/**
 * CLI 主流程：解析 → 寻址 → 执行命令
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
  if (!spec) {
    if (command === "daemon") {
      try {
        await runDaemonCommand(args, flags);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
      return;
    }
    console.log(USAGE);
    if (command && command !== "help") {
      console.error(`未知命令：${command}`);
    }
    process.exit(command === "help" || !command ? 0 : 1);
  }

  const isRead = READ_COMMANDS.has(command);
  if (command === "create") {
    // 离线建板：不经 daemon，直开会话创建
    const board = resolveBoardPath(flags.path);
    const session = await openBoardSession(board, {
      create: true,
      width: Number(flags.width ?? 0) || 0,
      height: Number(flags.height ?? 0) || 0,
      source: flags.source ?? "cli",
    });
    session.rootPath = board;
    try {
      await spec.run(session, args, flags);
      await session.flush();
    } finally {
      await session.close();
    }
    return;
  }
  const hasName = typeof flags.daemon === "string" && flags.daemon !== "";
  const hasPath = typeof flags.path === "string" && flags.path !== "";
  if (hasName && hasPath) {
    console.error("--daemon 与 --path 互斥，只能二选一。");
    process.exit(1);
  }
  if (!isRead && hasPath) {
    console.error(
      `--path 仅读命令可用；写命令 ${command} 请用 --daemon <名> 指定目标 daemon。`,
    );
    process.exit(1);
  }
  if (!hasName && !hasPath) {
    console.error(
      isRead
        ? "缺少目标：读命令可用 --daemon <名> 或 --path <板目录>。"
        : `写命令 ${command} 需要 --daemon <名> 指定目标 daemon。`,
    );
    process.exit(1);
  }

  let session;
  if (isRead && hasPath) {
    // 直读板文件：不接 daemon，指纹种子保证 flush 零写盘
    const board = resolveBoardPath(flags.path);
    session = await openBoardSession(board, {
      create: false,
      source: flags.source ?? "cli",
    });
    session.rootPath = board;
    try {
      await spec.run(session, args, flags);
      await session.flush();
    } finally {
      await session.close();
    }
    return;
  }

  session = await connectDaemonByName(flags.daemon);
  if (session === null) {
    console.error(
      `daemon ${flags.daemon} 不可用：注册表无条目或端口不可连通，请先 hwb daemon start --name ${flags.daemon} --path <板目录>。`,
    );
    process.exit(1);
  }
  session.mode = "daemon";
  try {
    await spec.run(session, args, flags);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
