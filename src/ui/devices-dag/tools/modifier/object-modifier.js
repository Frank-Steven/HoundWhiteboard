/**
 * @file 对象修改工具
 * @description 提供对象几何和属性修改的基础工具实现。
 * @module ui/devices-dag/tools/modifier/object-modifier
 * @author Zhou Chenyu
 */

import { GestureTool } from "../gesture-tool.js";
import { SignalPacket } from "../../dag-core/signal.js";
import { SIGNAL_TYPES } from "../../dag-core/signal-types.js";
import { BasicObject } from "../../../../kernel/objects/basic-obj.js";
import { RectangleRange } from "../../../../kernel/range/index.js";
import { Vector } from "../../../../kernel/utils/math.js";
import { createCompatSelectionEntriesForSummaries } from "../../../components/renderer/ui-overlay-factory.js";

/**
 * 修改手势补丁
 * @description 形状与 `boardApi.modifyObject(objectId, patch)` 的补丁契约一致。
 * @typedef {Object} ModifyGesturePatch
 * @property {import("../../../../kernel/utils/math.js").Vector|import("../../../../kernel/types/types.js").Point2D} [position] - 对象世界坐标位置
 * @property {Record<string, any>} [data] - 类型专属几何数据补丁
 * @property {import("../../../../kernel/types/types.js").TransformMatrix2D} [transform] - 对象变换矩阵补丁
 */

/**
 * 修改手势交互上下文
 * @typedef {Object} ModifyGestureInteraction
 * @property {SignalPacket} signalPacket - 输入信号包
 * @property {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
 * @property {Array<{type: string, context?: *}>} signals - 信号列表
 * @property {Vector|null} position - 世界坐标位置
 * @property {Vector|null} displacement - 相对位移
 * @property {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 当前活动的修改对象
 * @property {boolean} hasEndSignal - 是否包含结束信号
 * @property {boolean} hasCancelSignal - 是否包含取消信号
 * @property {boolean} hasSuccessSignal - 是否包含提交信号
 * @property {boolean} hasDeleteSignal - 是否包含删除信号
 */

/**
 * 对象修改工具基类
 * @class
 * @abstract
 * @extends GestureTool
 * @description
 * 对象修改工具负责改变已有对象的几何形态、样式或其它可编辑属性。
 */
class ObjectModifierTool extends GestureTool {
  /**
   * overlay 渲染用——当前编辑中的对象集合
   * @type {import("../../../../kernel/types/types.js").LightweightObjectEntry[]}
   * @protected
   */
  _overlayModifiedObjects = [];

  /**
   * 当前待提交的对象集合缓存
   * @type {Array<BasicObject>|null}
   * @protected
   */
  _pendingActionObjects = null;

  /**
   * 当前待提交的对象 id 集合缓存
   * @type {number[]|null}
   * @protected
   */
  _pendingActionObjectIds = null;

  /**
   * 当前手势的增量式分子 id
   * @description 手势首个空间帧经 `boardApi.beginMol` 分配；手势期间 `applyGesturePatch`
   * 的补丁改经 `amendMol` 流入 amend 流（不产生记录），end/cancel/success 时闭合或中止。
   * `null` 表示无在途分子（旧 modifyObject 逐帧路径）。
   * @type {?string}
   * @protected
   */
  _molId = null;

  /**
   * 分子 id 确认中的挂起状态
   * @description Worker 模式下 beginMol 经 RPC 确认异步返回 molId；挂起期间
   * `applyGesturePatch` 的补丁只落本地条目（渲染不等内核），molId 到达后由
   * `#resolveMol` 补发最新绝对坐标并执行延迟的闭合/中止。
   * abort 时挂起状态立即与手势解绑（本字段置空），stale pending 由
   * `#resolveMol` 走 abort 分支自决，不阻塞新手势的 beginMol。
   * @type {?{ closing: "end"|"abort"|null, context: Object, objects: Array }}
   * @protected
   */
  _molPending = null;

  /**
   * 提交修改后是否自动卸载当前 workflow 节点
   * @description wrapper 嵌入场景（如 HandoffWrapperTool）由 wrapper 置为 false，
   * 阻止 modifier 提交后自卸载，保持两阶段流程的槽位存活。
   * @type {boolean}
   */
  autoUmountOnApply = true;

  /**
   * 收集 modifier 当前声明的兼容 ui overlay
   * @param {{
   *   viewport?: import("../../../components/orchestration/viewport.js").Viewport,
   *   renderer?: import("../../../components/renderer/ui-renderer.js").UiRenderer,
   * }} [overlayContext={}] - overlay 上下文
   * @returns {import("../../../components/renderer/ui-overlay-factory.js").UiOverlayEntry[]}
   */
  collectUiOverlayEntries(overlayContext = {}) {
    const { viewport, renderer } = overlayContext;
    const objects = this._overlayModifiedObjects;

    if (objects.length === 0 || !renderer) {
      return [];
    }

    return createCompatSelectionEntriesForSummaries(
      objects,
      "modifier",
      viewport,
    );
  }

  /**
   * 规整本次修改涉及的对象集合
   * @description 仅规整显式传入的对象；不再回退读取 node state 投影。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   * @returns {Array<BasicObject>}
   */
  resolveModifiedObjects(context, objects) {
    return this.normalizeObjectCollection(objects);
  }

  /**
   * 解析对象条目的当前位置
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry} objectEntry - 对象实例或兼容条目
   * @returns {Vector|null} 当前位置
   * @protected
   */
  resolveModifiedObjectPosition(objectEntry) {
    return Vector.parse(objectEntry?.position);
  }

  /**
   * 解析对象条目的局部判定范围
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry} objectEntry - 对象实例或兼容条目
   * @returns {import("../../../../kernel/range/range.js").Range|null} 局部 range
   * @protected
   */
  resolveModifiedObjectRange(objectEntry) {
    if (objectEntry?.range) {
      return objectEntry.range;
    }
    if (typeof objectEntry?.getRange === "function") {
      return objectEntry.getRange();
    }
    return null;
  }

  /**
   * 解析对象条目的世界矩形
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry} objectEntry - 对象实例或兼容条目
   * @returns {RectangleRange|null} 世界矩形
   * @protected
   */
  resolveModifiedObjectWorldRect(objectEntry) {
    const position = this.resolveModifiedObjectPosition(objectEntry);
    const localRange = this.resolveModifiedObjectRange(objectEntry);
    if (
      position &&
      localRange &&
      typeof localRange.withPosition === "function"
    ) {
      return RectangleRange.from(localRange.withPosition(position));
    }

    const localBoundingBoxSource =
      objectEntry?.boundingBox ?? objectEntry?.rich?.boundingBox;
    const localBoundingBox = localBoundingBoxSource
      ? RectangleRange.fromRectLike(localBoundingBoxSource)
      : null;
    if (
      position &&
      localBoundingBox &&
      typeof localBoundingBox.withPosition === "function"
    ) {
      return RectangleRange.from(localBoundingBox.withPosition(position));
    }

    return null;
  }

  /**
   * 将手势补丁写入对象条目并同步 RPC
   * @description
   * 修改工具的统一写入口：patch 形状与 `boardApi.modifyObject(objectId, patch)` 的补丁契约一致。
   * position 经 Vector.parse 规整；有 boardApi 且 objectId 有效时，分子在途（`_molId` 非空）
   * 经 `boardApi.amendMol(molId, { objectId: patch })` 流入 amend 流，否则一次性
   * `boardApi.modifyObject(objectId, patch)` 提交整份补丁；
   * 本地条目同步更新（position → 新 Vector、data → Object.assign 合并、transform → 浅拷贝）。
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry} objectEntry - 当前对象条目
   * @param {ModifyGesturePatch} patch - 手势补丁
   * @param {Object} [interaction={}] - 当前交互上下文（经 interaction.context 取 boardApi）
   * @returns {void}
   */
  applyGesturePatch(objectEntry, patch, interaction = {}) {
    if (!objectEntry || !patch) return;

    const rpcPatch = {};

    if (patch.position != null) {
      const normalizedPosition = Vector.parse(patch.position);
      if (normalizedPosition) {
        rpcPatch.position = {
          x: normalizedPosition.x,
          y: normalizedPosition.y,
        };
        objectEntry.position = new Vector(
          normalizedPosition.x,
          normalizedPosition.y,
        );
      }
    }

    if (patch.data != null) {
      rpcPatch.data = patch.data;
      objectEntry.data = Object.assign({}, objectEntry.data, patch.data);
    }

    if (patch.transform != null) {
      rpcPatch.transform = { ...patch.transform };
      objectEntry.transform = { ...patch.transform };
    }

    const objectId = this.resolveObjectId(objectEntry);
    const boardApi = interaction?.context?.services?.boardApi;
    if (boardApi && objectId != null && Object.keys(rpcPatch).length > 0) {
      if (this._molId != null && typeof boardApi.amendMol === "function") {
        // 分子在途：补丁入 amend 流（不产生记录），endMol 时折叠物化
        boardApi.amendMol(this._molId, { [objectId]: rpcPatch });
      } else if (this._molPending != null) {
        // molId 确认中（Worker 模式 RPC 往返）：补丁只落本地条目，
        // molId 到达后由 #resolveMol 补发最新绝对坐标
      } else {
        boardApi.modifyObject(objectId, rpcPatch);
      }
    }
  }

  /**
   * 通过 RPC 写入对象绝对位置
   * @description 保留的兼容入口，委托 `applyGesturePatch(obj, { position }, ...)` 实现。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry} objectEntry - 当前对象条目
   * @param {{ x: number, y: number }} position - 新位置
   * @returns {void}
   * @protected
   */
  setModifiedObjectPosition(context, objectEntry, position) {
    this.applyGesturePatch(objectEntry, { position }, { context });
  }

  /**
   * 接收 handoff 传递的活跃修改对象
   * @description
   * 当 handoff 从第一阶段（chooser/creator）切换到第二阶段（modifier）时立即调用。
   * 工具将对象存入私有字段 _overlayModifiedObjects，作为唯一权威数据来源。
   * 不写 node state——process() 执行时会通过 setContextObjects 写入正确的路径。
   * 存完后触发 UI overlay 刷新，使 overlay 系统立即收集工具的条目。
   * 已被同步的情况下重复调用不会重复写入。
   * @param {Array<Object>} objects - handoff 桥接的对象摘要
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} [context={}] - 设备图处理器上下文（用于触发 overlay 刷新）
   * @returns {void}
   */
  receiveHandoffObjects(objects, context = {}) {
    if (this._overlayModifiedObjects.length > 0) return;
    this._overlayModifiedObjects = this.normalizeObjectCollection(objects);

    // 确保 overlay provider 已在 viewport 注册。
    // createUiOverlayBinding 内建缓存，后续 processor 的 sync 不会重复注册。
    this.syncUiOverlay(context);

    this.requestUiOverlayRefresh(context);
  }

  /**
   * 解析当前仍处于 AOM 动态图中的对象集合
   * @description
   * 真相源是实例字段 `_overlayModifiedObjects`（handoff 桥接或自身 process 写入）；
   * 显式传入 objects 时直接规整返回。不再回退读取 node state 投影。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   * @returns {Array<BasicObject>}
   */
  resolveActiveModifiedObjects(context, objects) {
    if (objects != null) {
      return this.normalizeObjectCollection(objects);
    }
    return this._overlayModifiedObjects;
  }

  /**
   * 在对象几何修改前记录旧快照
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   */
  beforeGeometryMutation(context, objects) {
    const normalizedObjects = this.resolveModifiedObjects(context, objects);

    if (normalizedObjects.length === 0) return;
    if (context?.services?.boardApi) return;

    context?.services?.viewport?.renderer?.captureObjectSnapshot?.(
      normalizedObjects,
    );
  }

  /**
   * 在对象几何修改后请求活动层刷新
   * @description
   * boardApi 存在时 Core 侧 RPC handler 已自动触发 ViewportRenderer 输出刷新，
   * 此处仅刷新 UI overlay。非 boardApi 路径自行失效 live 脏区。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   */
  afterGeometryMutation(context, objects) {
    const normalizedObjects = this.resolveModifiedObjects(context, objects);

    if (normalizedObjects.length === 0) return;

    if (context?.services?.boardApi) {
      this.requestUiOverlayRefresh(context);
      return;
    }

    context?.services?.viewport?.renderer?.invalidateActiveObjects?.(
      normalizedObjects,
    );
    context?.services?.viewport?.requestViewportUiRender?.();
  }

  /**
   * 以统一的快照协议包装一次几何修改
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Function} mutate - 实际执行修改的回调
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   * @param {{ captureSnapshot?: boolean }} [options={}] - 选项对象
   * @returns {*}
   */
  withGeometryMutation(context, mutate, objects, options = {}) {
    const { captureSnapshot = true } = options;
    const normalizedObjects = this.resolveModifiedObjects(context, objects);

    if (captureSnapshot) {
      this.beforeGeometryMutation(context, normalizedObjects);
    }
    try {
      return mutate?.();
    } finally {
      this.afterGeometryMutation(context, normalizedObjects);
    }
  }

  /**
   * 解析当前动作应提交的对象集合
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   * @returns {Array<BasicObject>}
   * @protected
   */
  resolveActionObjects(context, objects) {
    if (objects != null) {
      return this.resolveActiveModifiedObjects(context, objects);
    }

    if (Array.isArray(this._pendingActionObjects)) {
      return this._pendingActionObjects;
    }

    return this.resolveActiveModifiedObjects(context);
  }

  /**
   * 决定是否执行 apply
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Array<BasicObject>} objects - 已解析的活动对象
   * @returns {boolean}
   * @protected
   */
  beforeApplyModifiedObjects(context, objects) {
    return true;
  }

  /**
   * GestureTool 生命周期适配：动作执行前校验
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {boolean}
   * @protected
   */
  beforeAction(context) {
    const normalizedObjects = this.resolveActionObjects(context);

    if (normalizedObjects.length === 0) {
      this.clearContextObjects(context);
      return false;
    }

    if (this.beforeApplyModifiedObjects(context, normalizedObjects) === false) {
      return false;
    }

    const boardApi = context?.services?.boardApi;
    const objectIds = this.resolveObjectIds(context, normalizedObjects);
    if (!boardApi || objectIds.length === 0) {
      this.clearContextObjects(context);
      return false;
    }

    this._pendingActionObjects = normalizedObjects;
    this._pendingActionObjectIds = objectIds;
    return true;
  }

  /**
   * GestureTool 生命周期适配：执行对象提交流程
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {boolean}
   * @protected
   */
  performAction(context) {
    const normalizedObjects = this.resolveActionObjects(context);
    const objectIds =
      this._pendingActionObjectIds ??
      this.resolveObjectIds(context, normalizedObjects);
    const boardApi = context?.services?.boardApi;

    if (!boardApi || objectIds.length === 0) {
      this.clearContextObjects(context);
      return false;
    }

    boardApi.commitObjects(objectIds, { supraKey: context?.services?.supraKey });
    this._overlayModifiedObjects = [];
    this.clearContextObjects(context);

    const autoUmount = this.autoUmountOnApply !== false;
    if (
      autoUmount &&
      typeof context.dag?.unmount === "function" &&
      typeof context.path === "string"
    ) {
      context.dag.unmount(context.path);
    }

    return true;
  }

  /**
   * 提交成功后的扩展钩子
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Array<BasicObject>} objects - 已提交的对象
   * @param {boolean} result - 提交结果
   * @returns {void}
   * @protected
   */
  afterApplyModifiedObjects(context, objects, result) { }

  /**
   * GestureTool 生命周期适配：动作完成后的通知
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {boolean} result - 动作结果
   * @returns {void}
   * @protected
   */
  afterAction(context, result) {
    const normalizedObjects = this.resolveActionObjects(context);
    super.afterAction(context, result);
    this.afterApplyModifiedObjects(context, normalizedObjects, result);
    this._pendingActionObjects = null;
    this._pendingActionObjectIds = null;
  }

  /**
   * GestureTool 生命周期适配：丢弃当前动作持有对象
   * @description 丢弃后同步清空 `_overlayModifiedObjects` 真相源与 objects 投影。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {void}
   * @protected
   */
  discardAction(context) {
    const normalizedObjects = this.resolveActionObjects(context);
    const boardApi = context?.services?.boardApi;
    const objectIds = this.resolveObjectIds(context, normalizedObjects);

    if (boardApi && objectIds.length > 0) {
      boardApi.discardActiveObjects(objectIds, { supraKey: context?.services?.supraKey });
    }

    this._overlayModifiedObjects = [];
    this.clearContextObjects(context);
    this._pendingActionObjects = null;
    this._pendingActionObjectIds = null;
  }

  /**
   * 清理 modifier 的 overlay 临时状态
   * @description
   * overlay 渲染直接以 `_overlayModifiedObjects` 真相源为输入，
   * 此处仅请求重绘；真相源的清理由 discardAction / performAction / umount 承担。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} [context={}] - 设备图处理器上下文
   * @returns {void}
   * @protected
   */
  clearOverlayState(context = {}) {
    this.requestUiOverlayRefresh(context);
  }

  /**
   * 将当前修改对象提交回静态图
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {Iterable<BasicObject>|BasicObject} [objects] - 显式传入的对象或对象集合
   * @returns {boolean}
   */
  applyModifiedObjects(context, objects) {
    this._pendingActionObjects = this.resolveActionObjects(context, objects);
    this._pendingActionObjectIds = null;

    try {
      return this.completeAction(context) === true;
    } finally {
      this._pendingActionObjects = null;
      this._pendingActionObjectIds = null;
    }
  }

  /**
   * 在修改工具被卸载时撤销未提交的活动对象引用
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} [context={}] - 设备图处理器上下文
   * @returns {void}
   */
  umount(context = {}) {
    this.isActionActive = false;
    const normalizedObjects = this.resolveActiveModifiedObjects(context);
    const boardApi = context?.services?.boardApi;
    const objectIds = this.resolveObjectIds(context, normalizedObjects);

    if (boardApi && objectIds.length > 0) {
      boardApi.discardActiveObjects(objectIds, { supraKey: context?.services?.supraKey });
    }

    this._overlayModifiedObjects = [];
    this.clearContextObjects(context);
    this._pendingActionObjects = null;
    this._pendingActionObjectIds = null;
    super.umount(context);
  }
}

/**
 * 手势驱动对象修改工具
 * @class
 * @abstract
 * @extends ObjectModifierTool
 * @description
 * 内置手势生命周期编排的对象修改工具，支持 position 与 displacement 双通道信号。
 * 本类是信号路由层：负责 cancel / success / orphan end / spatial 双通道的调度，
 * 手势状态机本身由必传的 processor 策略对象承担（见 gesture/drag-processor.js），
 * 四个手势钩子与 displacement 处理全部委托给它。
 *
 * 手势模型：
 * 1. position 信号到达 → 手势开始（begin）或持续更新（update）
 * 2. displacement 信号到达 → 无状态增量，由 processor 直接累加到对象位置
 *    基准位置跟随位移同步，锚点不动，保持光标-对象偏移不变
 * 3. end 信号 → 手势结束（complete），对象保留在 AOM 动态图中
 * 4. success 信号 → 提交到静态图（applyModifiedObjects），随后重置 processor
 * 5. cancel 信号 → 取消当前手势（cancel），将对象回滚到手势开始时的初始位置
 *
 * 该工具同时接受 world 坐标 position 和相对位移 displacement 驱动。
 *
 * @author Zhou Chenyu
 */
class GestureBasedObjectModifierTool extends ObjectModifierTool {
  /**
   * 拖拽手势处理器（策略对象，承担锚点 / 基准位置 / 初始位置等全部手势状态）
   * @type {import("./gesture/drag-processor.js").DragGestureProcessor}
   */
  processor;

  /**
   * 手势分子起点快照（objectId → 位置）
   * @description `#ensureMol` 开启分子时从本地条目捕获，abortMol 后用于把本地条目
   * 同步回手势起点（内核实例已由 abortMol 还原，本地条目不再经 applyGesturePatch 回写）。
   * @type {Map<string, { x: number, y: number }>|null}
   * @private
   */
  _molBeginPositions = null;

  /**
   * @param {{
   *   processor: import("./gesture/drag-processor.js").DragGestureProcessor,
   * }} options - 配置选项（processor 必传）
   * @constructor
   */
  constructor(options) {
    super();
    if (!options?.processor) {
      throw new Error(
        "GestureBasedObjectModifierTool requires an explicit `processor` option.",
      );
    }
    this.processor = options.processor;
    this.autoActionOnGestureEnd = false;
  }

  /**
   * 开启当前手势的增量式分子（幂等）
   * @description 手势首个 position/displacement 帧调用：boardApi 具备分子能力
   * （beginMol/amendMol）时分配 molId 并捕获手势起点快照；无分子能力或分配失败时
   * 保持 `_molId = null`，applyGesturePatch 回退旧 modifyObject 逐帧路径。
   * Worker 模式 beginMol 异步返回（Promise），进入挂起状态由 `#resolveMol` 收尾。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @returns {void}
   * @private
   */
  #ensureMol(context, objects) {
    if (this._molId !== null || this._molPending !== null) return;
    const boardApi = context?.services?.boardApi;
    if (
      typeof boardApi?.beginMol !== "function" ||
      typeof boardApi?.amendMol !== "function"
    ) {
      return;
    }
    const objectIds = this.resolveObjectIds(context, objects);
    if (objectIds.length === 0) return;
    let allocated;
    try {
      allocated = boardApi.beginMol(objectIds, {
        supraKey: context?.services?.supraKey,
      });
    } catch {
      return;
    }
    this._molBeginPositions = new Map(
      objects.map((obj) => [
        this.resolveObjectId(obj) ?? obj,
        this.resolveModifiedObjectPosition(obj),
      ]),
    );
    if (typeof allocated?.then === "function") {
      // Worker 模式：molId 经 RPC 确认异步到达；确认前补丁只落本地条目，
      // 确认后由 #resolveMol 补发最新绝对坐标（幂等覆盖，中间帧由本地渲染承担）
      const pending = { closing: null, context, objects };
      this._molPending = pending;
      Promise.resolve(allocated).then(
        (molId) => this.#resolveMol(pending, molId),
        () => {
          if (this._molPending === pending) {
            this._molPending = null;
          }
        },
      );
      return;
    }
    this._molId = allocated;
  }

  /**
   * molId 确认到达：补发挂起期间的最新位置并执行延迟的闭合/中止
   * @description
   * 已被 abort 解绑的 stale pending（`this._molPending !== pending`）同样走 abort
   * 分支自决，但不得触碰当前手势的 `_molId`。
   * @param {{ closing: "end"|"abort"|null, context: Object, objects: Array }} pending - 挂起状态
   * @param {*} molId - beginMol 确认的分子 id（非字符串时视为分配失败）
   * @returns {void}
   * @private
   */
  #resolveMol(pending, molId) {
    const isCurrent = this._molPending === pending;
    if (!isCurrent && pending.closing !== "abort") return;
    if (isCurrent) {
      this._molPending = null;
    }
    const boardApi = pending.context?.services?.boardApi;
    if (typeof molId !== "string" || molId === "") return;
    if (pending.closing === "abort") {
      // 挂起期间无补丁到达内核，abort 还原 before 幂等无害
      boardApi?.abortMol?.(molId);
      return;
    }
    this._molId = molId;
    const patches = {};
    for (const obj of pending.objects) {
      const objectId = this.resolveObjectId(obj);
      const position = this.resolveModifiedObjectPosition(obj);
      if (objectId != null && position) {
        patches[objectId] = { position: { x: position.x, y: position.y } };
      }
    }
    const alive =
      Object.keys(patches).length === 0 ||
      boardApi?.amendMol?.(molId, patches) !== false;
    if (!alive) {
      // 挂起期间分子已被内核强制闭合（undo 抢先）：复位手势并按内核位置同步
      this._molId = null;
      this._molBeginPositions = null;
      this.isGestureActive = false;
      this.processor.reset();
      this.#syncPositionsFromKernel(pending.context, pending.objects);
      return;
    }
    if (pending.closing === "end") {
      this.#endMol(pending.context);
    }
  }

  /**
   * 按内核查询结果同步本地条目位置（手势被强制结束后对齐 undo 回退）
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @returns {void}
   * @private
   */
  #syncPositionsFromKernel(context, objects) {
    const boardApi = context?.services?.boardApi;
    if (typeof boardApi?.queryObjects !== "function") return;
    const ids = this.resolveObjectIds(context, objects);
    if (ids.length === 0) return;
    Promise.resolve(boardApi.queryObjects(ids))
      .then((summaries) => {
        const byId = new Map(
          (summaries ?? []).map((s) => [String(s?.id), s]),
        );
        for (const obj of objects) {
          const summary = byId.get(String(this.resolveObjectId(obj)));
          const position = Vector.parse(summary?.position);
          if (position) {
            obj.position = position;
          }
        }
        this.requestUiOverlayRefresh(context);
      })
      .catch(() => { });
  }

  /**
   * 定稿当前手势分子：amend 流折叠物化为分子记录
   * @description 无在途分子时为空操作；endMol 对已关闭分子在内核侧同样幂等。
   * molId 确认中（Worker 模式）时标记延迟闭合，确认后由 `#resolveMol` 执行。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {void}
   * @private
   */
  #endMol(context) {
    if (this._molPending !== null) {
      this._molPending.closing = "end";
      return;
    }
    if (this._molId === null) return;
    const molId = this._molId;
    this._molId = null;
    this._molBeginPositions = null;
    context?.services?.boardApi?.endMol?.(molId);
  }

  /**
   * 中止当前手势分子：丢弃 amend 流，内核实例还原到手势 before
   * @description 无在途分子时为空操作并返回 false。
   * molId 确认中（Worker 模式）时标记延迟中止并立即与当前手势解绑
   * （`_molPending` 置空，新手势可重新 beginMol），
   * 确认后由 `#resolveMol` 对 stale pending 走 abort 分支自决。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {boolean} 是否中止了一个在途分子
   * @private
   */
  #abortMol(context) {
    if (this._molPending !== null) {
      const pending = this._molPending;
      this._molPending = null;
      pending.closing = "abort";
      return true;
    }
    if (this._molId === null) return false;
    const molId = this._molId;
    this._molId = null;
    context?.services?.boardApi?.abortMol?.(molId);
    return true;
  }

  /**
   * abortMol 后把本地条目同步回手势起点
   * @description 内核实例已被 abortMol 还原（position/data/transform 全量），
   * 此处仅写本地条目的 position（drag 手势的唯一变更维度），不再回写内核。
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @returns {void}
   * @private
   */
  #syncMolBeginPositions(objects) {
    const beginPositions = this._molBeginPositions;
    this._molBeginPositions = null;
    if (!beginPositions) return;
    for (const obj of objects) {
      const key = this.resolveObjectId(obj) ?? obj;
      const beginPosition = beginPositions.get(key);
      if (beginPosition) {
        obj.position = new Vector(beginPosition.x ?? 0, beginPosition.y ?? 0);
      }
    }
  }

  /**
   * 从信号包中提取世界坐标位置
   * @description
   * 优先通过 context.resolvePosition 解析，否则从 position 信号中读取。
   * 所有路径的结果都会经过 Vector.parse 归一化为 Vector。
   * @param {SignalPacket} signalPacket - 输入信号包
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {Vector|null}
   * @protected
   */
  _extractPosition(signalPacket, context) {
    if (typeof context.resolvePosition === "function") {
      const resolved = context.resolvePosition(signalPacket);
      if (resolved) return Vector.parse(resolved);
    }
    const positionSignal = signalPacket.signals.find(
      (s) => s.type === SIGNAL_TYPES.POSITION,
    );
    if (!positionSignal) return null;
    const raw =
      positionSignal?.context?.value ?? positionSignal?.context?.position;
    return Vector.parse(raw);
  }

  /**
   * 从信号包中提取相对位移
   * @param {SignalPacket} signalPacket - 输入信号包
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {Vector|null}
   * @protected
   */
  _extractDisplacement(signalPacket, context) {
    const displacementSignal = signalPacket.signals.find(
      (s) => s.type === SIGNAL_TYPES.DISPLACEMENT,
    );
    if (!displacementSignal) return null;
    const raw = displacementSignal?.context?.value;
    return Vector.parse(raw);
  }

  /**
   * 从信号包中提取修改交互上下文
   * @param {SignalPacket} signalPacket - 输入信号包
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 当前活动的修改对象
   * @returns {ModifyGestureInteraction} 交互上下文
   * @protected
   */
  buildModifyInteractionContext(signalPacket, context = {}, objects = []) {
    const baseInteraction = super.buildInteraction(signalPacket, context);
    return {
      ...baseInteraction,
      displacement: this._extractDisplacement(signalPacket, context),
      objects,
      hasEndSignal: baseInteraction.hasEnd,
      hasCancelSignal: baseInteraction.hasCancel,
      hasSuccessSignal: baseInteraction.hasSuccess,
      hasDeleteSignal: (signalPacket.signals ?? []).some(
        (s) => s?.type === SIGNAL_TYPES.DELETE,
      ),
    };
  }

  /**
   * 按内核查询摘要同步本地持有条目的位置并刷新 overlay
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} held - 本地持有条目
   * @param {Map<string, Object>} byId - 内核摘要索引（id → summary）
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {void}
   * @private
   */
  #syncHeldEntryPositions(held, byId, context) {
    for (const obj of held) {
      const summary = byId.get(String(this.resolveObjectId(obj)));
      const position = Vector.parse(summary?.position);
      if (position) {
        obj.position = position;
      }
    }
    this.requestUiOverlayRefresh(context);
  }

  /**
   * hit 变更后的失效清理：持有对象已被撤销移除时丢弃当前动作
   * @description 撤销/重做可能移除工具仍持有的对象（幽灵选择）；收到 hit:changed 时按
   * queryObjects 校验，存在已移除对象则丢弃动作（dead 对象由 discardActiveObjects 过滤）。
   * 信号 context 携带 forcedEndMolIds（内核 undo 自动闭合的在途分子）且命中当前手势分子时，
   * 结束手势复位：分子已被内核物化并撤销，本地条目按内核位置同步，对象仍活跃则保持选中。
   * 非手势期间的 hit 变更（松手后 undo/redo、对端同步）同样按内核对齐本地条目，
   * 防止选中框停留在手势终值与对象错位。
   * @param {SignalPacket|Object} signalPacket - 输入信号包
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @returns {?Promise<void>} 校验 Promise（测试可等待）
   * @private
   */
  #pruneStaleObjects(signalPacket, context) {
    const signals = signalPacket?.signals ?? [];
    const hitSignal = signals.find((s) => s?.type === "hit:changed");
    if (!hitSignal) return null;
    const boardApi = context?.services?.boardApi;
    const held = this.resolveActiveModifiedObjects(context);
    if (typeof boardApi?.queryObjects !== "function" || held.length === 0) {
      return null;
    }
    const ids = this.resolveObjectIds(context, held);
    if (ids.length === 0) return null;
    const forcedIds = hitSignal?.context?.forcedEndMolIds;
    // 内核 undo 自动闭合本端全部在途分子：命中当前手势分子则结束后复位；
    // molId 确认中（Worker 模式 RPC 往返）无法按 id 匹配，但 pending 分子必在被闭合之列
    const forcedHit =
      Array.isArray(forcedIds) &&
      ((this._molId !== null && forcedIds.includes(this._molId)) ||
        (this._molPending !== null && forcedIds.length > 0));
    return Promise.resolve(boardApi.queryObjects(ids))
      .then((summaries) => {
        const byId = new Map(
          (summaries ?? []).map((s) => [String(s?.id), s]),
        );
        // 失效 = 对象不存在或已被移出活动层（如撤销了选择）：
        // 存在但非活动的对象不能继续持有（幽灵选择）
        const stale = ids.some((id) => {
          const summary = byId.get(String(id));
          return !summary || summary.isActive !== true;
        });
        if (stale) {
          // 在途分子一并中止，防止悬挂分子的后续 amend 落到已失效对象
          this.#abortMol(context);
          this._molBeginPositions = null;
          if (this.isGestureActive) {
            // 手势进行中：回滚几何
            this.discardAction(context);
            return;
          }
          // 无手势：结束动作让 wrapper 复位相位（再次框选才能生效）
          // 对已失效对象 commitObjects 为幂等空操作，无副作用
          this.completeAction(context);
          return;
        }
        if (forcedHit) {
          // 拖动中撤销：内核已强制闭合本手势分子并撤销（实例回退到手势前），
          // 手势状态复位、本地条目按内核位置同步；对象仍在活动层保持选中，
          // 用户继续拖动会从 begin 开启新分子
          this._molId = null;
          this._molPending = null;
          this._molBeginPositions = null;
          this.isGestureActive = false;
          this.processor.reset();
          this.#syncHeldEntryPositions(held, byId, context);
          return;
        }
        if (!this.isGestureActive) {
          // 非手势期间的 hit 变更（松手后 undo/redo、对端同步）：
          // 内核实例已回退或重放，本地条目按内核对齐（选中框跟随对象）
          this.#syncHeldEntryPositions(held, byId, context);
        }
      })
      .catch(() => { });
  }

  /**
   * 处理信号包（手势驱动）
   * @param {SignalPacket|Object} signalPacket - 输入信号包
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} [context={}] - 设备图处理器上下文
   * @returns {void}
   */
  process(signalPacket, context = {}) {
    this.#pruneStaleObjects(signalPacket, context);
    const packet = SignalPacket.from(signalPacket);

    const objects = this.resolveActiveModifiedObjects(context);
    if (objects.length === 0) {
      this._overlayModifiedObjects = [];
      return;
    }

    this.setContextObjects(context, objects);
    this._overlayModifiedObjects = objects;
    const interaction = this.buildModifyInteractionContext(
      packet,
      context,
      objects,
    );

    if (interaction.hasDeleteSignal) {
      this._handleDelete(interaction, context, objects);
      return;
    }

    if (interaction.hasCancelSignal) {
      this._handleCancel(interaction, context, objects);
      return;
    }

    if (interaction.hasSuccessSignal) {
      this._handleSuccess(interaction, context, objects);
      return;
    }

    if (!interaction.position && !interaction.displacement) {
      this._handleOrphanEnd(interaction, context);
      return;
    }

    this._handleSpatialUpdate(interaction, context, objects);
  }

  /**
   * 处理 delete 信号：删除当前持有的对象
   * @description
   * 手势进行中先 abort 在途分子（丢弃 amend 流，内核实例还原后随即被删，
   * 无需回写本地条目），再经 `boardApi.deleteObjects` 永久删除持有对象——
   * 删除记录随 supraKey 进入 wrapper 的会话分子，撤销以整个选择会话为单位。
   * 删除后调用 `completeAction`：对已 discard 的对象 commitObjects 为幂等空操作，
   * 由它负责清空 `_overlayModifiedObjects`、刷新 overlay，并经 `afterAction`
   * 发出 action:complete 让 handoff wrapper 复位相位。
   * @param {ModifyGestureInteraction} interaction - 当前交互上下文
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @private
   */
  _handleDelete(interaction, context, objects) {
    const boardApi = context?.services?.boardApi;
    const objectIds = this.resolveObjectIds(context, objects);
    if (typeof boardApi?.deleteObjects !== "function" || objectIds.length === 0) {
      return;
    }

    if (this.isGestureActive || this._molId !== null || this._molPending !== null) {
      this.#abortMol(context);
      this._molBeginPositions = null;
      this.isGestureActive = false;
      this.processor.reset();
    }

    boardApi.deleteObjects(objectIds, { supraKey: context?.services?.supraKey });
    this.completeAction(context);
  }

  /**
   * 处理 cancel 信号：取消当前手势
   * @description
   * 无论手势是否激活，都尝试回退对象位置。
   * 分子在途（手势进行中取消）时由 abortMol 丢弃 amend 流并把内核实例还原到手势
   * before（position/data/transform 全量），取代 drag-processor 的 position-only 本地回滚；
   * 无在途分子（松手后取消）走旧路径：processor 回滚到初始位置（内核经 applyGesturePatch 同步）。
   * 对象仍由本工具持有（`_overlayModifiedObjects` 保留），
   * 由后续的 discardAction / success / umount 决定归属。
   * @param {ModifyGestureInteraction} interaction - 当前交互上下文
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @private
   */
  _handleCancel(interaction, context, objects) {
    if (this._molId !== null || this._molPending !== null) {
      this.withGeometryMutation(
        context,
        () => {
          this.#abortMol(context);
          this.#syncMolBeginPositions(objects);
          this.processor.reset();
        },
        objects,
        { captureSnapshot: false },
      );
    } else {
      this.withGeometryMutation(
        context,
        () => this.cancelGesture(interaction),
        objects,
        { captureSnapshot: false },
      );
    }
    this.isGestureActive = false;
  }

  /**
   * 处理 success 信号：结束手势并提交修改到静态图
   * @description 提交完成后重置 processor——初始位置缓存不再需要用于回退，
   * 确保下一轮新对象的 handoff 中 begin 能重新记录。
   * @param {ModifyGestureInteraction} interaction - 当前交互上下文
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @private
   */
  _handleSuccess(interaction, context, objects) {
    if (this.isGestureActive) {
      this.completeGesture(interaction);
      this.isGestureActive = false;
    }
    // 未松手直接 success 时兜底物化当前分子（松手已闭合的幂等空操作）；
    // 已物化对象由内核水位机制跳过重复 modify，commitObjects 只产取消选择分子
    this.#endMol(context);
    this.applyModifiedObjects(context, objects);
    this.processor.reset();
    this._overlayModifiedObjects = [];
  }

  /**
   * 处理无位置信号时孤立的 end 信号
   * @param {ModifyGestureInteraction} interaction - 当前交互上下文
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @private
   */
  _handleOrphanEnd(interaction, context) {
    if (interaction.hasEndSignal && this.isGestureActive) {
      this.completeGesture(interaction);
      this.isGestureActive = false;
      // 松手 = 分子物化（amend 流折叠为分子记录上链）
      this.#endMol(context);
    }
  }

  /**
   * 处理空间更新：position / displacement 双通道
   * @description
   * 1. position 驱动手势状态机（begin → update → end/cancel）
   * 2. displacement 作为无状态增量由 processor 直接累加到对象位置
   * 3. 两者可在同一帧并存：position 先算，displacement 再叠，锚点跟随位移
   * @param {ModifyGestureInteraction} interaction - 当前交互上下文
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} context - 设备图处理器上下文
   * @param {import("../../../../kernel/types/types.js").LightweightObjectEntry[]} objects - 活动对象
   * @private
   */
  _handleSpatialUpdate(interaction, context, objects) {
    // Step 1: Position 处理（手势状态机）
    if (interaction.position) {
      if (!this.isGestureActive) {
        // 首次位置：准入检测 → 开启分子 → begin + update
        if (this.canBeginGesture(interaction) === false) return;
        this.#ensureMol(context, objects);
        this.withGeometryMutation(
          context,
          () => {
            this.beginGesture(interaction);
            this.updateGesture(interaction);
          },
          objects,
        );
        this.isGestureActive = true;
      } else {
        // 后续位置：仅 update，无需重复抓取快照
        this.withGeometryMutation(
          context,
          () => {
            this.updateGesture(interaction);
          },
          objects,
          { captureSnapshot: false },
        );
      }
    }

    // Step 2: Displacement 处理（无状态，直接累加）
    if (interaction.displacement) {
      // displacement 首帧（无 position 先行）同样开启分子
      this.#ensureMol(context, objects);
      this.withGeometryMutation(
        context,
        () => this.processor.displace(this, interaction),
        objects,
        { captureSnapshot: false },
      );
    }

    // Step 3: End 检查（松手 = 分子物化）
    if (interaction.hasEndSignal) {
      this.completeGesture(interaction);
      this.isGestureActive = false;
      this.#endMol(context);
    }
  }

  /**
   * 手势准入检查，决定是否允许开始修改手势，子类可覆写以添加区域命中检测等限制
   * @param {Object} interaction - 当前交互上下文
   * @returns {boolean}
   * @protected
   */
  canBeginGesture(interaction) {
    return true;
  }

  /**
   * 修改手势开始（委托给 processor）
   * @param {Object} interaction - 当前交互上下文
   */
  beginGesture(interaction) {
    this.processor.begin(this, interaction);
  }

  /**
   * 修改手势更新（委托给 processor）
   * @param {Object} interaction - 当前交互上下文
   */
  updateGesture(interaction) {
    this.processor.update(this, interaction);
  }

  /**
   * 修改手势完成（委托给 processor）
   * @param {Object} interaction - 当前交互上下文
   */
  completeGesture(interaction) {
    this.processor.complete(this, interaction);
  }

  /**
   * 修改手势取消（委托给 processor）
   * @description
   * processor 负责将对象回滚到手势开始时的初始状态。
   * 基类 _handleCancel 已包裹 withGeometryMutation，
   * processor 只需恢复几何，无需关心引用失效与渲染刷新。
   * @param {Object} interaction - 当前交互上下文
   */
  cancelGesture(interaction) {
    this.processor.cancel(this, interaction);
  }

  /**
   * 工具节点被卸载时清理手势状态
   * @description 在途分子一并中止（abortMol 幂等兜底），随后走基类的 discard 流程。
   * @param {import("../../dag-type.js").DevicesDAGHandlerContext} [context={}] - 设备图处理器上下文
   * @returns {void}
   */
  umount(context = {}) {
    this.isActionActive = false;
    this.isGestureActive = false;
    if (this.#abortMol(context)) {
      this.#syncMolBeginPositions(this.resolveActiveModifiedObjects(context));
    }
    super.umount(context);
  }

  /**
   * 重置工具状态，清除当前手势
   * @returns {void}
   */
  reset() {
    this.isGestureActive = false;
    this.processor.reset();
    super.reset();
  }
}

export { ObjectModifierTool, GestureBasedObjectModifierTool };
