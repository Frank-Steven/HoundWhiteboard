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
   * 会话超分子 key（一次擦除手势 = 一个节点）
   * @type {?string}
   * @private
   */
  #sessionKey = null;

  /**
   * 最近一次 eraseData 的 Promise（闭合前等待其兑现，保证提交先于闭合到达内核）
   * @type {?Promise}
   * @private
   */
  #lastErase = null;

  /**
   * 手势开始：开启擦除会话超分子（本手势的全部轨迹段指定同一 key）
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  beginGesture(interaction) {
    eraserSessionSeq += 1;
    this.#sessionKey = `eraser/${eraserSessionSeq}`;
    interaction?.context?.services?.boardApi?.beginSupra?.(this.#sessionKey);
    super.beginGesture(interaction);
  }

  /**
   * 手势完成：待排队的擦除提交全部兑现后闭合会话超分子（一次擦除凝聚为一个节点）
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  completeGesture(interaction) {
    super.completeGesture(interaction);
    this.#closeSessionSupra(interaction);
  }

  /**
   * 手势取消：擦除不回滚，已擦除部分的提交随会话闭合物化
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  cancelGesture(interaction) {
    super.cancelGesture(interaction);
    this.#closeSessionSupra(interaction);
  }

  /**
   * 工具卸载时兜底闭合会话超分子
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} [context={}] - 设备图处理器上下文
   * @returns {void}
   */
  umount(context = {}) {
    this.#closeSessionSupra({ context });
    super.umount(context);
  }

  /**
   * 闭合会话超分子（等待最后一次擦除兑现后发出，保证 RPC 顺序）
   * @param {import("../gesture-tool.js").GestureInteraction|{ context: Object }} interaction - 当前手势交互上下文
   * @returns {void}
   * @private
   */
  #closeSessionSupra(interaction) {
    if (this.#sessionKey === null) return;
    const key = this.#sessionKey;
    this.#sessionKey = null;
    const boardApi = interaction?.context?.services?.boardApi;
    Promise.resolve(this.#lastErase)
      .catch(() => { })
      .finally(() => {
        boardApi?.endSupra?.(key);
      });
    this.#lastErase = null;
  }

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
    }, {
      supraKey: this.#sessionKey ?? undefined,
    });
    this.#lastErase = result;
    if (result && typeof result.catch === "function") {
      result.catch(() => { });
    }
  }
}

/** 擦除会话超分子模块级单调序号 @type {number} */
let eraserSessionSeq = 0;

export { DataObjectEraserTool };
