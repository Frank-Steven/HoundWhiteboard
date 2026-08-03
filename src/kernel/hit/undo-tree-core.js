/**
 * @file 时间回溯树的核心模块
 * @description 单一共享树与共享 HEAD：分子节点结构、追加与时间插入、活动链解析、视图查询与从日志派生重建。
 * @module kernel/hit/undo-tree-core
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import {
	OPERATION_EFFECT_KINDS,
	getOperationEffectKind,
	compareTimeMarks,
	parseOperationId,
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
	 * 对应位置、插入点之后的节点改挂。树级操作（更改 HEAD、撤销、重做）的应用随撤销与重做落地补全。
	 * @param {import("./operation.js").OperationRecord} record - 分子操作记录
	 * @returns {MolecularNode} 记录产生的新节点
	 * @throws {Error} 记录未入数据池（日志），或类型暂不支持时抛出
	 */
	applyRecord(record) {
		if (!this.#log.has(record.id)) {
			throw new Error(`记录未入数据池：${record.id}`);
		}
		if (getOperationEffectKind(record.type) !== OPERATION_EFFECT_KINDS.APPEND_NODE) {
			throw new Error(`树级操作的应用随撤销与重做落地补全：${record.type}`);
		}
		if (this.#head === this.#root || this.#compareRecords(record, this.#log.get(this.#head.shareId)) > 0) {
			return this.appendRecord(record);
		}
		return this.insertRecordByTimeMark(record);
	}

	/**
	 * 在 HEAD 之后追加节点并推进 HEAD
	 * @param {import("./operation.js").OperationRecord} record - 分子操作记录
	 * @returns {MolecularNode} 新节点
	 */
	appendRecord(record) {
		const node = new MolecularNode(record.id, this.#head);
		this.#insertChildSorted(this.#head, node);
		this.#head = node;
		this.#rebuildActiveIndex();
		return node;
	}

	/**
	 * 按时间标记插入活动链的对应位置，插入点之后的节点改挂；HEAD 不变
	 * @param {import("./operation.js").OperationRecord} record - 分子操作记录
	 * @returns {MolecularNode} 新节点
	 */
	insertRecordByTimeMark(record) {
		const chain = this.getActiveChain();
		const successor = chain.find(
			(node) => this.#compareRecords(record, this.#log.get(node.shareId)) < 0,
		) ?? null;
		if (successor === null) {
			return this.appendRecord(record);
		}
		const parent = successor.parent;
		const node = new MolecularNode(record.id, parent);
		this.#replaceChild(parent, successor, node);
		node.children = [successor];
		const delta = node.depth + 1 - successor.depth;
		successor.parent = node;
		this.#shiftDepth(successor, delta);
		this.#rebuildActiveIndex();
		return node;
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
	static rebuildFromLog(log) {
		const tree = new UndoTree(log);
		for (const record of log.toSortedArray()) {
			tree.applyRecord(record);
		}
		return tree;
	}

	/**
	 * 记录排序比较：先按时间标记（时钟环），同刻同 author 按操作序号决胜
	 * @param {import("./operation.js").OperationRecord} a - 记录 a
	 * @param {import("./operation.js").OperationRecord} b - 记录 b
	 * @returns {number} a 排在 b 前为负，相等为 0，a 排在 b 后为正
	 * @private
	 */
	#compareRecords(a, b) {
		const byTime = compareTimeMarks(a, b);
		if (byTime !== 0) {
			return byTime;
		}
		return parseOperationId(a.id).n - parseOperationId(b.id).n;
	}

	/**
	 * 把子节点插入父节点的有序子节点数组
	 * @param {MolecularNode} parent - 父节点
	 * @param {MolecularNode} child - 子节点
	 * @private
	 */
	#insertChildSorted(parent, child) {
		const childRecord = this.#log.get(child.shareId);
		const index = parent.children.findIndex(
			(sibling) => this.#compareRecords(childRecord, this.#log.get(sibling.shareId)) < 0,
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
