#!/usr/bin/env node
/**
 * @file Hound Whiteboard CLI 入口
 * @description 命令行前端：读命令直读板文件或经 daemon 查询；写命令经 daemon 执行，daemon 不在时按 --path 自治直写（布局 v2 分片）。
 * @module cli/index
 * @author Zhou Chenyu
 */

import { openBoardSession } from "./board-session.js";
import {
  connectDaemonByName,
  connectDaemonByPath,
  shutdownDaemon,
} from "./daemon-client.js";
import { resolveCliIdentity } from "./cli-identity.js";
import {
  isValidDaemonName,
  readEntry,
  isEntryAlive,
  listEntries,
} from "./daemon-registry.js";
import { readDaemonDescriptor, isDaemonAlive } from "./board-daemon.js";
import { resolveBoardPath } from "./board-path.js";
import { parseArgv } from "./args.js";
import { COMMANDS, READ_COMMANDS, WRITE_COMMANDS, cmdExport, cmdImport } from "./commands.js";
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
  daemon start --name <名> --path <板目录> [--source <身份>]   后台启动 daemon；同名同板已存活时引用 +1（幂等）
  daemon release --name <名>                                  引用 -1；归零且无客户端连接则 daemon 自动退出
  daemon stop --name <名>                                     强制归零关闭（无条件，清理描述与注册表）
  daemon status [--name <名>]                                 查单个 daemon（含引用计数）；省略 name 时列出全部

建板与打包（离线，不接 daemon）：
  create --path <板目录> [--width 800] [--height 600]   创建空板
  export --path <板目录> --out <文件.hwb>               导出板为 .hwb（zip 平铺，不含 .daemon.json）
  import <文件.hwb> --path <板目录>                     导入 .hwb 建板（校验格式版本，目标须为空/不存在）

读命令（--daemon <名> 经 daemon 查询，或 --path <板目录> 直读板文件）：
  info                                    打印板元数据与统计（含活动链 chain）
  list                                    列出活动与 trash 对象
  show <对象id>                           打印对象序列化数据
  ops [--source 来源] [--type 类型] [--limit N]   打印操作记录明细
  tree                                    以缩进树打印时间回溯树（HEAD 与已撤销分支）
  choices                                 列出全部 choice buffer 及成员状态

写命令（--daemon <名> 经 daemon 执行；--path <板目录> 时优先走持有 daemon，无 daemon 则自治直写分片）：
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
  --daemon <名>   目标 daemon（写命令优先；读命令与 --path 二选一）
  --path <板目录>  读命令直读板文件（零写盘）；写命令无 daemon 时自治直写分片（身份取 ~/.hound-whiteboard/cli-identity.json）；daemon start 指定板位置
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
  // 分支 1：同名存活 daemon → 幂等引用 +1（同板）或报错（换板）
  const registered = await readEntry(name);
  if (registered !== null && (await isEntryAlive(registered))) {
    if (registered.rootPath !== rootPath) {
      throw new Error(
        `daemon ${name} 已持有板目录 ${registered.rootPath}，同一 name 只能指向一块板。`,
      );
    }
    // 重复 start 同板 = 引用 +1（误操作安全：不会因重复 start 报错，也不会被一次 release 误关）
    const session = await connectDaemonByName(name);
    if (session === null) {
      throw new Error(`daemon ${name} 连接失败（端口 ${registered.port}）。`);
    }
    try {
      const result = await session.api.hold();
      console.log(`daemon ${name} 引用 +1（当前 ${result.refCount}）。`);
    } finally {
      session.close();
    }
    return;
  }
  // 分支 2：新创建（含僵尸覆盖）
  // 板必须已存在（create 建板）；board.json 是板的标志文件
  try {
    await access(path.join(rootPath, "board.json"));
  } catch {
    throw new Error(
      `板目录不存在或不是板：${rootPath}（先用 hwb create --path <板目录> 建板）。`,
    );
  }
  // 板占用检查：同一板目录只能被一个活 daemon 持有（同 name 同板已在上方分支处理）
  const existing = await readDaemonDescriptor(rootPath);
  if (existing && (await isDaemonAlive(existing.port))) {
    throw new Error(
      `板目录已有 daemon 在运行（端口 ${existing.port}）。`,
    );
  }
  const childArgs = [
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
        `${desc.name}  ${alive ? "运行中" : "已停止（僵尸条目）"}  引用：${desc.refCount ?? 1}  板：${desc.rootPath}  端口：${desc.port}  身份：${desc.source}  启动：${desc.startedAt}`,
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
        `${desc.name}  ${alive ? "运行中" : "已停止（僵尸条目）"}  引用：${desc.refCount ?? 1}  板：${desc.rootPath}  端口：${desc.port}  身份：${desc.source}  启动：${desc.startedAt}`,
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
    case "release": {
      const name = flags.name;
      if (!isValidDaemonName(name)) {
        throw new Error(`daemon release 需要 --name <名>。`);
      }
      const session = await connectDaemonByName(name);
      if (session === null) {
        throw new Error(`daemon ${name} 不可用：注册表无条目或端口不可连通。`);
      }
      let refCountAfter;
      try {
        const result = await session.api.release();
        refCountAfter = result.refCount;
      } finally {
        session.close();
      }
      console.log(`daemon ${name} 引用 -1（当前 ${refCountAfter}）。`);
      if (refCountAfter === 0) {
        // 归零自动退出：等待注册表条目消失确认
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if ((await readEntry(name)) === null) {
            console.log(`daemon ${name} 已退出。`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`daemon ${name} 退出确认超时（注册表条目仍在）。`);
      }
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
    if (command === "export") {
      // 离线导出：不接 daemon，直读板文件打包
      try {
        await cmdExport(flags);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
      return;
    }
    if (command === "import") {
      // 离线导入：解压校验建板，不接 daemon
      try {
        await cmdImport(args, flags);
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
  if (!hasName && !hasPath) {
    console.error(
      isRead
        ? "缺少目标：读命令可用 --daemon <名> 或 --path <板目录>。"
        : `写命令 ${command} 需要 --daemon <名> 或 --path <板目录> 指定目标。`,
    );
    process.exit(1);
  }

  if (hasPath) {
    const board = resolveBoardPath(flags.path);
    if (isRead) {
      // 直读板文件：不接 daemon，指纹种子保证 flush 零写盘
      const session = await openBoardSession(board, {
        create: false,
        source: flags.source ?? "cli",
        writeMeta: false,
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
    // 写命令：优先走持有 daemon（快路径）；无 daemon 则自治直写自己分片（布局 v2 离线语义）
    const live = await connectDaemonByPath(board);
    if (live !== null) {
      live.mode = "daemon";
      try {
        await spec.run(live, args, flags);
      } finally {
        live.close();
      }
      return;
    }
    const session = await openBoardSession(board, {
      create: false,
      source: flags.source ?? (await resolveCliIdentity()),
    });
    session.rootPath = board;
    session.mode = "file";
    try {
      await spec.run(session, args, flags);
      await session.flush();
    } finally {
      await session.close();
    }
    return;
  }

  const session = await connectDaemonByName(flags.daemon);
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
