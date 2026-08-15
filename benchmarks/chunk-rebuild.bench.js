/**
 * @file 区块元数据派生重建基准
 * @description 万级对象板冷启动：现状（chunks/ 直读）与全量回放派生的耗时对比，并校验两条路径的层叠图一致性。
 * @module benchmarks/chunk-rebuild
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openBoardSession } from "../src/cli/board-session.js";
import { createNodeDriver } from "../src/io/driver/node.js";
import { bindRoot } from "../src/io/driver/io-driver.js";
import { createSessionStore } from "../src/kernel/store/session-store.js";
import { BoardCore } from "../src/kernel/board/board-core.js";
import { BoardApi } from "../src/kernel/api/board-api.js";
import { printHeader, printFooter } from "./helpers.js";

/** 夹具板目录（含对象数与历史规模的版本戳，变了就重建） */
const FIXTURE_DIR = path.join(os.tmpdir(), "hwb-bench-chunk-board-v2");

/** 夹具对象数 */
const OBJECT_COUNT = 10_000;

/** 夹具修改/删除/撤销轮次 */
const MODIFY_ROUNDS = 300;
const DELETE_COUNT = 100;
const UNDO_COUNT = 30;

/**
 * 归一化层叠图为可比较字符串（节点与邻边排序，顺序无关）
 * @param {import("../src/kernel/utils/directed-graph.js").DirectedGraph} graph - 层叠图
 * @returns {string} 归一化指纹
 */
function graphFingerprint(graph) {
  const entries = graph
    .toArray()
    .map(([node, neighbors]) => [String(node), [...neighbors].map(String).sort()])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return JSON.stringify(entries);
}

/**
 * 区块的渲染绘制序（拓扑序，渲染器 mergeStaticGraphs 后的实际绘制依据）
 * @param {import("../src/kernel/utils/directed-graph.js").DirectedGraph} graph - 层叠图
 * @returns {string} 绘制序（逗号分隔）
 */
function drawOrder(graph) {
  return graph
    .getTopologicalOrder()
    .map(String)
    .join(",");
}

/**
 * 收集各区块的层叠图信息
 * @param {BoardCore} boardCore - 白板核心
 * @param {(graph: import("../src/kernel/utils/directed-graph.js").DirectedGraph) => string} project - 投影函数
 * @returns {Map<string, string>} 区块 id → 投影
 */
function chunkProjection(boardCore, project) {
  const out = new Map();
  for (const { chunk } of boardCore.chunkLoaded.values()) {
    if (!chunk?.objectManager) continue;
    out.set(String(chunk.id), project(chunk.objectManager.staticGraph));
  }
  return out;
}

/**
 * 生成（或复用）万级对象夹具板
 * @returns {Promise<void>}
 */
async function ensureFixture() {
  const stamp = path.join(FIXTURE_DIR, ".fixture-stamp.json");
  if (fs.existsSync(stamp)) {
    const meta = JSON.parse(fs.readFileSync(stamp, "utf-8"));
    if (meta.objects === OBJECT_COUNT) return;
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
  console.log(`生成夹具板（${OBJECT_COUNT} 对象 + 修改/删除/撤销历史）...`);
  const start = performance.now();
  const session = await openBoardSession(FIXTURE_DIR, {
    create: true,
    width: 800,
    height: 600,
    source: "bench",
  });
  const { api } = session;

  // 对象分布在 8000x6000 世界（board 800x600 → 10x10 共 100 个区块，每块约 100 对象）。
  // 创建分批进行：批内 createObject 同步执行（不让出，journaler 不合批落盘），
  // 批末一次 commitObjects 串行入图——避免并发 addObject 的 commit 交错产生交叉边。
  const STROKE = {
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 10, y: 10, pressure: 0.5 },
    ],
    color: "#000",
    width: 2,
  };
  for (let base = 0; base < OBJECT_COUNT; base += 500) {
    const ids = [];
    for (let i = base; i < base + 500; i++) {
      const id = `bench/${i + 1}`;
      api.createObject("StrokeObject", {
        id,
        position: { x: (i % 100) * 80, y: Math.floor(i / 100) * 60 },
        data: { ...STROKE },
      });
      ids.push(id);
    }
    await api.commitObjects(ids);
  }
  // 修改历史（选择 → 位移 → 提交，完整超分子链）
  for (let i = 0; i < MODIFY_ROUNDS; i++) {
    const id = `bench/${i * 7 + 1}`;
    await api.addActiveObjects([id]);
    api.modifyObject(id, { position: { x: (i % 100) * 80 + 5, y: Math.floor(i / 100) * 60 } });
    await api.commitObjects([id]);
  }
  // 删除与撤销历史
  const deleteIds = [];
  for (let i = 0; i < DELETE_COUNT; i++) {
    deleteIds.push(`bench/${9000 + i}`);
  }
  await api.deleteObjects(deleteIds);
  for (let i = 0; i < UNDO_COUNT; i++) {
    api.undo();
  }
  await session.flush();
  await session.close();
  fs.writeFileSync(stamp, JSON.stringify({ objects: OBJECT_COUNT }));
  console.log(
    `夹具就绪：${FIXTURE_DIR}（耗时 ${((performance.now() - start) / 1000).toFixed(1)}s）\n`,
  );
}

/**
 * 打开夹具板的会话存储
 * @returns {Promise<{store: Object}>} 会话存储
 */
async function openStore() {
  const driver = createNodeDriver(FIXTURE_DIR);
  const { rootId } = await driver.registerRoot(FIXTURE_DIR);
  return { store: createSessionStore(bindRoot(driver, rootId)) };
}

/**
 * 基线路径：loadAll（含 chunks/）+ BoardCore + restoreSession
 * @returns {Promise<BoardCore>} 恢复后的白板核心
 */
async function loadBaseline() {
  const { store } = await openStore();
  const session = await store.loadAll();
  const boardCore = new BoardCore({
    width: session.meta?.boardConfig?.width ?? 0,
    height: session.meta?.boardConfig?.height ?? 0,
    source: "bench-read",
    hitRecords: session.records.length ? session.records : undefined,
    lastTime: session.meta?.lastTime ?? 0,
    coreIdCounters: session.meta?.coreIdCounters ?? {},
    objectIdCounters: session.meta?.objectIdCounters ?? {},
    chunkUnload: false,
  });
  boardCore.restoreSession(session);
  return boardCore;
}

/**
 * 回放派生路径：只读记录，空核心上回放全部操作（已知正确的派生上界）
 * @returns {Promise<BoardCore>} 回放后的白板核心
 */
async function loadReplayDerived() {
  const { store } = await openStore();
  const meta = await store.readMeta();
  const { records } = await store.readAllRecords();
  const boardCore = new BoardCore({
    width: meta?.boardConfig?.width ?? 0,
    height: meta?.boardConfig?.height ?? 0,
    source: "bench-read",
    chunkUnload: false,
  });
  new BoardApi(boardCore).applyRemoteOperations(records);
  return boardCore;
}

/**
 * 多轮计时
 * @param {string} label - 测试名称
 * @param {number} rounds - 轮数
 * @param {() => Promise<BoardCore>} fn - 被测加载路径
 * @returns {Promise<{mean: number, min: number}>} 均值与最小值（毫秒）
 */
async function timeRounds(label, rounds, fn) {
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  console.log(
    `${label}：均值 ${mean.toFixed(1)}ms，最小 ${min.toFixed(1)}ms（${rounds} 轮）`,
  );
  return { mean, min };
}

printHeader("Chunk 派生重建基准（万级对象板冷启动）");

await ensureFixture();

// 一致性校验：基线 vs 回放派生（图形状与绘制序分开比对——渲染只依赖拓扑序）
console.log("一致性校验：基线 vs 回放派生...");
const baseline = await loadBaseline();
const replayed = await loadReplayDerived();
const baseShapes = chunkProjection(baseline, graphFingerprint);
const replayShapes = chunkProjection(replayed, graphFingerprint);
const baseOrders = chunkProjection(baseline, drawOrder);
const replayOrders = chunkProjection(replayed, drawOrder);
console.log(`区块数：基线 ${baseShapes.size}，回放 ${replayShapes.size}`);
let shapeMismatch = 0;
for (const [chunkId, fingerprint] of baseShapes) {
  if (replayShapes.get(chunkId) !== fingerprint) shapeMismatch += 1;
}
for (const chunkId of replayShapes.keys()) {
  if (!baseShapes.has(chunkId)) shapeMismatch += 1;
}
let orderMismatch = 0;
for (const [chunkId, order] of baseOrders) {
  if (replayOrders.get(chunkId) !== order) orderMismatch += 1;
}
for (const chunkId of replayOrders.keys()) {
  if (!baseOrders.has(chunkId)) orderMismatch += 1;
}
console.log(`图形状分叉区块：${shapeMismatch}（仅参考，渲染不依赖边形状）`);
if (orderMismatch > 0) {
  // 语义告警但不阻断计时：分叉细节是决策依据的一部分（派生保真度成本）
  console.error(`绘制序分叉区块：${orderMismatch}（层位保真详见上表；计时继续）`);
  for (const [chunkId, order] of baseOrders) {
    const other = replayOrders.get(chunkId) ?? "";
    if (other === order) continue;
    // 定位首个分叉点
    let k = 0;
    while (k < order.length && k < other.length && order[k] === other[k]) k++;
    console.error(`  chunk ${chunkId} 分叉@char ${k}:`);
    console.error(`    基线 …${order.slice(Math.max(0, k - 40), k + 80)}`);
    console.error(`    回放 …${other.slice(Math.max(0, k - 40), k + 80)}`);
    console.error(`    长度 基线 ${order.length} 回放 ${other.length}`);
  }
} else {
  console.log(
    `绘制序一致 ✓（对象数：基线 ${baseline.getAllObjects().length}，回放 ${replayed.getAllObjects().length}）`,
  );
}
console.log("");

// 分解计时（单轮，定位成本来源）
{
  const { store } = await openStore();
  let t = performance.now();
  const { records } = await store.readAllRecords();
  const tRecords = performance.now() - t;
  t = performance.now();
  const objects = await store.readAllObjects();
  const tObjects = performance.now() - t;
  t = performance.now();
  const chunkMetadataList = await store.readAllChunkMetadata();
  const tChunks = performance.now() - t;
  t = performance.now();
  const probe = new BoardCore({
    width: 800,
    height: 600,
    source: "bench-read",
    hitRecords: records,
    chunkUnload: false,
  });
  const tTree = performance.now() - t;
  t = performance.now();
  probe.restoreSession({ chunkMetadataList, objects, trash: [] });
  const tRestore = performance.now() - t;
  console.log("分解计时（单轮）：");
  console.log(`  记录读取与解析（${records.length} 条）：${tRecords.toFixed(1)}ms`);
  console.log(`  对象读取与解析（${objects.length} 个）：${tObjects.toFixed(1)}ms`);
  console.log(`  chunks/ 读取：${tChunks.toFixed(1)}ms`);
  console.log(`  hit 日志重建与树重放：${tTree.toFixed(1)}ms`);
  console.log(`  restoreSession（层叠图回填 + 对象注册）：${tRestore.toFixed(1)}ms\n`);
}

// 路径对比（多轮）
await timeRounds("基线（chunks/ 直读 + restoreSession）", 5, loadBaseline);
await timeRounds("回放派生（零对象直读，全量回放）", 5, loadReplayDerived);

printFooter();
