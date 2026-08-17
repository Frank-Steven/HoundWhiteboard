/**
 * @file 文件模式持久化适配器集成测试
 * @description 验证内核 BoardCore 与 io 持久化适配器、session-store 在同一命名契约下协作：区块卸载/重载不丢对象。
 * @module kernel/board/tests/board-persistence-adapter.test
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { createMemoryDriver } from "../../../io/driver/memory.js";
import { bindRoot } from "../../../io/driver/io-driver.js";
import { createPersistenceAdapter } from "../../../io/adapter/persistence.js";
import { createSessionStore } from "../../store/session-store.js";
import { createJournaler } from "../../store/journaler.js";
import { BoardCore } from "../board-core.js";
import { BoardApi } from "../../api/board-api.js";
import { createDefaultAomRenderHooks } from "../aom-render-hooks.js";

describe("文件模式：持久化适配器与 session-store 命名契约", () => {
  test("对象文件由日志跟随者写入，区块卸载后重载经适配器读回", async () => {
    const driver = createMemoryDriver({ rootId: "mem" });
    const store = createSessionStore(bindRoot(driver, "mem"));
    await store.create();
    const adapter = createPersistenceAdapter({ driver, rootId: "mem" });

    const boardCore = new BoardCore({
      width: 800,
      height: 600,
      rootPath: "mem",
      aomRenderHooks: createDefaultAomRenderHooks(),
      persistenceAdapter: adapter,
    });
    const api = new BoardApi(boardCore);
    const journaler = createJournaler({ boardCore, store });
    journaler.attach();

    api.createObject("StrokeObject", {
      id: "dev-x/core/1",
      position: { x: 10, y: 10 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    });
    await api.commitObjects(["dev-x/core/1"]);
    await journaler.flush();
    expect(boardCore.getObjectById("dev-x/core/1")).toBeDefined();

    // 模拟区块卸载（引用计数归零 + 标记卸载后移除对象实例）
    const chunkId = [...boardCore.chunkLoaded.keys()][0];
    boardCore.chunkLoaded.get(chunkId).fullLoadedCount = 0;
    boardCore.getChunkById(chunkId).isLoad = false;
    boardCore.unloadChunkObjectEntries(chunkId);
    expect(boardCore.getObjectById("dev-x/core/1")).toBeUndefined();

    // 区块重载：经适配器按 session-store 命名读回对象（契约断裂时这里静默读空）
    const loaded = await boardCore.loadChunkObjectEntries(chunkId);
    expect([...loaded.keys()]).toEqual(["dev-x/core/1"]);
    expect(boardCore.getObjectById("dev-x/core/1")?.data.points).toHaveLength(2);
  });
});
