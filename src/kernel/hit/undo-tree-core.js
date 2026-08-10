/**
 * @file 时间回溯树的核心模块
 * @description 单一共享树与共享 HEAD：分子节点结构、追加与时间插入、活动链解析、视图查询与从日志派生重建。
 * @module kernel/hit/undo-tree-core
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import {
  OPERATION_TYPES,
  OPERATION_EFFECT_KINDS,
  getOperationEffectKind,
  compareRecords,
} from "./operation.js";

/**
 * 分子节点
 * @description
 * 树状结构记在节点上：父链、子节点（按时间标记有序）、深度与所属操作的 share id。
 * 节点不存时间（时间随所属操作），数据不自带，放在数据池（操作日志）中凭 share id 获取。
 * @class
 * @author Zhou Chenyu
 */
class MolecularNode {
  /**
   * 数据池共享 id，即所属操作的 id；多个节点可凭同一 share id 共享数据
   * @type {?string}
   */
  shareId;

  /**
   * 父节点；虚拟根为 null
   * @type {?MolecularNode}
   */
  parent;

  /**
   * 子节点，按时间标记（时钟环，同刻按操作序号）升序
   * @type {MolecularNode[]}
   */
  children = [];

  /**
   * 深度；虚拟根为 0
   * @type {number}
   */
  depth;

  /**
   * 构造分子节点
   * @param {?string} shareId - 数据池共享 id
   * @param {?MolecularNode} parent - 父节点
   */
  constructor(shareId, parent) {
    this.shareId = shareId;
    this.parent = parent;
    this.depth = parent === null ? 0 : parent.depth + 1;
  }
}

/**
 * 时间回溯树
 * @description
 * 内核内有且仅有一棵 hit 树，与操作日志（数据池）配合：树是日志的追溯结构，可凭 f(日志) 派生重建。
 * HEAD 指向当前状态对应的节点，可在链中间；root→HEAD 是活动链，HEAD 下游的后代是已撤销的节点。
 * @class
 * @author Zhou Chenyu
 */
class UndoTree {
  /**
   * 数据池（操作日志）
   * @type {import("./operation-log.js").OperationLog}
   */
  #log;

  /**
   * 虚拟根
   * @type {MolecularNode}
   */
  #root;

  /**
   * 共享 HEAD
   * @type {MolecularNode}
   */
  #head;

  /**
   * 活动链上 share id 到节点的索引
   * @type {Map<string, MolecularNode>}
   */
  #activeByShareId = new Map();

  /**
   * 重做栈（由日志派生：生效撤销压入，新工作清空，重做弹出）
   * @type {Array<{ targetId: string, previousHeadId: string }>}
   */
  #redoStack = [];

  /**
   * 构造时间回溯树
   * @param {import("./operation-log.js").OperationLog} log - 数据池（操作日志）
   */
  constructor(log) {
    this.#log = log;
    this.#root = new MolecularNode(null, null);
    this.#head = this.#root;
  }

  /**
   * 虚拟根
   * @type {MolecularNode}
   */
  get root() {
    return this.#root;
  }

  /**
   * 共享 HEAD
   * @type {MolecularNode}
   */
  get head() {
    return this.#head;
  }

  /**
   * 活动链（root→HEAD 的操作节点序列，不含虚拟根）
   * @returns {MolecularNode[]} 活动链节点序列
   */
  getActiveChain() {
    const chain = [];
    for (let node = this.#head; node !== this.#root; node = node.parent) {
      chain.push(node);
    }
    return chain.reverse();
  }

  /**
   * 重做栈快照（派生自日志：生效撤销压入，新工作清空，重做弹出）
   * @returns {Array<{ targetId: string, previousHeadId: string }>} 栈项序列（栈底在前）
   */
  getRedoStack() {
    return this.#redoStack.map((entry) => ({ ...entry }));
  }

  /**
   * 活动链上携带某操作的节点
   * @param {string} shareId - 数据池共享 id（操作 id）
   * @returns {?MolecularNode} 节点；该操作不在活动链上时为 null
   */
  getActiveNode(shareId) {
    return this.#activeByShareId.get(shareId) ?? null;
  }

  /**
   * 判断某操作是否在活动链上
   * @param {string} shareId - 数据池共享 id（操作 id）
   * @returns {boolean} 是否在活动链上
   */
  isOnActiveChain(shareId) {
    return this.#activeByShareId.has(shareId);
  }

  /**
   * 整棵树中查找携带某操作的节点（含分支，深度优先取先见者）
   * @param {string} shareId - 数据池共享 id（操作 id）
   * @returns {?MolecularNode} 节点；不存在时为 null
   */
  findNode(shareId) {
    return this.#findNode(this.#root, shareId);
  }

  /**
   * 某节点的子节点视图（按时间标记升序的副本）
   * @param {MolecularNode} node - 父节点
   * @returns {MolecularNode[]} 子节点数组的副本
   */
  getChildrenOf(node) {
    return [...node.children];
  }

  /**
   * 应用一条分子操作记录
   * @description
   * 增加节点类按时间标记落位：晚于 HEAD（时钟环）时在 HEAD 之后追加并推进 HEAD，否则插入活动链的
   * 对应位置、插入点之后的节点改挂。撤销按目标在活动链上的位置呈现退化/分叉改挂/被吸收形态。
   * 更改 HEAD 与重做的应用随重做落地补全。
   * @param {import("./operation.js").OperationRecord} record - 分子操作记录
   * @returns {?MolecularNode} 记录产生的新节点；撤销不产生节点返回 null
   * @throws {Error} 记录未入数据池（日志），或类型暂不支持时抛出
   */
  applyRecord(record) {
    if (!this.#log.has(record.id)) {
      throw new Error(`记录未入数据池：${record.id}`);
    }
    if (record.type === OPERATION_TYPES.UNDO) {
      return this.#applyUndo(record);
    }
    if (record.type === OPERATION_TYPES.REDO) {
      return this.#applyRedo(record);
    }
    if (getOperationEffectKind(record.type) !== OPERATION_EFFECT_KINDS.APPEND_NODE) {
      throw new Error(`树级操作的应用随更改 HEAD 落地补全：${record.type}`);
    }
    if (record.supraOpId !== null) {
      throw new Error(`超分子成员不产生独立节点，经 applySupraNode 应用：${record.id}`);
    }
    if (this.#head === this.#root || this.#compareRecords(record, this.#timeRecordOf(this.#head.shareId)) > 0) {
      return this.appendRecord(record);
    }
    return this.insertRecordByTimeMark(record);
  }

  /**
   * 应用一个超分子操作（全部成员凝聚为一个节点）
   * @description 节点 shareId 为超分子 id（首分子 id），时间标记取末分子（完成时刻）；
   * 晚于 HEAD 时追加并推进 HEAD，否则插入活动链对应位置。空成员组不产生节点。
   * @param {import("./operation.js").OperationRecord[]} members - 超分子成员记录（按追加序）
   * @returns {?MolecularNode} 超分子节点；空组返回 null
   */
  applySupraNode(members) {
    if (!Array.isArray(members) || members.length === 0) {
      return null;
    }
    const shareId = members[0].supraOpId;
    // 成员增量到达幂等：节点已存在时不重复建节点（成员全集由数据池凭 shareId 提供）
    const existing = this.getActiveNode(shareId);
    if (existing !== null) {
      return existing;
    }
    const last = members[members.length - 1];
    if (this.#head === this.#root || this.#compareRecords(last, this.#timeRecordOf(this.#head.shareId)) > 0) {
      return this.#appendNode(shareId);
    }
    return this.#insertNodeByTime(shareId, last);
  }

  /**
   * 应用撤销操作记录
   * @description
   * 目标不在活动链上时被吸收（无结构变化）；目标为活动链末端时退化为 HEAD 回退；
   * 目标在链中段时在目标父节点处分叉：目标与 HEAD 之间的链（不含目标）改挂到分叉点，
   * 原位置按 (时间, author) 截断——不晚于撤销操作的节点留在原位置（凭同一 share id 共享数据），
   * 晚于的只存在于撤消分支；HEAD 移到新末端。撤销本身不产生节点。
   * @param {import("./operation.js").OperationRecord} record - 撤销操作记录
   * @returns {null}
   * @private
   */
  #applyUndo(record) {
    const target = this.getActiveNode(record.payload.targetNodeId);
    if (target === null) {
      return null;
    }
    this.#redoStack.push({
      targetId: record.payload.targetNodeId,
      previousHeadId: record.payload.previousHeadId,
    });
    if (target === this.#head) {
      this.#head = target.parent;
      this.#rebuildActiveIndex();
      return null;
    }
    const forkPoint = target.parent;
    // 目标与 HEAD 之间的链（不含目标），按时间升序
    const chain = [];
    for (let node = this.#head; node !== target; node = node.parent) {
      chain.unshift(node);
    }
    // 原位置截断：不晚于撤销操作的前缀留在原位置，其后从原位置摘下
    let keepCount = 0;
    while (
      keepCount < chain.length &&
      this.#compareRecords(this.#log.get(chain[keepCount].shareId), record) <= 0
    ) {
      keepCount++;
    }
    if (keepCount < chain.length) {
      const dropped = chain[keepCount];
      dropped.parent.children = dropped.parent.children.filter((child) => child !== dropped);
    }
    // 改挂：分叉点下新建链，节点凭同一 share id 共享数据
    let parent = forkPoint;
    for (const old of chain) {
      const copy = new MolecularNode(old.shareId, parent);
      this.#insertChildSorted(parent, copy);
      parent = copy;
    }
    this.#head = parent;
    this.#rebuildActiveIndex();
    return null;
  }

  /**
   * 在 HEAD 之后追加节点并推进 HEAD
   * @param {import("./operation.js").OperationRecord} record - 分子操作记录
   * @returns {MolecularNode} 新节点
   */
  appendRecord(record) {
    return this.#appendNode(record.id);
  }

  /**
   * 按时间标记插入活动链的对应位置，插入点之后的节点改挂；HEAD 不变
   * @param {import("./operation.js").OperationRecord} record - 分子操作记录
   * @returns {MolecularNode} 新节点
   */
  insertRecordByTimeMark(record) {
    return this.#insertNodeByTime(record.id, record);
  }

  /**
   * 在 HEAD 之后追加节点并推进 HEAD
   * @param {string} shareId - 数据池共享 id
   * @returns {MolecularNode} 新节点
   * @private
   */
  #appendNode(shareId) {
    const node = new MolecularNode(shareId, this.#head);
    this.#insertChildSorted(this.#head, node);
    this.#head = node;
    // 推进 HEAD 的新工作洗掉可重做的撤销
    this.#redoStack = [];
    this.#rebuildActiveIndex();
    return node;
  }

  /**
   * 按时间标记插入活动链的对应位置，插入点之后的节点改挂；HEAD 不变
   * @param {string} shareId - 数据池共享 id
   * @param {import("./operation.js").OperationRecord} timeRecord - 时间标记的来源记录
   * @returns {MolecularNode} 新节点
   * @private
   */
  #insertNodeByTime(shareId, timeRecord) {
    const chain = this.getActiveChain();
    const successor = chain.find(
      (node) => this.#compareRecords(timeRecord, this.#timeRecordOf(node.shareId)) < 0,
    ) ?? null;
    if (successor === null) {
      return this.#appendNode(shareId);
    }
    const parent = successor.parent;
    const node = new MolecularNode(shareId, parent);
    this.#replaceChild(parent, successor, node);
    node.children = [successor];
    const delta = node.depth + 1 - successor.depth;
    successor.parent = node;
    this.#shiftDepth(successor, delta);
    this.#rebuildActiveIndex();
    return node;
  }

  /**
   * 应用重做操作记录
   * @description 重做是纯 HEAD 移动：把 HEAD 移到最近一次生效撤销记录的原 HEAD 位置。
   * 条件应用——仅当评估时 HEAD 恰为操作起点（parentId）才移动；新工作已洗掉可重做的
   * 撤销时不生效。被吸收的撤销不产生重做目标。重做本身不产生节点。
   * @param {import("./operation.js").OperationRecord} record - 重做操作记录
   * @returns {null}
   * @private
   */
  #applyRedo(record) {
    const pending = this.#redoStack.at(-1) ?? null;
    if (pending === null) {
      return null;
    }
    this.#redoStack.pop();
    if (this.#head.shareId !== record.parentId) {
      return null;
    }
    const target = this.#resolveRedoTarget(pending);
    if (target === null) {
      return null;
    }
    this.#head = target;
    this.#rebuildActiveIndex();
    return null;
  }

  /**
   * 解析重做的目标节点
   * @description previousHeadId 有多个节点副本时，取祖先链含撤销目标节点的（原分支）。
   * @param {{ targetId: string, previousHeadId: string }} pending - 待重做的撤销
   * @returns {?MolecularNode} 目标节点；无法解析时为 null
   * @private
   */
  #resolveRedoTarget(pending) {
    const candidates = [];
    this.#collectNodes(this.#root, pending.previousHeadId, candidates);
    if (candidates.length === 1) {
      return candidates[0];
    }
    return (
      candidates.find((node) => this.#hasAncestorWithShareId(node, pending.targetId)) ?? null
    );
  }

  /**
   * 收集携带某操作的全部节点（含各分支副本）
   * @param {MolecularNode} node - 当前节点
   * @param {string} shareId - 数据池共享 id
   * @param {MolecularNode[]} out - 收集结果
   * @private
   */
  #collectNodes(node, shareId, out) {
    if (node.shareId === shareId) {
      out.push(node);
    }
    for (const child of node.children) {
      this.#collectNodes(child, shareId, out);
    }
  }

  /**
   * 判断节点的祖先链上是否存在携带某操作的节点
   * @param {MolecularNode} node - 当前节点
   * @param {string} shareId - 数据池共享 id
   * @returns {boolean} 是否存在
   * @private
   */
  #hasAncestorWithShareId(node, shareId) {
    for (let current = node.parent; current !== null; current = current.parent) {
      if (current.shareId === shareId) {
        return true;
      }
    }
    return false;
  }

  /**
   * 移动 HEAD 至树上已有节点
   * @param {string} shareId - 目标节点携带的操作 id
   * @returns {boolean} 是否成功移动；目标不存在时为 false
   */
  moveHeadTo(shareId) {
    const node = this.findNode(shareId);
    if (node === null) {
      return false;
    }
    this.#head = node;
    this.#rebuildActiveIndex();
    return true;
  }

  /**
   * 从操作日志派生重建树（f(日志)：按时间标记全序逐条应用）
   * @param {import("./operation-log.js").OperationLog} log - 操作日志
   * @returns {UndoTree} 重建的树
   */
  /**
   * 从数据池（操作日志）原地派生重建（f(日志)）
   * @description 清空结构状态后按分组定序逐条应用；超分子成员组凝聚为单节点。
   * @returns {void}
   */
  rebuild() {
    this.#root = new MolecularNode(null, null);
    this.#head = this.#root;
    this.#activeByShareId = new Map();
    this.#redoStack = [];
    // 分组：独立分子各自成组，超分子成员并入其超分子组
    const groups = [];
    const supraGroups = new Map();
    for (const record of this.#log.toArray()) {
      if (record.supraOpId === null) {
        groups.push([record]);
      } else {
        let group = supraGroups.get(record.supraOpId);
        if (group === undefined) {
          group = [];
          supraGroups.set(record.supraOpId, group);
          groups.push(group);
        }
        group.push(record);
      }
    }
    // 组序取末分子时间标记（完成时刻），保证确定性全序
    groups.sort((a, b) => compareRecords(a[a.length - 1], b[b.length - 1]));
    for (const group of groups) {
      if (group[0].supraOpId === null) {
        this.applyRecord(group[0]);
      } else {
        this.applySupraNode(group);
      }
    }
  }

  /**
   * 从操作日志派生重建树（f(日志)：按时间标记全序逐条应用）
   * @param {import("./operation-log.js").OperationLog} log - 操作日志
   * @returns {UndoTree} 重建的树
   */
  static rebuildFromLog(log) {
    const tree = new UndoTree(log);
    tree.rebuild();
    return tree;
  }

  /**
   * 取节点的代表记录（时间标记的来源）
   * @param {string} shareId - 数据池共享 id
   * @returns {import("./operation.js").OperationRecord} 代表记录
   * @private
   */
  #timeRecordOf(shareId) {
    return this.#log.getLastMember(shareId);
  }

  /**
   * 记录排序比较：先按时间标记（时钟环），同刻同 author 按操作序号决胜
   * @param {import("./operation.js").OperationRecord} a - 记录 a
   * @param {import("./operation.js").OperationRecord} b - 记录 b
   * @returns {number} a 排在 b 前为负，相等为 0，a 排在 b 后为正
   * @private
   */
  #compareRecords(a, b) {
    return compareRecords(a, b);
  }

  /**
   * 把子节点插入父节点的有序子节点数组
   * @param {MolecularNode} parent - 父节点
   * @param {MolecularNode} child - 子节点
   * @private
   */
  #insertChildSorted(parent, child) {
    const childRecord = this.#timeRecordOf(child.shareId);
    const index = parent.children.findIndex(
      (sibling) => this.#compareRecords(childRecord, this.#timeRecordOf(sibling.shareId)) < 0,
    );
    if (index === -1) {
      parent.children.push(child);
    } else {
      parent.children.splice(index, 0, child);
    }
  }

  /**
   * 在父节点的子节点数组中以新节点替换旧节点，保持有序位置
   * @param {MolecularNode} parent - 父节点
   * @param {MolecularNode} oldChild - 被替换的子节点
   * @param {MolecularNode} newChild - 新子节点
   * @private
   */
  #replaceChild(parent, oldChild, newChild) {
    parent.children = parent.children.filter((child) => child !== oldChild);
    this.#insertChildSorted(parent, newChild);
  }

  /**
   * 整棵子树深度平移
   * @param {MolecularNode} node - 子树根
   * @param {number} delta - 深度增量
   * @private
   */
  #shiftDepth(node, delta) {
    node.depth += delta;
    for (const child of node.children) {
      this.#shiftDepth(child, delta);
    }
  }

  /**
   * 深度优先查找携带某操作的节点
   * @param {MolecularNode} node - 当前节点
   * @param {string} shareId - 数据池共享 id
   * @returns {?MolecularNode} 节点；不存在时为 null
   * @private
   */
  #findNode(node, shareId) {
    if (node.shareId === shareId) {
      return node;
    }
    for (const child of node.children) {
      const found = this.#findNode(child, shareId);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  /**
   * 重建活动链索引（root→HEAD 路径上的 share id）
   * @private
   */
  #rebuildActiveIndex() {
    this.#activeByShareId.clear();
    for (let node = this.#head; node !== this.#root; node = node.parent) {
      this.#activeByShareId.set(node.shareId, node);
    }
  }
}

export {
  MolecularNode,
  UndoTree,
};
