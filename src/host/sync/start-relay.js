#!/usr/bin/env node
/**
 * @file 同步中继启动入口
 * @description 启动 WebSocket 同步中继服务器（板即房间）。用法：node src/host/sync/start-relay.js [端口] [--host 地址]。
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

/**
 * 解析命令行参数
 * @param {string[]} argv - 参数列表（process.argv.slice(2)）
 * @returns {{port: number, host: string}} 端口与监听地址
 */
function parseArgs(argv) {
  let port = Number(process.env.HWB_RELAY_PORT ?? 8377);
  let host = "127.0.0.1";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--host") {
      host = argv[++i] ?? host;
    } else if (!argv[i].startsWith("-")) {
      port = Number(argv[i]);
    }
  }
  return { port, host };
}

const { port, host } = parseArgs(process.argv.slice(2));
const server = createRelayServer({ port, host });
await server.ready;
console.log(`本机地址：ws://127.0.0.1:${server.port}`);
if (host === "0.0.0.0" || host === "::") {
  console.log(`已绑定 ${host}（零鉴权，局域网内任何设备均可接入）`);
  for (const addr of lanIPv4Addresses()) {
    console.log(`局域网地址：ws://${addr}:${server.port}（跨设备 / 浏览器双开用）`);
  }
} else {
  console.log(`已绑定 ${host}（仅本机；跨设备请加 --host 0.0.0.0）`);
}

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
