// SPDX-License-Identifier: MIT

/**
 * @file BoardApi 查询与组合方法测试
 * @description 验证 addObject（持板侧原子分配）与 queryBoardInfo/queryObjectList/queryObject 查询面。
 * @module kernel/api/tests/board-api-query.test
 * @author Zhou Chenyu
 */

import { BoardApi } from "../board-api.js";
import { BoardCore } from "../../board/board-core.js";
import { createDefaultAomRenderHooks } from "../../board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../board/persistence-adapter.js";

/**
 * 创建一个内存端
 * @param {string} source - 端标识
 * @returns {{ boardCore: BoardCore, api: BoardApi }} 端
 */
function createEnd(source = "test") {
  const boardCore = new BoardCore({
    width: 800,
    height: 600,
    source,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
  return { boardCore, api: new BoardApi(boardCore) };
}

/** 示例笔画数据 */
const STROKE_DATA = {
  points: [
    { x: 10, y: 10, pressure: 0.5 },
    { x: 30, y: 20, pressure: 0.5 },
  ],
  color: "#000",
  width: 2,
};

describe("BoardApi.addObject", () => {
  test("持板侧原子完成 id 分配、创建与提交，id 随调用续号", async () => {
    const { api } = createEnd("test");
    const id1 = await api.addObject("StrokeObject", { data: { ...STROKE_DATA } });
    const id2 = await api.addObject("StrokeObject", { data: { ...STROKE_DATA } });
    expect(id1).toBe("test/1");
    expect(id2).toBe("test/2");
    expect(api.queryObjectList().objects).toHaveLength(2);
    expect(api.queryBoardInfo().records).toBe(2);
  });

  test("续号基于已上报的对象 id 计数器", async () => {
    const { api } = createEnd("test");
    api.reportObjectIdCounter("test", 41);
    const id = await api.addObject("StrokeObject", { data: { ...STROKE_DATA } });
    expect(id).toBe("test/42");
  });
});

describe("BoardApi 查询面", () => {
  test("queryBoardInfo 汇总 meta、日志规模、HEAD 与计数", async () => {
    const { api } = createEnd("test");
    const id = await api.addObject("StrokeObject", { data: { ...STROKE_DATA } });
    const info = api.queryBoardInfo();
    expect(info.records).toBe(1);
    expect(info.objects).toBe(1);
    expect(info.trash).toBe(0);
    expect(info.head).toBe("test/op-1");
    expect(info.objectIdCounters.test).toBe(1);
  });

  test("queryObjectList 区分活动与 trash；撤销创建不进回收站，删除进回收站", async () => {
    const { api } = createEnd("test");
    const id = await api.addObject("StrokeObject", { data: { ...STROKE_DATA } });
    let list = api.queryObjectList();
    expect(list.objects.map((o) => o.id)).toEqual([id]);
    expect(list.trash).toEqual([]);

    // 撤销创建：对象从未来过，不进回收站
    await api.undo();
    list = api.queryObjectList();
    expect(list.objects).toEqual([]);
    expect(list.trash).toEqual([]);

    // 删除进回收站；撤销删除恢复出册
    await api.redo();
    api.deleteObjects([id]);
    list = api.queryObjectList();
    expect(list.objects).toEqual([]);
    expect(list.trash).toEqual([id]);
    await api.undo();
    list = api.queryObjectList();
    expect(list.objects.map((o) => o.id)).toEqual([id]);
    expect(list.trash).toEqual([]);
  });

  test("queryObject 返回序列化数据；不存在时为 null", async () => {
    const { api } = createEnd("test");
    const id = await api.addObject("StrokeObject", {
      position: { x: 5, y: 6 },
      data: { ...STROKE_DATA },
    });
    const data = api.queryObject(id);
    expect(data.id).toBe(id);
    expect(data.position).toEqual({ x: 5, y: 6 });
    expect(api.queryObject("test/999")).toBeNull();
  });
});
