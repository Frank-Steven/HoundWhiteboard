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
import { Matrix, Vector } from "../utils/math.js";
import { intersectsRanges, RectangleRange } from "../range/index.js";
import { ChunkObjectManager } from "../chunk/chunk-object-manager.js";
import { CHUNK_LOAD_EVENTS } from "../chunk/chunk-loader.js";

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
   * @param {import("../board/board-core.js").BoardCore} boardCore - BoardCore 实例
   */
  constructor(boardCore) {
    this.#boardCore = boardCore;
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
   * 修改单个对象的几何/样式属性
   * @param {string} objectId - 对象 id
   * @param {import("../types/board-api-types.js").ObjectPatch} patch - 修改 patch
   * @returns {void}
   */
  modifyObject(objectId, patch) {
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    if (!obj) {
      throw new Error(`Object ${objectId} not found.`);
    }

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
   * 批量修改多个对象
   * @param {import("../types/board-api-types.js").ObjectPatchEntry[]} patches - 批量 patch
   * @returns {void}
   */
  modifyObjects(patches) {
    const boardCore = this.#boardCore;
    const items = Array.isArray(patches) ? patches : [];
    const modifiedObjects = [];

    for (const { objectId, patch } of items) {
      if (objectId == null || !patch) continue;
      const obj = boardCore.getObjectById(objectId);
      if (!obj) continue;

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
      modifiedObjects.push(obj);
    }

    if (modifiedObjects.length > 0) {
      boardCore.aomRenderHooks?.requestActiveRender?.(modifiedObjects);
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
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    if (obj) {
      obj.appendListItem(key, ...(items ?? []));
      boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
    }
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
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    if (obj) {
      obj.replaceListItem(key, index, item);
      boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
    }
  }

  /**
   * 删除对象列表属性中指定索引的元素
   * @param {string} objectId - 对象 id
   * @param {string} key - 列表属性名
   * @param {number} index - 目标索引
   * @returns {void}
   */
  removeListItem(objectId, key, index) {
    const boardCore = this.#boardCore;
    const obj = boardCore.getObjectById(objectId);
    if (obj) {
      obj.removeListItem(key, index);
      boardCore.aomRenderHooks?.requestActiveRender?.([obj]);
    }
  }

  /**
   * 永久删除对象集合
   * @param {string[]} objectIds - 要删除的对象 id 列表
   * @returns {void}
   */
  deleteObjects(objectIds) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const aom = boardCore.activeObjectManager;
    const activeToDiscard = [];
    const affectedChunks = new Set();

    for (const objectId of ids) {
      const obj = boardCore.getObjectById(objectId);
      if (!obj) continue;

      if (aom?.isActive?.(objectId)) {
        activeToDiscard.push(obj);
      }

      for (const { chunk } of boardCore.chunkLoaded.values()) {
        if (chunk?.objectManager?.staticGraph?.hasNode?.(objectId)) {
          chunk.removeObject(objectId);
          affectedChunks.add(chunk);
        }
      }

      boardCore.objectLoaded.delete(objectId);
    }

    if (activeToDiscard.length > 0) {
      aom.discard(new Set(activeToDiscard));
    }

    if (
      affectedChunks.size > 0 &&
      boardCore.aomRenderHooks?.requestStaticRender
    ) {
      boardCore.aomRenderHooks.requestStaticRender([...affectedChunks]);
    }
  }

  /**
   * 按橡皮轨迹擦除命中对象的数据
   * @description
   * 数据擦除的 Core 侧统一入口。调用进入串行队列依次执行，返回的 Promise
   * 在本次调用（含队列等待）完成后兑现。
   * @param {{ points: Array<{x: number, y: number}>, radius: number, source?: string }} payload - 轨迹段（世界坐标）、橡皮半径与来源标识
   * @returns {Promise<{ modified: string[], created: string[], deleted: string[] }>} 受影响对象 id 三组
   */
  eraseData(payload) {
    const run = this.#eraseDataQueue.then(() => this.#performEraseData(payload));
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
  async #performEraseData(payload) {
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
    for (const objectId of candidateIds) {
      const obj = boardCore.getObjectById(objectId);
      if (!obj) continue;
      if (typeof obj.isErasable !== "function" || !obj.isErasable()) continue;
      if (typeof obj.eraseData !== "function") continue;
      // 已被选中的对象（活动对象）不能被擦除
      if (boardCore.activeObjectManager?.isActive?.(objectId)) {
        continue;
      }

      const runs = obj.eraseData(points, radius);
      if (runs == null) continue;

      if (runs.length === 0) {
        result.deleted.push(objectId);
        continue;
      }

      // 切割前快照旧世界范围：输出层按脏区增量更新，
      // 被擦区域与回缩残端的旧像素要靠旧范围失效才能清理
      const previousWorldRect = getObjectWorldRect(obj);
      if (previousWorldRect) {
        previousWorldRects.set(objectId, previousWorldRect);
      }

      this.modifyObject(objectId, { data: { points: runs[0] } });
      result.modified.push(objectId);
      modifiedStaticObjects.push(obj);

      if (runs.length > 1) {
        const serialized = obj.serialize();
        for (let i = 1; i < runs.length; i++) {
          const newObjectId = boardCore.allocateObjectId(source);
          this.createObject(serialized.type, {
            id: newObjectId,
            position: serialized.position,
            transform: serialized.transform,
            property: serialized.property,
            data: { ...serialized.data, points: runs[i] },
          });
          result.created.push(newObjectId);
        }
      }
    }

    if (result.deleted.length > 0) {
      this.deleteObjects(result.deleted);
    }
    if (result.created.length > 0) {
      this.commitObjects(result.created);
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
   * @param {string[]} objectIds - 要提交的对象 id 列表
   * @returns {string[]} 实际提交的对象 id（缺失的 id 被跳过，供调用方对账）
   */
  commitObjects(objectIds) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const objects = ids
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean);
    if (objects.length > 0) {
      boardCore.activeObjectManager.apply(new Set(objects));
    }
    return objects.map((obj) => obj.id);
  }

  /**
   * 将对象加入 AOM 动态图
   * @param {string[]} objectIds - 对象 id 列表
   * @returns {void}
   */
  addActiveObjects(objectIds) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const objects = ids
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean);
    if (objects.length > 0) {
      boardCore.activeObjectManager.choose(new Set(objects));
    }
  }

  /**
   * 将对象从 AOM 动态图移除
   * @param {string[]} objectIds - 对象 id 列表
   * @returns {void}
   */
  discardActiveObjects(objectIds) {
    const boardCore = this.#boardCore;
    const ids = Array.isArray(objectIds) ? objectIds : [];
    const objects = ids
      .map((id) => boardCore.getObjectById(id))
      .filter(Boolean);

    const transientObjectIds = objects.filter(
      (obj) => !hasStaticBoardObject(boardCore, obj.id),
    );

    boardCore.activeObjectManager.discard(new Set(objects));

    for (const objectId of transientObjectIds) {
      boardCore.objectLoaded.delete(objectId);
    }
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
   * 执行撤销
   * @returns {void}
   * @throws {Error} 尚未实现
   */
  undo() {
    throw new Error("Undo not implemented yet.");
  }

  /**
   * 执行重做
   * @returns {void}
   * @throws {Error} 尚未实现
   */
  redo() {
    throw new Error("Redo not implemented yet.");
  }
}

export { BoardApi };
