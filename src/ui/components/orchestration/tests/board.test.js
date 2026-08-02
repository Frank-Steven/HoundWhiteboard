/**
 * @file Board 测试
 * @description 验证 Board 输入信道的兜底行为：单个信号包的分发失败不中断输入循环。
 * @module ui/components/orchestration/tests/board.test
 * @author Zhou Chenyu
 *
 * @jest-environment node
 */

import { jest } from "@jest/globals";

import { Board } from "../board.js";
import { logBus } from "../../../../utils/log/log-bus.js";

describe("Board 输入信道兜底", () => {
  test("input 事件 dispatch 抛错时不中断输入循环并记录错误日志", () => {
    const board = new Board({ width: 800, height: 600 });
    // 替换 devicesDAG 为会抛错的桩（模拟引擎内部错误）
    const failingDag = {
      dispatch: jest.fn(() => {
        throw new Error("dispatch boom");
      }),
    };
    const originalDag = board.devicesDAG;
    board.devicesDAG = failingDag;

    const errorEntries = [];
    const off = logBus.onLevels(["ERROR"], (entry) =>
      errorEntries.push(entry),
    );

    try {
      // 抛错的分发不向外传播
      expect(() =>
        board.signalsEventBus.emit("input", {
          to: "/vp/mouse",
          signals: [{ type: "position" }],
        }),
      ).not.toThrow();
      expect(failingDag.dispatch).toHaveBeenCalledTimes(1);
      expect(errorEntries.length).toBeGreaterThan(0);
    } finally {
      off();
      board.devicesDAG = originalDag;
    }
  });

  test("input 事件 dispatch 正常时不产生错误日志", () => {
    const board = new Board({ width: 800, height: 600 });

    const errorEntries = [];
    const off = logBus.onLevels(["ERROR"], (entry) =>
      errorEntries.push(entry),
    );

    try {
      expect(() =>
        board.signalsEventBus.emit("input", {
          to: "/nonexistent/path",
          signals: [{ type: "position" }],
        }),
      ).not.toThrow();
      expect(errorEntries).toHaveLength(0);
    } finally {
      off();
    }
  });
});
