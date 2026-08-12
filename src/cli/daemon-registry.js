/**
 * @file daemon 注册表
 * @description 按 name 登记全部板 daemon：条目落 ~/.hound-whiteboard/daemons/<name>.json，start 登记、stop 注销。
 * @module cli/daemon-registry
 * @author Zhou Chenyu
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

/** daemon name 合法字符集（跨平台文件名安全，不含中文） */
const DAEMON_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * 校验 daemon name
 * @param {string} name - daemon 名
 * @returns {boolean} 是否合法
 */
function isValidDaemonName(name) {
  return typeof name === "string" && DAEMON_NAME_RE.test(name);
}

/**
 * 注册表目录（可用 HWB_DAEMON_DIR 覆盖，测试隔离用）
 * @returns {string} 目录路径
 */
function daemonsDir() {
  return (
    process.env.HWB_DAEMON_DIR ??
    path.join(os.homedir(), ".hound-whiteboard", "daemons")
  );
}

/**
 * 注册表条目文件路径
 * @param {string} name - daemon 名
 * @returns {string} 条目文件路径
 */
function entryFile(name) {
  return path.join(daemonsDir(), `${name}.json`);
}

/**
 * 读取注册表条目
 * @param {string} name - daemon 名
 * @returns {Promise<Object|null>} 条目；不存在或损坏时为 null
 */
async function readEntry(name) {
  try {
    const text = await fs.readFile(entryFile(name), "utf-8");
    const desc = JSON.parse(text);
    if (typeof desc?.port !== "number" || typeof desc?.rootPath !== "string") {
      return null;
    }
    return desc;
  } catch {
    return null;
  }
}

/**
 * 写入注册表条目（临时文件 rename 原子写）
 * @param {Object} desc - 条目（含 name/rootPath/pid/port/source/boardId/startedAt）
 * @returns {Promise<void>}
 */
async function writeEntry(desc) {
  const file = entryFile(desc.name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(desc, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

/**
 * 移除注册表条目
 * @param {string} name - daemon 名
 * @returns {Promise<boolean>} 是否存在并被移除
 */
async function removeEntry(name) {
  try {
    await fs.rm(entryFile(name), { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 列出全部注册表条目
 * @returns {Promise<Object[]>} 条目数组（含僵尸条目，以 alive 字段区分）
 */
async function listEntries() {
  let names = [];
  try {
    const entries = await fs.readdir(daemonsDir());
    names = entries
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length));
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const desc = await readEntry(name);
    if (desc !== null) out.push(desc);
  }
  return out;
}

/**
 * 探测端口上是否有活 daemon
 * @param {number} port - 端口
 * @returns {Promise<boolean>} 是否可连通
 */
function isDaemonAlive(port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (alive) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* 忽略 */
      }
      resolve(alive);
    };
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => finish(false), 500);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      finish(true);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

/**
 * 判断注册表条目是否存活（端口可连通）
 * @param {Object} desc - 条目
 * @returns {Promise<boolean>} 是否存活
 */
async function isEntryAlive(desc) {
  return desc != null && (await isDaemonAlive(desc.port));
}

export {
  isValidDaemonName,
  daemonsDir,
  readEntry,
  writeEntry,
  removeEntry,
  listEntries,
  isDaemonAlive,
  isEntryAlive,
};
