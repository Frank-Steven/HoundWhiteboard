#!/usr/bin/env node
/**
 * @file 同步中继启动入口
 * @description 启动 WebSocket 同步中继服务器（板即房间）。用法：node src/host/sync/start-relay.js [端口]。
 * @module host/sync/start-relay
 * @author Zhou Chenyu
 */

import { createRelayServer } from "./relay-server.js";

const port = Number(process.argv[2] ?? process.env.HWB_RELAY_PORT ?? 8377);
const server = createRelayServer({ port });
console.log(`同步中继已启动：ws://127.0.0.1:${server.port}`);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
