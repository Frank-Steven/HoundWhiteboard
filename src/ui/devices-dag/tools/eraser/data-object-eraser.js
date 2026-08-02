/**
 * @file 数据对象擦除工具
 * @description 通过修改对象 data 实现擦除的对象擦除工具。
 * @module ui/devices-dag/tools/eraser/data-object-eraser
 * @author Zhou Chenyu
 */

import { Vector } from "../../../../kernel/utils/math.js";
import { ObjectEraserTool } from "./object-eraser.js";

/**
 * 数据对象擦除工具
 * @class
 * @extends ObjectEraserTool
 * @description
 * FD（For Data）橡皮：把增量轨迹段经 `boardApi.eraseData` 发往 Core，
 * 由 Core 完成命中、切割、分裂与删除。调用为 fire-and-forget。
 * @author Zhou Chenyu
 */
class DataObjectEraserTool extends ObjectEraserTool {
  /**
   * 把一段橡皮轨迹发往 Core 执行数据擦除
   * @param {Vector} from - 段起点（世界坐标）
   * @param {Vector} to - 段终点（世界坐标）
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  applyTrailSegment(from, to, interaction) {
    const services = interaction?.context?.services;
    const boardApi = services?.boardApi;
    if (typeof boardApi?.eraseData !== "function") return;

    const points = Vector.nearlyEq(from, to)
      ? [{ x: from.x, y: from.y }]
      : [
        { x: from.x, y: from.y },
        { x: to.x, y: to.y },
      ];

    const result = boardApi.eraseData({
      points,
      radius: this.eraserSize / 2,
      source: services?.board?.idSource ?? "",
    });
    if (result && typeof result.catch === "function") {
      result.catch(() => { });
    }
  }
}

export { DataObjectEraserTool };
