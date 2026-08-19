#!/usr/bin/env node
/**
 * demo 静态服务：零依赖把 src/ 目录作为静态站点服务，供浏览器双开验证（无 Tauri 环境时自动降级内存板）。
 * 用法：node scripts/serve-demo.mjs [端口]（默认 8000，或环境变量 HWB_DEMO_PORT）
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const port = Number(process.argv[2] ?? process.env.HWB_DEMO_PORT ?? 8000);

/** 扩展名到 MIME 的映射 */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let urlPath = decodeURIComponent(url.pathname);
    if (urlPath === "/") urlPath = "/demo/whiteboard.html";
    const abs = path.resolve(ROOT, "." + urlPath);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const info = await stat(abs);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(await readFile(abs));
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(port, () => {
  console.log(`demo 静态服务：http://127.0.0.1:${port}/demo/whiteboard.html`);
  console.log("浏览器双开验证：开两个标签页，地址加参数，如");
  console.log(`http://127.0.0.1:8000/demo/whiteboard.html?relay=ws://127.0.0.1:8377&source=A`);
  console.log(`http://127.0.0.1:8000/demo/whiteboard.html?relay=ws://127.0.0.1:8377&source=B`);
});
