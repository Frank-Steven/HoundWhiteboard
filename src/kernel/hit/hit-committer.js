/**
 * @file hit 提交器
 * @description 分子操作的 commit 边界单点：统一构造记录、分配 id 与单调时间、入日志并应用到树。
 * @module kernel/hit/hit-committer
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import {
  OPERATION_TYPES,
  createAddObjectOperation,
  createModifyObjectOperation,
  createDeleteObjectOperation,
  createChooseObjectOperation,
  createUnchooseObjectOperation,
  createUndoOperation,
  createRedoOperation,
} from "./operation.js";

/** 超分子成员的缓冲草稿（未定稿：无 id，supraOpId 在闭合定稿时补齐） @typedef {Object} SupraDraft */

/**
 * 简并一个对象在超分子内的草稿序列
 * @description 规则：add+delete 相消；add 吸并后续 modify（数据取终态）；delete 吸并前行 modify；
 * modify 链合一（首条 before + 末条 after，属性集合取并集）；choose/unchoose 空转消除。
 * @param {SupraDraft[]} ops - 同一对象的草稿序列（按提交顺序）
 * @returns {SupraDraft[]} 简并后的草稿序列
 */
function foldObjectDrafts(ops) {
  let choose = null;
  let add = null;
  let del = null;
  let unchoose = null;
  const modifies = [];
  for (const op of ops) {
    switch (op.type) {
      case OPERATION_TYPES.ADD_OBJECT:
        add = op;
        break;
      case OPERATION_TYPES.MODIFY_OBJECT:
        modifies.push(op);
        break;
      case OPERATION_TYPES.DELETE_OBJECT:
        del = op;
        break;
      case OPERATION_TYPES.CHOOSE_OBJECT:
        if (choose === null) {
          choose = op;
        }
        break;
      case OPERATION_TYPES.UNCHOOSE_OBJECT:
        unchoose = op;
        break;
      default:
        break;
    }
  }
  if (add !== null && del !== null) {
    return [];
  }
  const lastAfter = modifies.at(-1)?.payload?.after;
  const lastSnapshot =
    modifies.at(-1)?.payload?.layerStackSnapshot ?? undefined;
  if (add !== null) {
    if (modifies.length > 0) {
      return [
        {
          ...add,
          payload: {
            ...add.payload,
            data: lastAfter,
            layerStackSnapshot: lastSnapshot ?? add.payload.layerStackSnapshot,
          },
        },
      ];
    }
    return [add];
  }
  if (del !== null) {
    return [del];
  }
  if (modifies.length === 0) {
    // choose 与 unchoose 同现且无净效果时空转消除；仅有 choose（选择成立）或仅有 unchoose 时保留
    if (choose !== null && unchoose !== null) {
      return [];
    }
    return [choose, unchoose].filter((op) => op !== null);
  }
  const merged = {
    ...modifies[0],
    properties: [...new Set(modifies.flatMap((m) => m.properties ?? []))],
    payload: {
      ...modifies[0].payload,
      after: lastAfter,
      layerStackSnapshot:
        lastSnapshot ?? modifies[0].payload.layerStackSnapshot,
    },
  };
  return [choose, merged, unchoose].filter((op) => op !== null);
}

/**
 * 简并超分子草稿（按对象分组折叠，组序保持首次出现顺序）
 * @param {SupraDraft[]} drafts - 超分子开启期间缓冲的全部草稿
 * @returns {SupraDraft[]} 简并后的草稿序列
 */
function collapseSupraDrafts(drafts) {
  const groups = new Map();
  for (const draft of drafts) {
    const key = draft.payload?.objectId;
    let group = groups.get(key);
    if (group === undefined) {
      group = [];
      groups.set(key, group);
    }
    group.push(draft);
  }
  const result = [];
  for (const ops of groups.values()) {
    result.push(...foldObjectDrafts(ops));
  }
  // 稳定排序保证时间单调（组内顺序即原相对顺序，跨组按时间交错，不同对象的成员语义可交换）
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * hit 提交器
 * @description
 * 分子操作的 commit 边界单点。白板效果执行后，调用方把效果摘要交给提交器，
 * 由提交器统一完成：构造分子操作记录（id、单调时间标记、本地视角父节点、超分子关联）、
 * 入操作日志、应用到时间回溯树（HEAD 随结构自然移动）。
 * 超分子开启期间成员缓冲为草稿（不入日志、不上树），endSupra 时简并、定稿、整体入日志
 * 并凝聚为单个节点——超分子在日志中也是原子出现的。
 * @class
 * @author Zhou Chenyu
 */
class HitCommitter {
  /**
   * 发起者标识（hit 节点的 author）
   * @type {string}
   */
  #source;

  /**
   * 操作日志
   * @type {import("./operation-log.js").OperationLog}
   */
  #log;

  /**
   * 时间回溯树
   * @type {import("./undo-tree-core.js").UndoTree}
   */
  #tree;

  /**
   * 物理时间来源
   * @type {() => number}
   */
  #now;

  /**
   * 本 source 已发出的最晚时间标记
   * @type {number}
   */
  #lastTime = 0;

  /**
   * 当前开启的超分子句柄（同时至多一个）
   * @type {?{ id: ?string, drafts: SupraDraft[] }}
   */
  #openSupra = null;

  /**
   * 构造 hit 提交器
   * @param {Object} options - 配置项
   * @param {string} options.source - 发起者标识
   * @param {import("./operation-log.js").OperationLog} options.log - 操作日志
   * @param {import("./undo-tree-core.js").UndoTree} options.tree - 时间回溯树
   * @param {() => number} [options.now] - 物理时间来源，缺省 Date.now
   */
  constructor({ source, log, tree, now }) {
    this.#source = source;
    this.#log = log;
    this.#tree = tree;
    this.#now = now ?? (() => Date.now());
  }

  /**
   * 发起者标识
   * @type {string}
   */
  get source() {
    return this.#source;
  }

  /**
   * 当前开启的超分子句柄（无开启时为 null）
   * @type {?{ id: ?string, drafts: SupraDraft[] }}
   */
  get openSupra() {
    return this.#openSupra;
  }

  /**
   * 开始一个超分子操作
   * @description 返回超分子句柄；开启期间的增加节点类 commit 自动关联为该超分子的成员
   * （缓冲为草稿），endSupra 时简并定稿。同时至多开启一个；调用方须保证闭合（finally）。
   * @returns {{ id: ?string, drafts: SupraDraft[] }} 超分子句柄
   * @throws {Error} 已有开启中的超分子时抛出
   */
  beginSupra() {
    if (this.#openSupra !== null) {
      throw new Error("已有开启中的超分子（同时至多一个，须先闭合）");
    }
    const supra = { id: null, drafts: [] };
    this.#openSupra = supra;
    return supra;
  }

  /**
   * 闭合一个超分子操作
   * @description 草稿经简并后定稿：顺序分配 id（首分子自指为超分子 id）、整体入日志，
   * 并在树上凝聚为一个节点；空组（含简并后为空的组）不产生节点。
   * @param {?{ id: ?string, drafts: SupraDraft[] }} supra - 超分子句柄
   * @returns {void}
   * @throws {Error} 句柄不是当前开启的超分子时抛出（谁开启谁关闭）
   */
  endSupra(supra) {
    if (supra === null || supra !== this.#openSupra) {
      throw new Error("超分子关闭者与开启者不一致");
    }
    this.#openSupra = null;
    const kept = collapseSupraDrafts(supra.drafts);
    supra.drafts = [];
    if (kept.length === 0) {
      return;
    }
    const records = [];
    let supraId = null;
    for (const draft of kept) {
      const id = this.#log.nextId(this.#source);
      if (supraId === null) {
        supraId = id;
      }
      const record = { ...draft, id, supraOpId: supraId };
      const errors = this.#log.append(record);
      if (errors.length > 0) {
        throw new Error(errors.join("；"));
      }
      records.push(record);
    }
    supra.id = supraId;
    this.#tree.applySupraNode(records);
  }

  /**
   * 提交增加对象分子操作
   * @param {Object} effect - 效果摘要
   * @param {string} effect.chunkId - 区块 id
   * @param {string} effect.objectId - 对象 id
   * @param {Object} effect.data - 对象全量内容（可 JSON 序列化）
   * @param {string[]} effect.layerStackSnapshot - 操作时刻的完整层栈快照（z-order）
   * @returns {import("./operation.js").OperationRecord} 分子操作记录（超分子成员为未定稿草稿）
   */
  commitAdd(effect) {
    return this.#emit(createAddObjectOperation, effect);
  }

  /**
   * 提交修改对象分子操作
   * @param {Object} effect - 效果摘要
   * @param {string} effect.chunkId - 区块 id
   * @param {string} effect.objectId - 对象 id
   * @param {string[]} effect.properties - 涉及属性的集合
   * @param {Object} effect.before - 修改前快照
   * @param {Object} effect.after - 修改后快照
   * @param {string[]} effect.layerStackSnapshot - 操作时刻的完整层栈快照（z-order）
   * @returns {import("./operation.js").OperationRecord} 分子操作记录（超分子成员为未定稿草稿）
   */
  commitModify(effect) {
    return this.#emit(createModifyObjectOperation, effect);
  }

  /**
   * 提交删除对象分子操作
   * @param {Object} effect - 效果摘要
   * @param {string} effect.chunkId - 区块 id
   * @param {string} effect.objectId - 对象 id
   * @returns {import("./operation.js").OperationRecord} 分子操作记录（超分子成员为未定稿草稿）
   */
  commitDelete(effect) {
    return this.#emit(createDeleteObjectOperation, effect);
  }

  /**
   * 提交选择对象分子操作
   * @param {Object} effect - 效果摘要
   * @param {string} effect.chunkId - 区块 id
   * @param {string} effect.objectId - 对象 id
   * @returns {import("./operation.js").OperationRecord} 分子操作记录（超分子成员为未定稿草稿）
   */
  commitChoose(effect) {
    return this.#emit(createChooseObjectOperation, effect);
  }

  /**
   * 提交取消选择分子操作
   * @param {Object} effect - 效果摘要
   * @param {string} effect.chunkId - 区块 id
   * @param {string} effect.objectId - 对象 id
   * @returns {import("./operation.js").OperationRecord} 分子操作记录（超分子成员为未定稿草稿）
   */
  commitUnchoose(effect) {
    return this.#emit(createUnchooseObjectOperation, effect);
  }

  /**
   * 提交撤销分子操作
   * @description 记录目标节点与撤销前 HEAD 位置（重做的移动目标）；退化/分叉改挂/被吸收在应用时确定。
   * 撤销不属于任何超分子：开启中的超分子不拦截它。
   * @param {Object} effect - 效果摘要
   * @param {string} effect.targetNodeId - 撤消操作的目标节点 id（缺省为活动链末端，由调用方解析后传入）
   * @returns {import("./operation.js").OperationRecord} 撤销操作记录
   */
  commitUndo(effect) {
    return this.#emit(createUndoOperation, {
      ...effect,
      previousHeadId: this.#tree.head.shareId,
    });
  }

  /**
   * 提交重做分子操作
   * @description 重做的移动目标由最近一次生效撤销的记录派生，自身不携带目标；
   * 是否生效由树侧按条件应用判定（新工作洗掉则不移动，记录仍在日志）。
   * 重做任何时刻都是独立分子，不进入超分子。
   * @returns {import("./operation.js").OperationRecord} 重做操作记录
   */
  commitRedo() {
    return this.#emit(createRedoOperation, {});
  }

  /**
   * 统一的发射管线：构造记录、入日志、应用到树
   * @description 增加节点类操作在超分子开启期间缓冲为草稿（不入日志、不上树，id 与
   * supraOpId 在 endSupra 定稿时补齐）；撤销与重做永远独立成录，即时入日志并上树。
   * @param {(fields: Object) => import("./operation.js").OperationRecord} factory - 分子记录工厂
   * @param {Object} effect - 效果摘要
   * @returns {import("./operation.js").OperationRecord} 分子操作记录（超分子成员为未定稿草稿）
   * @throws {Error} 记录未通过日志准入校验，或显式传入的超分子句柄已闭合时抛出
   * @private
   */
  #emit(factory, effect) {
    const time = Math.max(this.#now(), this.#lastTime);
    this.#lastTime = time;
    const joinable =
      factory !== createUndoOperation && factory !== createRedoOperation;
    const supra = joinable ? (effect.supra ?? this.#openSupra) : null;
    if (supra !== null) {
      if (supra !== this.#openSupra) {
        throw new Error("超分子句柄已闭合或未开启");
      }
      const draft = factory({
        ...effect,
        id: null,
        source: this.#source,
        time,
        parentId: this.#tree.head.shareId,
        supraOpId: null,
      });
      supra.drafts.push(draft);
      return draft;
    }
    const record = factory({
      ...effect,
      id: this.#log.nextId(this.#source),
      source: this.#source,
      time,
      parentId: this.#tree.head.shareId,
      supraOpId: null,
    });
    const errors = this.#log.append(record);
    if (errors.length > 0) {
      throw new Error(errors.join("；"));
    }
    this.#tree.applyRecord(record);
    return record;
  }
}

export { HitCommitter };
