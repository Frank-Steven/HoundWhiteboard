#!/usr/bin/env node
/**
 * @file 同步中继启动入口
 * @description 启动 WebSocket 同步中继服务器（板即房间）。用法：node src/host/sync/start-relay.js [端口]。
 * @module host/sync/start-relay
 * @author Zhou Chenyu
 */

import { createRelayServer } from "./relay-server.js";
import os from "node:os";

/**
 * 枚举本机局域网 IPv4 地址
 * @returns {string[]} 局域网地址列表
 */
function lanIPv4Addresses() {
  const out = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return out;
}

const port = Number(process.argv[2] ?? process.env.HWB_RELAY_PORT ?? 8377);
const server = createRelayServer({ port });
console.log(`本机地址：ws://127.0.0.1:${server.port}`);
for (const addr of lanIPv4Addresses()) {
  console.log(`局域网地址：ws://${addr}:${server.port}（跨设备 / 浏览器双开用）`);
}

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
