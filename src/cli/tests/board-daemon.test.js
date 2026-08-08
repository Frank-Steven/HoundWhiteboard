/**
 * @file 板 daemon 端到端测试
 * @description 验证 daemon 持板、RPC 命令执行、描述文件生命周期、僵尸回退与经中继的实时互见。
 * @module cli/tests/board-daemon.test
 * @author Zhou Chenyu
 */

import { jest } from "@jest/globals";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startBoardDaemon, readDaemonDescriptor } from "../board-daemon.js";
import { connectDaemon } from "../daemon-client.js";
import { openBoardSession } from "../board-session.js";
import { createRelayServer } from "../../host/sync/relay-server.js";
import { createNetworkCoordinator } from "../../host/sync/network-coordinator.js";
import { BoardApi } from "../../kernel/api/board-api.js";
import { BoardCore } from "../../kernel/board/board-core.js";
import { createDefaultAomRenderHooks } from "../../kernel/board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../kernel/board/persistence-adapter.js";

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL("../index.js", import.meta.url));

/** 测试用的独立 daemon 全局引用路径（避免并行测试互相覆盖） */
let refFile = null;

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hwb-daemon-ref-"));
  refFile = path.join(dir, "daemon.json");
  process.env.HWB_DAEMON_REF = refFile;
});

afterAll(async () => {
  delete process.env.HWB_DAEMON_REF;
  if (refFile) {
    await fs.rm(path.dirname(refFile), { recursive: true, force: true });
  }
});

/** 示例笔画数据 */
const STROKE_DATA = {
  points: [
    { x: 10, y: 10, pressure: 0.5 },
    { x: 30, y: 20, pressure: 0.5 },
  ],
  color: "#000",
  width: 2,
};

/**
 * 创建临时板目录并建空板
 * @returns {Promise<{dir: string, cleanup: Function}>} 目录与清理函数
 */
async function tempBoard() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hwb-daemon-test-"));
  const session = await openBoardSession(dir, {
    create: true,
    width: 800,
    height: 600,
  });
  await session.flush();
  await session.close();
  return {
    dir,
    // Windows 下文件句柄释放有延迟，cleanup 重试若干次
    cleanup: async () => {
      for (let i = 0; i < 10; i += 1) {
        try {
          await fs.rm(dir, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    },
  };
}

/**
 * 轮询等待条件成立
 * @param {Function} fn - 条件函数
 * @param {number} [timeout=3000] - 超时毫秒数
 * @returns {Promise<void>}
 */
async function waitFor(fn, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor 超时");
}

describe("板 daemon", () => {
  test("RPC 命令执行：增删查与撤销", async () => {
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-test",
    });
    try {
      const desc = await readDaemonDescriptor(dir);
      expect(desc.port).toBe(daemon.port);
      expect(desc.source).toBe("daemon-test");

      const client = await connectDaemon(dir);
      expect(client).not.toBeNull();
      expect(client.source).toBe("daemon-test");

      const id = await client.api.addObject("StrokeObject", {
        data: { ...STROKE_DATA },
      });
      expect(id).toBe("daemon-test/1");

      const info = await client.api.queryBoardInfo();
      expect(info.records).toBe(1);
      expect(info.objects).toBe(1);

      const data = await client.api.queryObject(id);
      expect(data.id).toBe(id);

      await client.api.deleteObjects([id]);
      let list = await client.api.queryObjectList();
      expect(list.trash).toEqual([id]);

      await client.api.undo();
      list = await client.api.queryObjectList();
      expect(list.objects.map((o) => o.id)).toEqual([id]);
      expect(list.trash).toEqual([]);

      client.close();
    } finally {
      await daemon.close();
      await cleanup();
    }
    // 描述文件随关闭删除
    expect(await readDaemonDescriptor(dir)).toBeNull();
  });

  test("活 daemon 存在时拒绝重复启动；僵尸描述文件回退 null", async () => {
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-test",
    });
    try {
      await expect(
        startBoardDaemon({ rootPath: dir, source: "other" }),
      ).rejects.toThrow("已有 daemon");
    } finally {
      await daemon.close();
    }

    // 僵尸描述文件（无活进程）：客户端连接回退 null
    await fs.writeFile(
      path.join(dir, ".daemon.json"),
      JSON.stringify({ pid: 1, port: 1, source: "ghost" }),
      "utf-8",
    );
    expect(await connectDaemon(dir)).toBeNull();
    await cleanup();
  });

  test("daemon 落盘：关闭后板上数据可经文件模式恢复", async () => {
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-test",
    });
    const client = await connectDaemon(dir);
    const id = await client.api.addObject("StrokeObject", {
      data: { ...STROKE_DATA },
    });
    client.close();
    await daemon.close();

    // 文件模式重开：daemon 期间的变更已落盘
    const session = await openBoardSession(dir, { source: "cli" });
    expect(session.boardCore.getObjectById(id)).not.toBeNull();
    expect(session.boardCore.operationLog.size).toBe(1);
    await session.close();
    await cleanup();
  });

  test("daemon 连中继：CLI 操作与协作端实时互见", async () => {
    const relay = createRelayServer({ port: 0 });
    const relayUrl = `ws://127.0.0.1:${relay.port}`;
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon",
      relayUrl,
      boardId: "test-room",
    });

    // 协作对端（等价于 GUI 窗口）
    const peerCore = new BoardCore({
      width: 800,
      height: 600,
      source: "peer",
      aomRenderHooks: createDefaultAomRenderHooks(),
      persistenceAdapter: createDefaultPersistenceAdapter(),
    });
    const peerApi = new BoardApi(peerCore);
    const peerCoordinator = createNetworkCoordinator({
      boardCore: peerCore,
      boardApi: peerApi,
      url: relayUrl,
      boardId: "test-room",
    });

    try {
      await peerCoordinator.connect();

      // CLI → daemon → relay → 对端可见
      const client = await connectDaemon(dir);
      const id = await client.api.addObject("StrokeObject", {
        data: { ...STROKE_DATA },
      });
      await waitFor(() => peerCore.getObjectById(id) != null);
      expect(peerCore.operationLog.size).toBe(1);

      // 对端 → relay → daemon 可见（CLI 查询面同步看到）
      const peerId = await peerApi.addObject("StrokeObject", {
        data: { ...STROKE_DATA },
      });
      await waitFor(async () => {
        const list = await client.api.queryObjectList();
        return list.objects.some((o) => o.id === peerId);
      });

      // CLI 撤销 daemon 侧操作 → 对端同步收敛
      await client.api.undo();
      await waitFor(() => {
        const info = peerApi.queryBoardInfo();
        return info.records === 3 && info.objects === 1;
      });
      expect(peerCore.getObjectById(id)).toBeUndefined();
      expect(peerCore.getObjectById(peerId)).not.toBeNull();

      client.close();
    } finally {
      await peerCoordinator.close();
      await daemon.close();
      await relay.close();
      await cleanup();
    }
  }, 15000);

  test("CLI 子进程自动发现 daemon：命令经 daemon 执行且可免 --source", async () => {
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-x",
    });
    try {
      // 无 --source：daemon 模式下身份属 daemon，add 输出 daemon 前缀 id
      const { stdout: idOut } = await execFileAsync(process.execPath, [
        CLI_PATH,
        "add",
        dir,
        "--type",
        "StrokeObject",
        "--data",
        JSON.stringify(STROKE_DATA),
      ]);
      expect(idOut.trim()).toBe("daemon-x/1");

      const { stdout: listOut } = await execFileAsync(process.execPath, [
        CLI_PATH,
        "list",
        dir,
      ]);
      const listed = JSON.parse(listOut);
      expect(listed.objects).toEqual([
        { id: "daemon-x/1", type: "StrokeObject" },
      ]);

      await execFileAsync(process.execPath, [CLI_PATH, "undo", dir]);
      const { stdout: infoOut } = await execFileAsync(process.execPath, [
        CLI_PATH,
        "info",
        dir,
      ]);
      expect(JSON.parse(infoOut).objects).toBe(0);
    } finally {
      await daemon.close();
      await cleanup();
    }
  }, 20000);

  test("CLI 免路径：daemon 启动后不带板目录直接操作", async () => {
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-y",
    });
    try {
      const { stdout: idOut } = await execFileAsync(
        process.execPath,
        [
          CLI_PATH,
          "add",
          "--type",
          "StrokeObject",
          "--data",
          JSON.stringify(STROKE_DATA),
        ],
        { env: process.env },
      );
      expect(idOut.trim()).toBe("daemon-y/1");

      const { stdout: listOut } = await execFileAsync(
        process.execPath,
        [CLI_PATH, "list"],
        { env: process.env },
      );
      const listed = JSON.parse(listOut);
      expect(listed.objects).toEqual([
        { id: "daemon-y/1", type: "StrokeObject" },
      ]);
    } finally {
      await daemon.close();
      await cleanup();
    }
  }, 20000);

  test("免路径下 show/delete 的对象 id 不误判为板路径", async () => {
    const { dir, cleanup } = await tempBoard();
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-z",
    });
    try {
      const { stdout: idOut } = await execFileAsync(
        process.execPath,
        [CLI_PATH, "add", "--type", "CircleObject", "--data", "{radius: 20}"],
        { env: process.env },
      );
      const id = idOut.trim();
      expect(id).toBe("daemon-z/1");

      const { stdout: showOut } = await execFileAsync(
        process.execPath,
        [CLI_PATH, "show", id],
        { env: process.env },
      );
      expect(JSON.parse(showOut).data.radius).toBe(20);

      await execFileAsync(process.execPath, [CLI_PATH, "delete", id], {
        env: process.env,
      });
      const { stdout: listOut } = await execFileAsync(
        process.execPath,
        [CLI_PATH, "list"],
        { env: process.env },
      );
      expect(JSON.parse(listOut).trash).toEqual([id]);
    } finally {
      await daemon.close();
      await cleanup();
    }
  }, 20000);

  test("daemon 先于中继启动：自动重连后参与协作", async () => {
    // 先占一个空闲端口再释放，模拟中继未启动
    const probe = createRelayServer({ port: 0 });
    const port = probe.port;
    await probe.close();

    const { dir, cleanup } = await tempBoard();
    const relayUrl = `ws://127.0.0.1:${port}`;
    const daemon = await startBoardDaemon({
      rootPath: dir,
      source: "daemon-r",
      relayUrl,
      boardId: "room",
    });
    try {
      // 中继后启动，daemon 应在重试周期内自动连上
      const relay = createRelayServer({ port });
      try {
        await waitFor(() => relay.roomSize("room") >= 1, 8000);

        const client = await connectDaemon(dir);
        const id = await client.api.addObject("StrokeObject", {
          data: { ...STROKE_DATA },
        });

        const peerCore = new BoardCore({
          width: 800,
          height: 600,
          source: "peer",
          aomRenderHooks: createDefaultAomRenderHooks(),
          persistenceAdapter: createDefaultPersistenceAdapter(),
        });
        const peerApi = new BoardApi(peerCore);
        const peerCoordinator = createNetworkCoordinator({
          boardCore: peerCore,
          boardApi: peerApi,
          url: relayUrl,
          boardId: "room",
        });
        await peerCoordinator.connect();
        await waitFor(() => peerCore.getObjectById(id) != null);
        await peerCoordinator.close();
        client.close();
      } finally {
        await relay.close();
      }
    } finally {
      await daemon.close();
      await cleanup();
    }
  }, 25000);
});
