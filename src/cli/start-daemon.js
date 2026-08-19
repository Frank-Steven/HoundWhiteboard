#!/usr/bin/env node
/**
 * @file 板 daemon 进程入口
 * @description 用法：node start-daemon.js --name <名> --path <板目录> [--create] [--source 身份] [--relay 中继地址] [--board-id 房间] [--port 端口]。
 * @module cli/start-daemon
 * @author Zhou Chenyu
 */

import { startBoardDaemon } from "./board-daemon.js";
import { resolveBoardPath } from "./board-path.js";
import { parseArgv } from "./args.js";

const { flags } = parseArgv(process.argv.slice(2));
const name = flags.name;
const rootPath = flags.path;
if (typeof name !== "string" || name === "" || typeof rootPath !== "string" || rootPath === "") {
  console.error(
    "用法：node start-daemon.js --name <名> --path <板目录> [--source 身份] [--relay 中继地址] [--board-id 房间] [--port 端口]",
  );
  process.exit(1);
}

const resolvedPath = resolveBoardPath(rootPath);

const daemon = await startBoardDaemon({
  name,
  rootPath: resolvedPath,
  source: flags.source,
  relayUrl: flags.relay,
  boardId: flags["board-id"],
  port: flags.port != null ? Number(flags.port) : undefined,
});
console.log(`daemon ${name} 已启动：ws://127.0.0.1:${daemon.port}`);
console.log(`板目录：${resolvedPath}`);
console.log(`身份：${daemon.source}`);
if (flags.relay) {
  console.log(`中继：${flags.relay}（房间 ${flags["board-id"] ?? resolvedPath}）`);
} else {
  console.log("中继：未连接（单机权威端）");
}

process.on("SIGINT", async () => {
  await daemon.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await daemon.close();
  process.exit(0);
});
