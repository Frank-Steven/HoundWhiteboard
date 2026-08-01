/**
 * @file 对象擦除工具基类
 * @description 提供对象擦除工具共享的轨迹累积、橡皮尺寸与光标 overlay 骨架。
 * @module core/ui-thread/devices-dag/tools/eraser/object-eraser
 * @author Zhou Chenyu
 */

import { Vector } from "../../../../engine/utils/math.js";
import { GestureTool } from "../gesture-tool.js";

/**
 * 默认橡皮尺寸（世界单位直径）
 * @type {number}
 */
const DEFAULT_ERASER_SIZE = 16;

/**
 * 对象擦除工具基类
 * @class
 * @abstract
 * @extends GestureTool
 * @description
 * 把 position 流累积为橡皮轨迹：beginGesture 记录锚点并按点擦除一次，
 * updateGesture 把（上一轨迹点 → 当前点）作为增量段交给子类钩子。
 * 擦除在手势期间实时发生，end 不触发动作提交；
 * cancel 只清理状态，不回滚已擦除部分（数据已在 Core 落地）。
 * @author Zhou Chenyu
 */
class ObjectEraserTool extends GestureTool {
  /**
   * 橡皮尺寸（世界单位直径）
   * @type {number}
   */
  eraserSize;

  /**
   * 上一轨迹点（世界坐标）
   * @type {Vector | null}
   * @private
   */
  _lastTrailPoint;

  /**
   * @param {{ eraserSize?: number }} [options={}] - 工具选项
   * @constructor
   */
  constructor(options = {}) {
    super();
    this.eraserSize =
      Number.isFinite(options.eraserSize) && options.eraserSize > 0
        ? options.eraserSize
        : DEFAULT_ERASER_SIZE;
    this._lastTrailPoint = null;
    this.autoActionOnGestureEnd = false;
  }

  /**
   * 手势开始：记录锚点并按点擦除一次（支持单击擦除）
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  beginGesture(interaction) {
    const position = interaction.position ?? null;
    this._lastTrailPoint = position;
    if (position) {
      this.applyTrailSegment(position, position, interaction);
    }
    this.requestUiOverlayRefresh(interaction.context);
  }

  /**
   * 手势更新：把增量轨迹段交给子类钩子并推进锚点
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  updateGesture(interaction) {
    const position = interaction.position;
    if (!position) return;
    if (
      this._lastTrailPoint &&
      Vector.nearlyEq(this._lastTrailPoint, position)
    ) {
      return;
    }

    const from = this._lastTrailPoint ?? position;
    this.applyTrailSegment(from, position, interaction);
    this._lastTrailPoint = position;
    this.requestUiOverlayRefresh(interaction.context);
  }

  /**
   * 手势完成：清理轨迹状态
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  completeGesture(interaction) {
    this._lastTrailPoint = null;
    this.requestUiOverlayRefresh(interaction.context);
  }

  /**
   * 手势取消：清理轨迹状态，不回滚已擦除部分
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @returns {void}
   */
  cancelGesture(interaction) {
    this._lastTrailPoint = null;
    this.requestUiOverlayRefresh(interaction.context);
  }

  /**
   * 应用一段橡皮轨迹（子类实现具体擦除语义）
   * @param {Vector} from - 段起点（世界坐标）
   * @param {Vector} to - 段终点（世界坐标）
   * @param {import("../gesture-tool.js").GestureInteraction} interaction - 当前手势交互上下文
   * @abstract
   */
  applyTrailSegment(from, to, interaction) {
    throw new Error("Method not implemented.");
  }

  /**
   * 执行动作
   * @description 擦除在手势期间实时完成，动作提交为空操作。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {undefined}
   */
  performAction(context) {
    return undefined;
  }

  /**
   * 收集橡皮光标 overlay 条目
   * @description 手势期间在当前轨迹点绘制橡皮大小的圆形轮廓。
   * @param {{
   *   viewport?: import("../../../components/orchestration/viewport.js").Viewport,
   * }} [overlayContext={}] - overlay 上下文
   * @returns {import("../../../components/renderer/ui-overlay-factory.js").UiOverlayEntry[]}
   */
  collectUiOverlayEntries(overlayContext = {}) {
    if (!this.isGestureActive || !this._lastTrailPoint) {
      return [];
    }

    const viewport = overlayContext.viewport;
    const zoom = viewport?.zoom ?? 1;

    return [
      {
        source: "eraser-cursor",
        type: "point",
        geometry: {
          worldPoint: {
            x: this._lastTrailPoint.x,
            y: this._lastTrailPoint.y,
          },
          radius: (this.eraserSize / 2) * zoom,
        },
        style: {
          strokeStyle: "#666666",
          lineWidth: 1,
        },
      },
    ];
  }

  /**
   * 重置工具状态
   * @returns {void}
   */
  reset() {
    this._lastTrailPoint = null;
  }
}

export { DEFAULT_ERASER_SIZE, ObjectEraserTool };
