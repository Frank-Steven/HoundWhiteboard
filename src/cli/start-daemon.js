#!/usr/bin/env node
/**
 * @file 板 daemon 启动入口
 * @description 用法：yarn daemon <板目录> [--source 身份] [--relay 中继地址] [--board-id 房间] [--port 端口]。
 * @module cli/start-daemon
 * @author Zhou Chenyu
 */

import { startBoardDaemon } from "./board-daemon.js";
import { resolveBoardPath } from "./board-path.js";
import { parseArgv } from "./args.js";

const { flags } = parseArgv(process.argv.slice(2));
const options = {
  rootPath: flags.path,
  source: flags.source,
  relayUrl: flags.relay,
  boardId: flags["board-id"],
  port: flags.port != null ? Number(flags.port) : undefined,
};
if (!options.rootPath) {
  console.error(
    "用法：yarn daemon --path <板目录> [--source 身份] [--relay 中继地址] [--board-id 房间] [--port 端口]",
  );
  process.exit(1);
}
options.rootPath = resolveBoardPath(options.rootPath);

const daemon = await startBoardDaemon(options);
console.log(`板 daemon 已启动：ws://127.0.0.1:${daemon.port}`);
console.log(`板目录：${options.rootPath}`);
console.log(`身份：${daemon.source}`);
if (options.relayUrl) {
  console.log(`中继：${options.relayUrl}（房间 ${options.boardId ?? options.rootPath}）`);
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
