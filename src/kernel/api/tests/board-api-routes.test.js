/**
 * @file Board API RPC 路由表测试
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { jest } from "@jest/globals";

import { BoardApi } from "../board-api.js";
import { BOARD_API_ROUTES } from "../board-api-routes.js";

describe("BOARD_API_ROUTES", () => {
  test("覆盖 BoardApi 全部公共方法", () => {
    const publicMethods = Object.getOwnPropertyNames(BoardApi.prototype).filter(
      (name) => name !== "constructor",
    );

    expect(publicMethods.length).toBeGreaterThan(0);
    for (const method of publicMethods) {
      expect(BOARD_API_ROUTES[method]).toBeDefined();
    }
  });

  test("路由表中不存在 BoardApi 之外的方法", () => {
    for (const method of Object.keys(BOARD_API_ROUTES)) {
      expect(typeof BoardApi.prototype[method]).toBe("function");
    }
  });

  test("每个路由条目声明合法的 invoke 与 flush", () => {
    for (const route of Object.values(BOARD_API_ROUTES)) {
      expect(typeof route.invoke).toBe("function");
      expect(["none", "sync", "async"]).toContain(route.flush);
    }
  });

  test("invoke 按契约解包参数并调用对应方法", () => {
    const api = {
      createObject: jest.fn(() => "obj-1"),
      modifyObject: jest.fn(),
      modifyObjects: jest.fn(),
      appendListItem: jest.fn(),
      replaceListItem: jest.fn(),
      removeListItem: jest.fn(),
      deleteObjects: jest.fn(),
      eraseData: jest.fn(() =>
        Promise.resolve({ modified: [], created: [], deleted: [] }),
      ),
      commitObjects: jest.fn(() => ["obj-1"]),
      addActiveObjects: jest.fn(),
      discardActiveObjects: jest.fn(),
      queryObjects: jest.fn(() => []),
      queryChunkObjects: jest.fn(() => []),
      hitTest: jest.fn(() => Promise.resolve([])),
      undo: jest.fn(),
      redo: jest.fn(),
    };

    BOARD_API_ROUTES.createObject.invoke(api, {
      type: "StrokeObject",
      props: { id: "obj-1" },
    });
    expect(api.createObject).toHaveBeenCalledWith("StrokeObject", {
      id: "obj-1",
    });

    BOARD_API_ROUTES.modifyObject.invoke(api, {
      objectId: "obj-1",
      patch: { data: { radius: 5 } },
    });
    expect(api.modifyObject).toHaveBeenCalledWith("obj-1", {
      data: { radius: 5 },
    });

    BOARD_API_ROUTES.modifyObjects.invoke(api, {
      patches: [{ objectId: "obj-1", patch: {} }],
    });
    expect(api.modifyObjects).toHaveBeenCalledWith([
      { objectId: "obj-1", patch: {} },
    ]);

    BOARD_API_ROUTES.appendListItem.invoke(api, {
      objectId: "obj-1",
      key: "points",
      items: [{ x: 1, y: 1 }],
    });
    expect(api.appendListItem).toHaveBeenCalledWith("obj-1", "points", [
      { x: 1, y: 1 },
    ]);

    BOARD_API_ROUTES.replaceListItem.invoke(api, {
      objectId: "obj-1",
      key: "points",
      index: 0,
      item: { x: 2, y: 2 },
    });
    expect(api.replaceListItem).toHaveBeenCalledWith(
      "obj-1",
      "points",
      0,
      { x: 2, y: 2 },
    );

    BOARD_API_ROUTES.removeListItem.invoke(api, {
      objectId: "obj-1",
      key: "points",
      index: 0,
    });
    expect(api.removeListItem).toHaveBeenCalledWith("obj-1", "points", 0);

    BOARD_API_ROUTES.deleteObjects.invoke(api, { objectIds: ["obj-1"] });
    expect(api.deleteObjects).toHaveBeenCalledWith(["obj-1"]);

    const payload = { points: [{ x: 0, y: 0 }], radius: 8, source: "t" };
    BOARD_API_ROUTES.eraseData.invoke(api, payload);
    expect(api.eraseData).toHaveBeenCalledWith(payload);

    BOARD_API_ROUTES.commitObjects.invoke(api, { objectIds: ["obj-1"] });
    expect(api.commitObjects).toHaveBeenCalledWith(["obj-1"]);

    BOARD_API_ROUTES.addActiveObjects.invoke(api, { objectIds: ["obj-1"] });
    expect(api.addActiveObjects).toHaveBeenCalledWith(["obj-1"]);

    BOARD_API_ROUTES.discardActiveObjects.invoke(api, { objectIds: ["obj-1"] });
    expect(api.discardActiveObjects).toHaveBeenCalledWith(["obj-1"]);

    BOARD_API_ROUTES.queryObjects.invoke(api, { ids: ["obj-1"] });
    expect(api.queryObjects).toHaveBeenCalledWith(["obj-1"]);

    BOARD_API_ROUTES.queryChunkObjects.invoke(api, { chunkIds: [0] });
    expect(api.queryChunkObjects).toHaveBeenCalledWith([0]);

    const range = { left: 0, top: 0, width: 10, height: 10 };
    BOARD_API_ROUTES.hitTest.invoke(api, { range, mode: "intersect" });
    expect(api.hitTest).toHaveBeenCalledWith(range, "intersect");

    BOARD_API_ROUTES.undo.invoke(api, {});
    expect(api.undo).toHaveBeenCalledWith();

    BOARD_API_ROUTES.redo.invoke(api, {});
    expect(api.redo).toHaveBeenCalledWith();
  });
});
