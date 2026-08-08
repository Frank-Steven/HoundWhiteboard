/**
 * @file Engine Board API
 * @description
 * BoardApi 是 Engine 侧的统一领域分发层。
 * 接收 BoardCore 实例，提供对象 CRUD、AOM 操作、查询和命中检测等方法的直接实现。
 * 与 RPC 客户端（bridges/board-api-rpc.js）共享同一契约签名。
 * @module kernel/api/board-api
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { deserialize } from "../objects/object-deserializer.js";
import {
  OPERATION_TYPES,
  OPERATION_EFFECT_KINDS,
  getOperationEffectKind,
  compareRecords,
} from "../hit/operation.js";
import { Matrix, Vector } from "../utils/math.js";
import { intersectsRanges, RectangleRange } from "../range/index.js";
import { ChunkObjectManager } from "../chunk/chunk-object-manager.js";
import { CHUNK_LOAD_EVENTS } from "../chunk/chunk-loader.js";
import { Chunk } from "../chunk/chunk.js";

/**
 * 数据擦除粗筛的范围余量（世界单位）
 * @description 覆盖笔画宽度等对象自身渲染留白；宽度超过该余量的对象可能在粗筛阶段被遗漏。
 * @type {number}
 */
const ERASE_COARSE_MARGIN = 64;

/**
 * 判断对象是否已进入 Worker 侧的区块静态图
 * @param {import("../board/board-core.js").BoardCore} boardCore - BoardCore 实例
 * @param {string} objectId - 对象 id
 * @returns {boolean}
 */
function hasStaticBoardObject(boardCore, objectId) {
  for (const { chunk } of boardCore.chunkLoaded.values()) {
    if (chunk?.objectManager?.staticGraph?.hasNode?.(objectId)) {
      return true;
    }
  }
  return false;
}

/**
 * 计算对象当前的世界坐标包围矩形
 * @param {import("../objects/basic-obj.js").BasicObject} obj - 对象实例
 * @returns {import("../range/index.js").RectangleRange | null} 世界包围矩形
 */
function getObjectWorldRect(obj) {
  if (typeof obj?.getRange !== "function" || !obj.position) return null;
  const range = obj.getRange();
  if (!range || typeof range.withPosition !== "function") return null;
  const positioned = range.withPosition(obj.position);
  return positioned ? RectangleRange.from(positioned) : null;
}

/**
 * Engine 侧 BoardApi
 * @class
 * @description
 * 直连 BoardCore 的领域 API 实现。所有方法同步执行（除 hitTest 因区块加载需要异步），
 * 不依赖 PostMessage 或 Worker 传输。
 * 方法签名与 {@link ../../types/board-api-types.js} 定义的 BoardApi 契约一致。
 * @author Zhou Chenyu
 */
class BoardApi {
  /**
   * BoardCore 实例
   * @type {import("../board/board-core.js").BoardCore}
   */
  #boardCore;

  /**
   * 数据擦除的串行队列
   * @description
   * eraseData 是异步读写：粗筛候选可能挂起等待区块加载，之后才切割与提交。
   * 工具侧按轨迹段 fire-and-forget，若并发执行，后到的调用持有的候选快照
   * 早于前序调用提交的分裂对象，会对新对象漏擦。串行队列保证每条调用的
   * 快照、切割与提交都发生在前一条完成之后。
   * @type {Promise<void>}
   * @private
   */
  #eraseDataQueue = Promise.resolve();

  /**
   * 选择前快照表
   * @description 对象 id -> 选择时刻的 serialize() 快照，作修改对象分子的前快照；对象提交或放弃时移除。
   * @type {Map<string, Object>}
   * @private
   */
  #chooseSnapshots = new Map();

  /**
   * @param {import("../board/board-core.js").BoardCore} boardCore - BoardCore 实例
   */
  constructor(boardCore) {
    this.#boardCore = boardCore;
  }

  /**
   * 解析对象所在区块 id
   * @description 先扫描已加载区块的静态状态图，未命中时按对象位置与画布尺寸推算；区块 id 统一规范为字符串。
   * @param {string} objectId - 对象 id
   * @returns {string} 区块 id；无法解析时为空串
   * @private
   */
  #resolveObjectChunkId(objectId) {
    const boardCore = this.#boardCore;
    for (const { chunk } of boardCore.chunkLoaded.values()) {
      if (chunk?.objectManager?.staticGraph?.hasNode?.(objectId)) {
        return String(chunk.id);
      }
    }
    const obj = boardCore.getObjectById(objectId);
    if (obj?.position && boardCore.width > 0 && boardCore.height > 0) {
      const chunkId = Chunk.worldToChunkId(obj.position, boardCore.width, boardCore.height);
      return chunkId == null ? "" : String(chunkId);
    }
    return "";
  }

  /**
   * 捕获区块的层栈快照（静态状态图的拓扑序，即完整 z-order）
   * @description 已加载区块的 id 未必是字符串，按字符串化后的 id 匹配。
   * @param {string} chunkId - 区块 id（字符串）
   * @returns {string[]} 层栈快照；区块未加载时为空数组
   * @private
   */
  #captureLayerStackSnapshot(chunkId) {
    for (const { chunk } of this.#boardCore.chunkLoaded.values()) {
      if (String(chunk?.id) === chunkId) {
        return chunk?.objectManager?.staticGraph?.topoSort?.() ?? [];
      }
    }
    return [];
  }

  /**
   * 比较前后快照的顶层差异键
   * @param {Object} before - 修改前快照
   * @param {Object} after - 修改后快照
   * @returns {string[]} 涉及属性的集合
   * @private
   */
  #diffProperties(before, after) {
    return ["position", "transform", "property", "data"].filter(
      (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
    );
  }

  /**
   * 在 Engine 侧创建对象实例，注册到 AOM 动态图
   * @param {string} type - 对象类型名
   * @param {import("../types/board-api-types.js").CreateObjectProps} props - 创建属性
   * @returns {string} 新对象的 objectId
   */
  createObject(type, props) {
    const boardCore = this.#boardCore;
    const objectId = props?.id;
    if (objectId == null) {
      throw new Error("createObject requires an explicit object id.");
    }
    const existingObject = boardCore.getObjectById(objectId);
    if (existingObject) {
      throw new Error(
        `Duplicate object id ${objectId}: an object with this id already exists.`,
      );
    }

    const obj = deserialize({
      type,
      id: objectId,
      position: props?.position ?? { x: 0, y: 0 },
      transform: props?.transform ?? { a: 1, b: 0, c: 0, d: 1 },
      property: { ...(props?.property ?? {}) },
      data: { ...(props?.data ?? {}) },
    });

    boardCore.registerObjectInstance(obj);
    boardCore.activeObjectManager.add(new Set([obj]));

    return objectId;
  }

  /**
   * 断言对象为活动对象
   * @description 非活动对象不允许更改：想更改一个对象，它必须先经选择进入动态图。
   * @param {string} objectId - 对象 id
   * @returns {import("../objects/basic-obj.js").BasicObject} 对象实例
   * @private
   */
  #requireActiveObject(objectId) {
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    if (!obj) {
      throw new Error(`Object ${objectId} not found.`);
    }
    if (!boardCore.activeObjectManager?.isActive?.(objectId)) {
      throw new Error(`对象 ${objectId} 不是活动对象：更改前须先选择（进入动态图）`);
    }
    return obj;
  }

  /**
   * 把 patch 应用到对象实例
   * @description 内核复合操作通道：不做活动对象准入，供擦除回写等切割效果的原子表达使用。
   * @param {import("../objects/basic-obj.js").BasicObject} obj - 对象实例
   * @param {import("../types/board-api-types.js").ObjectPatch} patch - 修改 patch
   * @returns {void}
   * @private
   */
  #applyObjectPatch(obj, patch) {
    const boardCore = this.#boardCore;
    if (patch.position != null) {
      obj.position = new Vector(patch.position.x, patch.position.y);
    }
    if (patch.transform != null) {
      const { a, b, c, d } = patch.transform;
      obj.setTransform(new Matrix(a, b, c, d));
    }
    if (patch.property != null) {
      obj.setProperty(patch.property);
    }
    if (patch.data != null) {
      obj.setData(patch.data);
    }
    boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
  }

  /**
   * 修改单个对象的几何/样式属性
   * @description 仅活动对象可更改：对象须先经选择进入动态图。
   * @param {string} objectId - 对象 id
   * @param {import("../types/board-api-types.js").ObjectPatch} patch - 修改 patch
   * @returns {void}
   */
  modifyObject(objectId, patch) {
    this.#applyObjectPatch(this.#requireActiveObject(objectId), patch);
  }

  /**
   * 批量修改多个对象
   * @description 仅活动对象可更改：对象须先经选择进入动态图。
   * @param {import("../types/board-api-types.js").ObjectPatchEntry[]} patches - 批量 patch
   * @returns {void}
   */
  modifyObjects(patches) {
    const items = Array.isArray(patches) ? patches : [];
    for (const { objectId, patch } of items) {
      if (objectId == null || !patch) continue;
      this.#applyObjectPatch(this.#requireActiveObject(objectId), patch);
    }
  }

  /**
   * 向对象的列表属性追加元素
   * @param {string} objectId - 对象 id
   * @param {string} key - 列表属性名
   * @param {any[]} items - 追加的元素集合
   * @returns {void}
   */
  appendListItem(objectId, key, items) {
    const obj = this.#requireActiveObject(objectId);
    obj.appendListItem(key, ...(items ?? []));
    this.#boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
  }

  /**
   * 替换对象列表属性中指定索引的元素
   * @param {string} objectId - 对象 id
   * @param {string} key - 列表属性名
   * @param {number} index - 目标索引
   * @param {any} item - 新元素
   * @returns {void}
   */
  replaceListItem(objectId, key, index, item) {
    const obj = this.#requireActiveObject(objectId);
    obj.replaceListItem(key, index, item);
    this.#boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
  }

  /**
   * 删除对象列表属性中指定索引的元素
   * @param {string} objectId - 对象 id
   * @param {string} key - 列表属性名
   * @param {number} index - 目标索引
   * @returns {void}
   */
  removeListItem(objectId, key, index) {
    const obj = this.#requireActiveObject(objectId);
    obj.removeListItem(key, index);
    this.#boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
  }

  /**
   * 永久删除对象集合
   * @description 删除静态对象即删除对象分子操作；指定 supraKey 时进入该超分子，否则同一次删除自成一个超分子。
   * @param {string[]} objectIds - 要删除的对象 id 列表
   * @param {Object} [options] - 删除选项
   * @param {string} [options.supraKey] - 指定进入的超分子 key
   * @returns {void}
   */
  deleteObjects(objectIds, options = {}) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const aom = boardCore.activeObjectManager;
    const activeToDiscard = [];
    const affectedChunks = new Set();
    const chunkIds = new Map(
      ids.map((objectId) => [objectId, this.#resolveObjectChunkId(objectId)]),
    );

    for (const objectId of ids) {
      const obj = boardCore.getObjectById(objectId);
      if (!obj) continue;
      // 远程活动对象被持有方锁定，本地不可删除
      if (boardCore.activeObjectManager?.isRemoteActive?.(objectId)) continue;

      if (aom?.isActive?.(objectId)) {
        activeToDiscard.push(obj);
      }

      const trashChunks = [];
      for (const { chunk } of boardCore.chunkLoaded.values()) {
        const graph = chunk?.objectManager?.staticGraph;
        if (!graph?.hasNode?.(objectId)) continue;
        trashChunks.push({
          chunkId: String(chunk.id),
          below: new Set(graph.predecessors(objectId)),
          above: new Set(graph.neighbors(objectId)),
        });
        chunk.removeObject(objectId);
        affectedChunks.add(chunk);
      }
      boardCore.trash.set(objectId, { data: obj.serialize(), chunks: trashChunks });

      boardCore.objectLoaded.delete(objectId);
      this.#chooseSnapshots.delete(objectId);
    }

    if (activeToDiscard.length > 0) {
      aom.discard(new Set(activeToDiscard));
    }

    const committer = boardCore.hitCommitter;
    const internalKey =
      options.supraKey === undefined ? this.#beginInternalSupra() : null;
    const supraKey = options.supraKey ?? internalKey;
    try {
      for (const objectId of ids) {
        const chunkId = chunkIds.get(objectId);
        if (chunkId) {
          committer.commitDelete({ chunkId, objectId, supraKey });
        }
      }
    } finally {
      if (internalKey !== null) {
        committer.endSupra(internalKey);
      }
    }

    if (
      affectedChunks.size > 0 &&
      boardCore.aomRenderHooks?.requestStaticRender
    ) {
      boardCore.aomRenderHooks.requestStaticRender([...affectedChunks]);
    }
  }

  /**
   * 捕获对象的层级关系快照
   * @description 覆盖各区块静态状态图的出边集与入边集，以及 AOM 层归属（层静态图或层动态集合）。
   * @param {string} objectId - 对象 id
   * @returns {Object} 层级关系快照
   * @private
   */
  #captureZRelations(objectId) {
    const boardCore = this.#boardCore;
    const chunks = [];
    for (const { chunk } of boardCore.chunkLoaded.values()) {
      const graph = chunk?.objectManager?.staticGraph;
      if (!graph?.hasNode?.(objectId)) continue;
      chunks.push({
        chunk,
        graph,
        out: new Set(graph.neighbors(objectId)),
        in: new Set(graph.predecessors(objectId)),
      });
    }
    let layerMembership = null;
    const layer = boardCore.activeObjectManager?.onLayer?.get(objectId);
    if (layer?.activeObjects?.has(objectId)) {
      layerMembership = { layer, kind: "active" };
    } else if (layer?.inactiveGraph?.hasNode?.(objectId)) {
      layerMembership = {
        layer,
        kind: "inactive",
        out: new Set(layer.inactiveGraph.neighbors(objectId)),
        in: new Set(layer.inactiveGraph.predecessors(objectId)),
      };
    }
    return { chunks, layerMembership };
  }

  /**
   * 擦除分裂后重建层级关系
   * @description 按橡皮文档「分裂段的层级关系重建」执行：静态状态图对快照邻居集增量 re-hit-test
   * （分裂段继承有效边、原对象删失交边），层归属由 #inheritLayerMembership 继承。
   * @param {string} originId - 被擦除对象 id（首段回写后与原对象同一 id）
   * @param {string[]} splitIds - 分裂段 id 列表
   * @param {Object} zSnapshot - #captureZRelations 的层级关系快照
   * @returns {Set<Object>} 发生边变更的区块集合
   * @private
   */
  #rebuildZRelationsAfterSplit(originId, splitIds, zSnapshot) {
    const boardCore = this.#boardCore;
    const correctedChunks = new Set();
    // 世界包围矩形
    const rectOf = (id) => getObjectWorldRect(boardCore.getObjectById(id));
    for (const { chunk, graph, out, in: incoming } of zSnapshot.chunks) {
      let dirty = false;
      // apply 为分裂段默认写入的「置顶」边先清空
      for (const splitId of splitIds) {
        if (graph.hasNode(splitId)) {
          graph.deleteAllEdgesOfNode(splitId);
          dirty = true;
        }
      }
      for (const neighborId of new Set([...out, ...incoming])) {
        if (!graph.hasNode(neighborId)) continue;
        const neighborRect = rectOf(neighborId);
        if (!neighborRect) continue;
        // 原对象（首段回写）失交删边
        if (graph.hasNode(originId)) {
          const originRect = rectOf(originId);
          if (originRect && !intersectsRanges(originRect, neighborRect)) {
            if (graph.hasEdge(originId, neighborId)) {
              graph.deleteEdge(originId, neighborId);
              dirty = true;
            }
            if (graph.hasEdge(neighborId, originId)) {
              graph.deleteEdge(neighborId, originId);
              dirty = true;
            }
          }
        }
        // 分裂段按相交继承原边方向
        for (const splitId of splitIds) {
          if (!graph.hasNode(splitId)) continue;
          const splitRect = rectOf(splitId);
          if (!splitRect || !intersectsRanges(splitRect, neighborRect)) continue;
          if (out.has(neighborId) && !graph.hasEdge(splitId, neighborId)) {
            graph.addEdge(splitId, neighborId);
            dirty = true;
          }
          if (incoming.has(neighborId) && !graph.hasEdge(neighborId, splitId)) {
            graph.addEdge(neighborId, splitId);
            dirty = true;
          }
        }
      }
      if (dirty) {
        correctedChunks.add(chunk);
      }
    }
    this.#inheritLayerMembership(splitIds, zSnapshot.layerMembership);
    return correctedChunks;
  }

  /**
   * 分裂段继承原对象的层归属
   * @description 层静态图整体复制出边与入边（层位继承），层动态集合直接加入；
   * 分裂段先离开出生时注册的顶层。
   * @param {string[]} splitIds - 分裂段 id 列表
   * @param {?Object} layerMembership - #captureZRelations 捕获的层归属
   * @returns {void}
   * @private
   */
  #inheritLayerMembership(splitIds, layerMembership) {
    if (!layerMembership || splitIds.length === 0) return;
    const aom = this.#boardCore.activeObjectManager;
    const { layer, kind } = layerMembership;
    for (const splitId of splitIds) {
      aom.removeObjectFromLayer(splitId);
      if (kind === "inactive") {
        aom.unregisterTrackedActiveObject(splitId);
        const graph = layer.inactiveGraph;
        if (!graph.hasNode(splitId)) {
          graph.addNode(splitId);
        }
        for (const neighborId of layerMembership.out) {
          if (graph.hasNode(neighborId) && !graph.hasEdge(splitId, neighborId)) {
            graph.addEdge(splitId, neighborId);
          }
        }
        for (const neighborId of layerMembership.in) {
          if (graph.hasNode(neighborId) && !graph.hasEdge(neighborId, splitId)) {
            graph.addEdge(neighborId, splitId);
          }
        }
      } else {
        layer.activeObjects.add(splitId);
      }
      aom.onLayer.set(splitId, layer);
    }
    aom.requestActiveRender(
      splitIds.map((id) => this.#boardCore.getObjectById(id)).filter(Boolean),
    );
  }

  /**
   * 按橡皮轨迹擦除命中对象的数据
   * @description
   * 数据擦除的 Core 侧统一入口。调用进入串行队列依次执行，返回的 Promise
   * 在本次调用（含队列等待）完成后兑现。
   * @param {{ points: Array<{x: number, y: number}>, radius: number, source?: string }} payload - 轨迹段（世界坐标）、橡皮半径与来源标识
   * @param {Object} [options] - 擦除选项
   * @param {string} [options.supraKey] - 指定进入的超分子 key（缺省本次调用自成一个超分子）
   * @returns {Promise<{ modified: string[], created: string[], deleted: string[] }>} 受影响对象 id 三组
   */
  eraseData(payload, options = {}) {
    const run = this.#eraseDataQueue.then(() => this.#performEraseData(payload, options.supraKey));
    this.#eraseDataQueue = run.catch(() => { });
    return run;
  }

  /**
   * 执行单次数据擦除
   * @description
   * 粗筛命中 → 过滤 → 逐对象 eraseData 精确切割，
   * 按剩余点段分流（整笔删除 / 首段回写 / 其余段分裂新建并提交静态图）。
   * 分裂对象的 id 从 Core 侧分配器表按来源取用。
   *
   * 过滤规则：仅处理 isErasable() 为 true 且不是活动对象的对象——
   * 已被选中的对象不能被擦除，与选择逻辑的互斥一致；
   * 非活动层成员（被 pickup 一并纳入 AOM）与静态对象均可擦除。
   * @param {{ points: Array<{x: number, y: number}>, radius: number, source?: string }} payload - 轨迹段（世界坐标）、橡皮半径与来源标识
   * @returns {Promise<{ modified: string[], created: string[], deleted: string[] }>} 受影响对象 id 三组
   * @private
   */
  async #performEraseData(payload, supraKey) {
    // 一次 FD 擦除 = 修改对象（回写首段）+ 增加对象（分裂段）+ 删除对象（整笔擦没）的有序组合
    const internalKey = supraKey === undefined ? this.#beginInternalSupra() : null;
    try {
      return await this.#performEraseDataInner(payload, supraKey ?? internalKey);
    } finally {
      if (internalKey !== null) {
        this.#boardCore.hitCommitter.endSupra(internalKey);
      }
    }
  }

  /**
   * 单次数据擦除的内部实现
   * @param {{ points: Array<{x: number, y: number}>, radius: number, source?: string }} payload - 轨迹段（世界坐标）、橡皮半径与来源标识
   * @param {string} supraKey - 内部超分子 key
   * @returns {Promise<{ modified: string[], created: string[], deleted: string[] }>} 受影响对象 id 三组
   * @private
   */
  async #performEraseDataInner(payload, supraKey) {
    const boardCore = this.#boardCore;
    const points = Array.isArray(payload?.points) ? payload.points : [];
    const radius = Number.isFinite(payload?.radius) ? payload.radius : 0;
    const source = typeof payload?.source === "string" ? payload.source : "";

    const result = { modified: [], created: [], deleted: [] };
    if (points.length === 0 || radius <= 0) {
      return result;
    }

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const margin = radius + ERASE_COARSE_MARGIN;
    const minX = Math.min(...xs) - margin;
    const minY = Math.min(...ys) - margin;
    const maxX = Math.max(...xs) + margin;
    const maxY = Math.max(...ys) + margin;
    const queryRange = new RectangleRange(
      minX,
      minY,
      maxX - minX,
      maxY - minY,
    );

    const candidateIds = await this.#collectHitObjects(boardCore, queryRange);

    const modifiedStaticObjects = [];
    const previousWorldRects = new Map();
    const splitRebuilds = [];
    for (const objectId of candidateIds) {
      const obj = boardCore.getObjectById(objectId);
      if (!obj) continue;
      if (typeof obj.isErasable !== "function" || !obj.isErasable()) continue;
      if (typeof obj.eraseData !== "function") continue;
      // 已被选中的对象（本地或远程活动对象）不能被擦除
      if (
        boardCore.activeObjectManager?.isActive?.(objectId) ||
        boardCore.activeObjectManager?.isRemoteActive?.(objectId)
      ) {
        continue;
      }

      const runs = obj.eraseData(points, radius);
      if (runs == null) continue;

      if (runs.length === 0) {
        result.deleted.push(objectId);
        continue;
      }

      const zSnapshot = this.#captureZRelations(objectId);

      // 切割前快照旧世界范围：输出层按脏区增量更新，
      // 被擦区域与回缩残端的旧像素要靠旧范围失效才能清理
      const previousWorldRect = getObjectWorldRect(obj);
      if (previousWorldRect) {
        previousWorldRects.set(objectId, previousWorldRect);
      }

      const beforeErase = obj.serialize();
      // 内核复合操作通道：擦除回写是切割效果的原子表达，非用户更改，不经活动对象准入
      this.#applyObjectPatch(obj, { data: { points: runs[0] } });
      const erasedChunkId = this.#resolveObjectChunkId(objectId);
      boardCore.hitCommitter.commitModify({
        chunkId: erasedChunkId,
        objectId,
        properties: ["data"],
        before: beforeErase,
        after: obj.serialize(),
        layerStackSnapshot: this.#captureLayerStackSnapshot(erasedChunkId),
        supraKey,
      });
      result.modified.push(objectId);
      modifiedStaticObjects.push(obj);

      if (runs.length > 1) {
        const serialized = obj.serialize();
        const splitIds = [];
        for (let i = 1; i < runs.length; i++) {
          const newObjectId = boardCore.allocateObjectId(source);
          this.createObject(serialized.type, {
            id: newObjectId,
            position: serialized.position,
            transform: serialized.transform,
            property: serialized.property,
            data: { ...serialized.data, points: runs[i] },
          });
          splitIds.push(newObjectId);
          result.created.push(newObjectId);
        }
        splitRebuilds.push({ originId: objectId, splitIds, zSnapshot });
      } else {
        splitRebuilds.push({ originId: objectId, splitIds: [], zSnapshot });
      }
    }

    if (result.deleted.length > 0) {
      this.deleteObjects(result.deleted, { supraKey });
    }
    if (result.created.length > 0) {
      await this.commitObjects(result.created, { supraKey });
    }

    const correctedChunks = new Set();
    for (const { originId, splitIds, zSnapshot } of splitRebuilds) {
      for (const chunk of this.#rebuildZRelationsAfterSplit(originId, splitIds, zSnapshot)) {
        correctedChunks.add(chunk);
      }
    }
    if (correctedChunks.size > 0) {
      boardCore.aomRenderHooks?.requestStaticRender?.([...correctedChunks]);
    }
    if (modifiedStaticObjects.length > 0) {
      boardCore.aomRenderHooks?.requestStaticRenderForObjects?.(
        modifiedStaticObjects,
        [],
        previousWorldRects,
      );
    }

    return result;
  }

  /**
   * 将 AOM 动态图中的对象写回静态图
   * @description commit 边界：首次进入静态图的对象凝聚为增加对象分子，被选择过的静态对象凝聚为
   * 修改对象分子（前快照取自选择时刻）并配对取消选择分子；指定 supraKey 时进入该超分子，否则同一次提交自成一个超分子。
   * @param {string[]} objectIds - 要提交的对象 id 列表
   * @param {Object} [options] - 提交选项
   * @param {string} [options.supraKey] - 指定进入的超分子 key
   * @returns {Promise<string[]>} 实际提交的对象 id（缺失的 id 被跳过，供调用方对账）
   */
  async commitObjects(objectIds, options = {}) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const objects = ids
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean);
    if (objects.length === 0) {
      return [];
    }
    const wasStatic = new Map(
      objects.map((obj) => [obj.id, hasStaticBoardObject(boardCore, obj.id)]),
    );
    const committable = objects.filter((obj) => {
      if (!wasStatic.get(obj.id)) return true;
      if (this.#chooseSnapshots.has(obj.id)) return true;
      if (boardCore.activeObjectManager.has(obj.id)) {
        throw new Error(`对象 ${obj.id} 缺选择前快照`);
      }
      // 已提交过的对象（不在选择中的静态对象）重复提交是幂等空操作
      return false;
    });
    if (committable.length === 0) {
      return objects.map((obj) => obj.id);
    }
    await boardCore.activeObjectManager.apply(new Set(committable));

    const committer = boardCore.hitCommitter;
    const internalKey =
      options.supraKey === undefined ? this.#beginInternalSupra() : null;
    const supraKey = options.supraKey ?? internalKey;
    try {
      for (const obj of committable) {
        const chunkId = this.#resolveObjectChunkId(obj.id);
        const after = obj.serialize();
        const layerStackSnapshot = this.#captureLayerStackSnapshot(chunkId);
        if (wasStatic.get(obj.id)) {
          const before = this.#chooseSnapshots.get(obj.id);
          if (before === undefined) {
            throw new Error(`对象 ${obj.id} 缺选择前快照`);
          }
          const properties = this.#diffProperties(before, after);
          // 无实际差异时不产生修改分子；层位调整（置顶/置底等）不经 serialize 差异表达，落地时需另行保证不被跳过
          if (properties.length > 0) {
            committer.commitModify({
              chunkId,
              objectId: obj.id,
              properties,
              before,
              after,
              layerStackSnapshot,
              supraKey,
            });
          }
          committer.commitUnchoose({ chunkId, objectId: obj.id, supraKey });
          this.#chooseSnapshots.delete(obj.id);
        } else {
          committer.commitAdd({
            chunkId,
            objectId: obj.id,
            data: after,
            layerStackSnapshot,
            supraKey,
          });
        }
      }
    } finally {
      if (internalKey !== null) {
        committer.endSupra(internalKey);
      }
    }
    this.#emitActivity(
      "commit",
      committable.map((obj) => obj.id),
    );
    return objects.map((obj) => obj.id);
  }

  /**
   * 将对象加入 AOM 动态图
   * @description 静态对象进入 AOM 即选择对象分子操作：捕获选择前快照（修改分子的前快照）并提交记录。
   * 返回的 Promise 在 pickup 完成（对象成为活动对象）后兑现。
   * @param {string[]} objectIds - 对象 id 列表
   * @param {Object} [options] - 选择选项
   * @param {string} [options.supraKey] - 指定进入的超分子 key
   * @returns {Promise<void>}
   */
  async addActiveObjects(objectIds, options = {}) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const objects = ids
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean)
      // 远程活动对象被持有方锁定，本地不可选择
      .filter((obj) => !boardCore.activeObjectManager.isRemoteActive(obj.id));
    if (objects.length === 0) {
      return;
    }
    const committer = boardCore.hitCommitter;
    const internalKey =
      options.supraKey === undefined ? this.#beginInternalSupra() : null;
    const supraKey = options.supraKey ?? internalKey;
    try {
      for (const obj of objects) {
        if (!hasStaticBoardObject(boardCore, obj.id)) continue;
        // 已在选择中的对象不重复记录，前快照保留首次选择时刻的状态
        if (this.#chooseSnapshots.has(obj.id)) continue;
        this.#chooseSnapshots.set(obj.id, obj.serialize());
        committer.commitChoose({
          chunkId: this.#resolveObjectChunkId(obj.id),
          objectId: obj.id,
          supraKey,
        });
      }
      await boardCore.activeObjectManager.choose(new Set(objects));
    } finally {
      if (internalKey !== null) {
        committer.endSupra(internalKey);
      }
    }
    this.#emitActivity(
      "choose",
      objects.map((obj) => obj.id),
    );
  }

  /**
   * 将对象从 AOM 动态图移除
   * @description 静态对象被放弃更改即取消选择分子操作；生于 AOM 的暂存对象不产生记录。
   * @param {string[]} objectIds - 对象 id 列表
   * @param {Object} [options] - 选项
   * @param {string} [options.supraKey] - 指定进入的超分子 key
   * @returns {void}
   */
  discardActiveObjects(objectIds, options = {}) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const objects = ids
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean);

    const transientObjectIds = objects.filter(
      (obj) => !hasStaticBoardObject(boardCore, obj.id),
    );

    boardCore.activeObjectManager.discard(new Set(objects));

    const committer = boardCore.hitCommitter;
    const internalKey =
      options.supraKey === undefined ? this.#beginInternalSupra() : null;
    const supraKey = options.supraKey ?? internalKey;
    try {
      for (const obj of objects) {
        // 放弃更改仅在对象确经选择时产生取消选择分子
        if (this.#chooseSnapshots.has(obj.id)) {
          committer.commitUnchoose({
            chunkId: this.#resolveObjectChunkId(obj.id),
            objectId: obj.id,
            supraKey,
          });
          this.#chooseSnapshots.delete(obj.id);
        }
      }
    } finally {
      if (internalKey !== null) {
        committer.endSupra(internalKey);
      }
    }

    for (const objectId of transientObjectIds) {
      boardCore.objectLoaded.delete(objectId);
    }
    this.#emitActivity(
      "unchoose",
      objects.map((obj) => obj.id),
    );
  }

  /**
   * 发射本地 AOM 活动事件（ephemeral）
   * @param {"choose"|"unchoose"|"commit"} kind - 事件种类
   * @param {string[]} ids - 对象 id 列表
   * @returns {void}
   * @private
   *
   * @description
   * 手势内 choose 在超分子闭合前不入日志，互斥与实时可见依赖本即时通道；日志仍是权威路径。
   */
  #emitActivity(kind, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    this.#boardCore.activityEventBus?.emit("activity", {
      kind,
      ids: [...ids],
      source: this.#boardCore.hitCommitter.source,
      time: Date.now(),
    });
  }

  /**
   * 应用远程 AOM 活动事件（ephemeral 通道入口）
   * @param {Object|Object[]} events - 远程活动事件（{kind, ids}）
   * @param {string} source - 持有方来源标识
   * @returns {void}
   */
  applyRemoteActivity(events, source) {
    if (typeof source !== "string" || source === "") return;
    const boardCore = this.#boardCore;
    const aom = boardCore.activeObjectManager;
    const list = Array.isArray(events) ? events : [events];
    const changedIds = new Set();
    for (const event of list) {
      const ids = Array.isArray(event?.ids) ? event.ids : [];
      if (ids.length === 0) continue;
      if (event.kind === "choose") {
        aom.applyRemoteChoose(ids, source);
      } else if (event.kind === "unchoose" || event.kind === "commit") {
        aom.applyRemoteUnchoose(ids, source);
      }
      for (const id of ids) changedIds.add(id);
    }
    const instances = [...changedIds]
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean);
    if (instances.length > 0) {
      aom.requestActiveRender(instances);
    }
  }

  /**
   * 清理某来源的全部远程活动登记（断线清理入口）
   * @param {string} source - 来源标识
   * @returns {string[]} 被清理的对象 id 列表
   */
  clearRemoteActivity(source) {
    const removed = this.#boardCore.activeObjectManager.clearRemoteActive(source);
    const instances = removed
      .map((id) => this.#boardCore.getObjectById(id))
      .filter(Boolean);
    if (instances.length > 0) {
      this.#boardCore.activeObjectManager.requestActiveRender(instances);
    }
    return removed;
  }

  /**
   * 上报 UI 侧对象 id 池计数
   * @param {string} source - 来源标识
   * @param {number} counter - 已分配的最大计数
   * @returns {boolean} 是否接受（单调取大，回拨不报）
   *
   * @description
   * UI 侧对象 id 池的计数随板元数据持久化，重开板后续种防碰撞。
   */
  reportObjectIdCounter(source, counter) {
    return this.#boardCore.reportObjectIdCounter(source, counter);
  }

  /**
   * 读取 UI 侧对象 id 池计数表
   * @returns {Object<string, number>} 各来源已分配的最大计数
   */
  getObjectIdCounters() {
    return this.#boardCore.getObjectIdCounters();
  }

  /**
   * 按 id 查询对象摘要
   * @param {string[]} ids - 对象 id 列表
   * @returns {import("../types/types.js").ObjectSummary[]} 对象摘要列表
   */
  queryObjects(ids) {
    const boardCore = this.#boardCore;
    const idList = Array.isArray(ids) ? ids : [];
    const aom = boardCore.activeObjectManager;

    return idList
      .map((objectId) => {
        const obj = boardCore.getObjectById(objectId);
        if (!obj) return null;
        const isActive = aom?.isActive?.(objectId) ?? false;
        return {
          id: obj.id,
          type: obj.constructor.name,
          isActive,
          position: { x: obj.position.x, y: obj.position.y },
          transform: obj.transform
            ? {
              a: obj.transform.a,
              b: obj.transform.b,
              c: obj.transform.c,
              d: obj.transform.d,
            }
            : undefined,
          boundingBox: obj.rich?.boundingBox,
          range: obj.getRange(),
          property: { ...(obj.property ?? {}) },
          data: { ...(obj.data ?? {}) },
        };
      })
      .filter(Boolean);
  }

  /**
   * 按区块查询对象 id
   * @param {number[]} chunkIds - 区块 id 列表
   * @returns {string[]} 对象 id 列表
   */
  queryChunkObjects(chunkIds) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(chunkIds) ? chunkIds : [];
    const seen = new Set();

    for (const chunkId of ids) {
      const chunk = boardCore.getChunkById(chunkId);
      if (!chunk?.objectManager?.staticGraph) continue;
      for (const objectId of chunk.objectManager.staticGraph.getNodes()) {
        seen.add(objectId);
      }
    }

    return [...seen];
  }

  /**
   * 在合并视图上执行命中查询
   * @param {import("../range/range.js").Range | import("../types/types.js").Rect} range - 命中范围
   * @param {string} [mode] - 命中模式
   * @returns {Promise<string[]>} 命中的 objectId 列表
   */
  async hitTest(range, mode) {
    const boardCore = this.#boardCore;

    let queryRange;
    if (range instanceof RectangleRange) {
      queryRange = range;
    } else if (typeof range?.left === "number") {
      queryRange = RectangleRange.fromRectLike(range);
    } else {
      queryRange = range;
    }
    if (!queryRange) return [];

    return this.#collectHitObjects(boardCore, queryRange);
  }

  /**
   * 收集与查询范围相交的对象 id
   * @description
   * 若查询范围覆盖未加载或仅临时加载的区块，会先 FullLoad 使对象实例就绪，
   * 执行命中检测后销毁 loader 释放引用。
   * @param {import("../board/board-core.js").BoardCore} boardCore - BoardCore 实例
   * @param {RectangleRange} queryRange - 查询范围
   * @returns {Promise<string[]>} 命中的对象 id 列表
   * @private
   */
  async #collectHitObjects(boardCore, queryRange) {
    if (
      boardCore.width > 0 &&
      boardCore.height > 0 &&
      typeof queryRange.left === "number"
    ) {
      const chunkIds = ChunkObjectManager.calculateCoveredChunkIdsForRange(
        queryRange,
        boardCore.width,
        boardCore.height,
      );
      const chunksToLoad = [...chunkIds]
        .map((id) => boardCore.getChunkById(id))
        .filter((chunk) => chunk && (chunk.isTempLoad || !chunk.isLoad));

      if (chunksToLoad.length > 0) {
        const loader = boardCore.createChunkLoader(
          `hit-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        );
        for (const chunk of chunksToLoad) {
          loader.trackChunk(chunk);
          loader.emitLoadRequest(chunk, { strategy: "full" });
          await new Promise((resolve) => {
            const handler = (payload) => {
              if (payload.chunkId === chunk.id) {
                boardCore.chunkLoadEventBus.off(
                  CHUNK_LOAD_EVENTS.LOAD_COMPLETE,
                  handler,
                );
                resolve();
              }
            };
            boardCore.chunkLoadEventBus.on(
              CHUNK_LOAD_EVENTS.LOAD_COMPLETE,
              handler,
            );
          });
        }

        const hits = this.#runHitTest(boardCore, queryRange, chunkIds);
        loader.destroy(300);
        return hits;
      }

      return this.#runHitTest(boardCore, queryRange, chunkIds);
    }

    return this.#runHitTest(boardCore, queryRange);
  }

  /**
   * 在当前已加载对象中执行命中检测
   * @param {import("../board/board-core.js").BoardCore} boardCore - BoardCore 实例
   * @param {RectangleRange} queryRange - 查询范围
   * @param {Set<number>} [chunkIds] - 查询范围覆盖的区块 id 集合，用于粗筛
   * @returns {string[]}
   * @private
   */
  #runHitTest(boardCore, queryRange, chunkIds) {
    const hits = [];

    for (const [objectId] of boardCore.objectLoaded) {
      const obj = boardCore.getObjectById(objectId);
      if (!obj) continue;

      if (chunkIds) {
        const coverChunks = boardCore.getObjectCoverChunks(objectId);
        if (coverChunks && !this.#chunkSetsOverlap(coverChunks, chunkIds)) {
          continue;
        }
      }

      const worldRange = obj.getRange()?.withPosition?.(obj.position);
      if (!worldRange) continue;

      if (intersectsRanges(worldRange, queryRange)) {
        hits.push(objectId);
      }
    }

    return hits;
  }

  /**
   * 判断两个区块 id 集合是否有交集
   * @param {Set<number>} a - 集合 a
   * @param {Set<number>} b - 集合 b
   * @returns {boolean}
   * @private
   */
  #chunkSetsOverlap(a, b) {
    const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
    for (const id of smaller) {
      if (larger.has(id)) return true;
    }
    return false;
  }

  /**
   * 开启一个超分子
   * @description 开启期间指定该 key 的增加节点类提交缓冲为草稿，endSupra(key) 时简并定稿、
   * 整体入日志并凝聚为单节点。未指定 key 的提交永远独立成录。谁开启谁关闭。
   * @param {string} key - 超分子 key（调用方提供的会话标识，可跨通道序列化）
   * @returns {void}
   */
  beginSupra(key) {
    this.#boardCore.hitCommitter.beginSupra(key);
  }

  /**
   * 闭合一个超分子（简并定稿、物化节点）
   * @param {string} key - 超分子 key
   * @returns {void}
   */
  endSupra(key) {
    this.#boardCore.hitCommitter.endSupra(key);
  }

  /**
   * 中止一个超分子（丢弃全部缓冲草稿）
   * @param {string} key - 超分子 key
   * @returns {void}
   */
  abortSupra(key) {
    this.#boardCore.hitCommitter.abortSupra(key);
  }

  /**
   * 内部匿名超分子序号
   * @type {number}
   * @private
   */
  #internalSupraSeq = 0;

  /**
   * 开启一个内部匿名超分子并返回其 key
   * @description 单次复合调用（提交/删除/擦除等）的内部成组用，调用方在 finally 中闭合。
   * @returns {string} 内部超分子 key
   * @private
   */
  #beginInternalSupra() {
    this.#internalSupraSeq += 1;
    const key = `__board/${this.#internalSupraSeq}`;
    this.#boardCore.hitCommitter.beginSupra(key);
    return key;
  }

  /**
   * 执行撤销
   * @description
   * 缺省以活动链末端为目标：记录撤销并应用树（退化/分叉改挂/被吸收在应用时确定），再经链过渡对齐白板效果。
   * @returns {{ undone: boolean, targetNodeId: ?string }} 撤销结果
   */
  undo() {
    const boardCore = this.#boardCore;
    const tree = boardCore.undoTree;
    if (tree.head === tree.root) {
      return { undone: false, targetNodeId: null };
    }
    const targetId = tree.head.shareId;
    const beforeChain = tree.getActiveChain();
    boardCore.hitCommitter.commitUndo({ targetNodeId: targetId });
    this.#transitionEffects(beforeChain, tree.getActiveChain());
    return { undone: true, targetNodeId: targetId };
  }

  /**
   * 活动链状态过渡：分叉点逆放旧链尾段、正放新链尾段
   * @param {import("../hit/undo-tree-core.js").MolecularNode[]} beforeChain - 过渡前活动链
   * @param {import("../hit/undo-tree-core.js").MolecularNode[]} afterChain - 过渡后活动链
   * @returns {boolean} 活动链是否发生变化
   * @private
   */
  #transitionEffects(beforeChain, afterChain) {
    let diverge = 0;
    while (
      diverge < beforeChain.length &&
      diverge < afterChain.length &&
      beforeChain[diverge].shareId === afterChain[diverge].shareId
    ) {
      diverge++;
    }
    const affectedChunks = new Set();
    for (let i = beforeChain.length - 1; i >= diverge; i--) {
      const records = this.#recordsOfNode(beforeChain[i]);
      for (let j = records.length - 1; j >= 0; j--) {
        this.#revertOpEffect(records[j], affectedChunks);
      }
    }
    for (let i = diverge; i < afterChain.length; i++) {
      for (const record of this.#recordsOfNode(afterChain[i])) {
        this.#applyOpEffect(record, affectedChunks);
      }
    }
    if (affectedChunks.size > 0) {
      this.#boardCore.aomRenderHooks?.requestStaticRender?.([...affectedChunks]);
    }
    return diverge !== beforeChain.length || diverge !== afterChain.length;
  }

  /**
   * 应用一条分子操作的白板效果（重放）
   * @param {import("../hit/operation.js").OperationRecord} record - 分子操作记录
   * @returns {void}
   * @private
   */
  #applyOpEffect(record, affectedChunks) {
    const boardCore = this.#boardCore;
    const { type, payload } = record;
    switch (type) {
      case OPERATION_TYPES.ADD_OBJECT:
        this.#addObjectEffect(payload, affectedChunks);
        break;
      case OPERATION_TYPES.MODIFY_OBJECT: {
        const obj = boardCore.getObjectById(payload.objectId);
        if (obj) {
          this.#collectObjectChunks(obj, affectedChunks);
          this.#applyObjectPatch(obj, payload.after);
          this.#collectObjectChunks(obj, affectedChunks);
        }
        break;
      }
      case OPERATION_TYPES.DELETE_OBJECT:
        this.#removeObjectEffect(payload.objectId, affectedChunks);
        break;
      case OPERATION_TYPES.CHOOSE_OBJECT:
        this.#enterAomEffect(payload.objectId, affectedChunks, record.source);
        break;
      case OPERATION_TYPES.UNCHOOSE_OBJECT:
        this.#leaveAomEffect(payload.objectId, affectedChunks, record.source);
        break;
      default:
        break;
    }
  }

  /**
   * 回退一条分子操作的白板效果（逆放）
   * @param {import("../hit/operation.js").OperationRecord} record - 分子操作记录
   * @returns {void}
   * @private
   */
  #revertOpEffect(record, affectedChunks) {
    const { type, payload } = record;
    switch (type) {
      case OPERATION_TYPES.ADD_OBJECT:
        this.#removeObjectEffect(payload.objectId, affectedChunks);
        break;
      case OPERATION_TYPES.MODIFY_OBJECT: {
        const obj = this.#boardCore.getObjectById(payload.objectId);
        if (obj) {
          this.#collectObjectChunks(obj, affectedChunks);
          this.#applyObjectPatch(obj, payload.before);
          this.#collectObjectChunks(obj, affectedChunks);
        }
        break;
      }
      case OPERATION_TYPES.DELETE_OBJECT:
        this.#restoreDeletedObjectEffect(payload.objectId, affectedChunks);
        break;
      case OPERATION_TYPES.CHOOSE_OBJECT:
        this.#leaveAomEffect(payload.objectId, affectedChunks, record.source);
        break;
      case OPERATION_TYPES.UNCHOOSE_OBJECT:
        this.#enterAomEffect(payload.objectId, affectedChunks, record.source);
        break;
      default:
        break;
    }
  }

  /**
   * 收集对象覆盖的已加载区块（渲染失效用）
   * @param {import("../objects/basic-obj.js").BasicObject} object - 对象实例
   * @param {Set<import("../chunk/chunk.js").Chunk>} affectedChunks - 受影响区块集合（输出参数）
   * @returns {void}
   * @private
   */
  #collectObjectChunks(object, affectedChunks) {
    const boardCore = this.#boardCore;
    if (boardCore.width <= 0 || boardCore.height <= 0) return;
    const rect = getObjectWorldRect(object);
    if (!rect) return;
    const covered = ChunkObjectManager.calculateCoveredChunkIdsForRange(
      rect,
      boardCore.width,
      boardCore.height,
    );
    for (const chunkId of covered) {
      const chunk = boardCore.getChunkById(chunkId);
      if (chunk) {
        affectedChunks.add(chunk);
      }
    }
  }

  /**
   * 增加对象效果：重建实例并按后到者居上写入相交区块
   * @param {Object} payload - 增加对象分子载荷
   * @param {Set<import("../chunk/chunk.js").Chunk>} affectedChunks - 受影响区块集合（输出参数）
   * @returns {void}
   * @private
   */
  #addObjectEffect(payload, affectedChunks) {
    const boardCore = this.#boardCore;
    if (boardCore.getObjectById(payload.objectId)) return;
    const obj = deserialize(payload.data);
    boardCore.registerObjectInstance(obj);
    if (boardCore.width <= 0 || boardCore.height <= 0) return;
    this.#collectObjectChunks(obj, affectedChunks);
    const rect = getObjectWorldRect(obj);
    if (!rect) return;
    const covered = ChunkObjectManager.calculateCoveredChunkIdsForRange(
      rect,
      boardCore.width,
      boardCore.height,
    );
    boardCore.setObjectCoverChunks(obj.id, covered);
    for (const chunkId of covered) {
      const chunk = boardCore.getChunkById(chunkId);
      if (!chunk) continue;
      // 新区块的 objectManager 尚未创建时静态图为空，below 为空即可（addObject 会创建管理器）
      const graph = chunk.objectManager?.staticGraph;
      const below = graph
        ? graph.getNodes().filter((nodeId) => {
            const nodeRect = getObjectWorldRect(boardCore.getObjectById(nodeId));
            return nodeRect && intersectsRanges(rect, nodeRect);
          })
        : [];
      chunk.addObject(obj, below, []);
    }
  }

  /**
   * 静默移除对象（不产生记录）
   * @param {string} objectId - 对象 id
   * @param {Set<import("../chunk/chunk.js").Chunk>} affectedChunks - 受影响区块集合（输出参数）
   * @returns {void}
   * @private
   */
  #removeObjectEffect(objectId, affectedChunks) {
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    if (obj) {
      this.#collectObjectChunks(obj, affectedChunks);
    }
    this.#chooseSnapshots.delete(objectId);
    for (const { chunk } of boardCore.chunkLoaded.values()) {
      if (chunk?.objectManager?.staticGraph?.hasNode?.(objectId)) {
        chunk.removeObject(objectId);
      }
    }
    const aom = boardCore.activeObjectManager;
    if (aom?.onLayer?.get(objectId)) {
      aom.removeObjectFromLayer(objectId);
      aom.unregisterTrackedActiveObject(objectId);
    }
    boardCore.objectLoaded.delete(objectId);
  }

  /**
   * 从回收站恢复被删除的对象及其层位边
   * @param {string} objectId - 对象 id
   * @param {Set<import("../chunk/chunk.js").Chunk>} affectedChunks - 受影响区块集合（输出参数）
   * @returns {void}
   * @private
   */
  #restoreDeletedObjectEffect(objectId, affectedChunks) {
    const boardCore = this.#boardCore;
    const entry = boardCore.trash.get(objectId);
    if (!entry || boardCore.getObjectById(objectId)) return;
    const obj = deserialize(entry.data);
    boardCore.registerObjectInstance(obj);
    this.#collectObjectChunks(obj, affectedChunks);
    for (const { chunkId, below, above } of entry.chunks) {
      const chunk = boardCore.getChunkById(Number(chunkId));
      const graph = chunk?.objectManager?.staticGraph;
      if (!graph) continue;
      chunk.addObject(
        obj,
        [...below].filter((id) => graph.hasNode(id)),
        [...above].filter((id) => graph.hasNode(id)),
      );
    }
    boardCore.trash.delete(objectId);
  }

  /**
   * 进入动态图效果：对象成为活动对象
   * @param {string} objectId - 对象 id
   * @param {Set<import("../chunk/chunk.js").Chunk>} affectedChunks - 受影响区块集合（输出参数）
   * @param {string} [source] - 记录来源；与本端不同则登记远程活动而非本地活动
   * @returns {void}
   * @private
   */
  #enterAomEffect(objectId, affectedChunks, source) {
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    const aom = boardCore.activeObjectManager;
    // 远程 choose：登记远程活动（锁定 + 可见），不进本地活动集
    if (source !== undefined && source !== boardCore.hitCommitter.source) {
      aom.applyRemoteChoose([objectId], source);
      if (obj) this.#collectObjectChunks(obj, affectedChunks);
      return;
    }
    if (!obj || aom.isActive(objectId)) return;
    this.#collectObjectChunks(obj, affectedChunks);
    // 本地选择优先：撤销该对象的远程活动登记（并发 choose 冲突按链序收敛）
    aom.revokeRemoteActive(objectId);
    aom.add(new Set([obj]));
  }

  /**
   * 离开动态图效果：对象退出活动状态
   * @param {string} objectId - 对象 id
   * @param {Set<import("../chunk/chunk.js").Chunk>} affectedChunks - 受影响区块集合（输出参数）
   * @param {string} [source] - 记录来源；与本端不同则注销远程活动登记
   * @returns {void}
   * @private
   */
  #leaveAomEffect(objectId, affectedChunks, source) {
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    const aom = boardCore.activeObjectManager;
    // 远程 unchoose：注销远程活动登记
    if (source !== undefined && source !== boardCore.hitCommitter.source) {
      aom.applyRemoteUnchoose([objectId], source);
      if (obj) this.#collectObjectChunks(obj, affectedChunks);
      return;
    }
    if (!obj || !aom.has(objectId)) return;
    this.#collectObjectChunks(obj, affectedChunks);
    aom.discard(new Set([obj]));
  }

  /**
   * 取节点的成员记录
   * @param {import("../hit/undo-tree-core.js").MolecularNode} node - 树节点
   * @returns {import("../hit/operation.js").OperationRecord[]} 成员记录数组（独立分子为单件，超分子为全组）
   * @private
   */
  #recordsOfNode(node) {
    const log = this.#boardCore.operationLog;
    const record = log.get(node.shareId);
    return record.supraOpId === null ? [record] : log.getSupraMembers(record.supraOpId);
  }

  /**
   * 执行重做
   * @description 把 HEAD 移到最近一次生效撤销记录的原 HEAD 位置（条件应用由树侧判定）；
   * 生效后按分叉点先逆放旧链尾段、再正向重放新链尾段。
   * @returns {{ redone: boolean, targetNodeId: ?string }} 重做结果
   */
  redo() {
    const tree = this.#boardCore.undoTree;
    const beforeChain = tree.getActiveChain();
    this.#boardCore.hitCommitter.commitRedo();
    const afterChain = tree.getActiveChain();
    const changed = this.#transitionEffects(beforeChain, afterChain);
    return { redone: changed, targetNodeId: changed ? (afterChain.at(-1)?.shareId ?? null) : null };
  }

  /**
   * 应用远端到达的分子操作记录
   * @description 同步插件的入口：记录入日志后按「插入与重放的边界」分流——纯插入/纯应用走增量；
   * 旧操作落在上下文敏感操作之前时全量重建（f(日志) 兜底），再经链过渡对齐白板效果。
   * 同批的超分子成员聚合为一组应用。
   * @param {import("../hit/operation.js").OperationRecord[]} records - 分子操作记录
   * @returns {{ applied: number }} 应用条数
   */
  applyRemoteOperations(records) {
    const boardCore = this.#boardCore;
    const log = boardCore.operationLog;
    const tree = boardCore.undoTree;
    const list = Array.isArray(records) ? records : [];
    const groups = [];
    const bySupra = new Map();
    for (const record of list) {
      if (record.supraOpId === null) {
        groups.push([record]);
      } else {
        let group = bySupra.get(record.supraOpId);
        if (group === undefined) {
          group = [];
          bySupra.set(record.supraOpId, group);
          groups.push(group);
        }
        group.push(record);
      }
    }
    for (const group of groups) {
      for (const record of group) {
        const errors = log.append(record);
        if (errors.length > 0) {
          throw new Error(errors.join("；"));
        }
      }
      const beforeChain = tree.getActiveChain();
      if (this.#needsReplay(group[group.length - 1])) {
        tree.rebuild();
      } else if (group[0].supraOpId === null) {
        tree.applyRecord(group[0]);
      } else {
        tree.applySupraNode(group);
      }
      this.#transitionEffects(beforeChain, tree.getActiveChain());
    }
    return { applied: list.length };
  }

  /**
   * 判定到达记录是否需要全量重建（「插入与重放的边界」判定表）
   * @description 增加节点类与撤销在插入点之后只有增加节点类时纯插入/纯应用；
   * 重做与更改 HEAD 在插入点之后有任何已应用操作时一律重建。
   * @param {import("../hit/operation.js").OperationRecord} record - 到达记录（超分子取末分子）
   * @returns {boolean} 是否需要全量重建
   * @private
   */
  #needsReplay(record) {
    const sorted = this.#boardCore.operationLog.toSortedArray();
    const index = sorted.findIndex((r) => compareRecords(r, record) > 0);
    const after = index === -1 ? [] : sorted.slice(index);
    if (record.type === OPERATION_TYPES.REDO || record.type === OPERATION_TYPES.MOVE_HEAD) {
      return after.length > 0;
    }
    return after.some(
      (r) => getOperationEffectKind(r.type) !== OPERATION_EFFECT_KINDS.APPEND_NODE,
    );
  }
}

export { BoardApi };
