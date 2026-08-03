/**
 * @file hit 提交器
 * @description 分子操作的 commit 边界单点：统一构造记录、分配 id 与单调时间、入日志并应用到树。
 * @module kernel/hit/hit-committer
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import {
	createAddObjectOperation,
	createModifyObjectOperation,
	createDeleteObjectOperation,
	createChooseObjectOperation,
	createUnchooseObjectOperation,
} from "./operation.js";

/**
 * hit 提交器
 * @description
 * 分子操作的 commit 边界单点。白板效果执行后，调用方把效果摘要交给提交器，
 * 由提交器统一完成：构造分子操作记录（id、单调时间标记、本地视角父节点、超分子关联）、
 * 入操作日志、应用到时间回溯树（HEAD 随结构自然移动）。
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
	 * 开始一个超分子操作
	 * @description 返回超分子句柄，句柄 id 取首个分子的操作 id（首分子自指）；把句柄传给同一次
	 * 逻辑操作的各 commit 调用，它们的记录即关联为同一超分子。
	 * @returns {{ id: ?string }} 超分子句柄
	 */
	beginSupra() {
		return { id: null };
	}

	/**
	 * 提交增加对象分子操作
	 * @param {Object} effect - 效果摘要
	 * @param {string} effect.chunkId - 区块 id
	 * @param {string} effect.objectId - 对象 id
	 * @param {Object} effect.data - 对象全量内容（可 JSON 序列化）
	 * @param {string[]} effect.layerStackSnapshot - 操作时刻的完整层栈快照（z-order）
	 * @param {?{ id: ?string }} [effect.supra] - 超分子句柄
	 * @returns {import("./operation.js").OperationRecord} 分子操作记录
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
	 * @param {?{ id: ?string }} [effect.supra] - 超分子句柄
	 * @returns {import("./operation.js").OperationRecord} 分子操作记录
	 */
	commitModify(effect) {
		return this.#emit(createModifyObjectOperation, effect);
	}

	/**
	 * 提交删除对象分子操作
	 * @param {Object} effect - 效果摘要
	 * @param {string} effect.chunkId - 区块 id
	 * @param {string} effect.objectId - 对象 id
	 * @param {?{ id: ?string }} [effect.supra] - 超分子句柄
	 * @returns {import("./operation.js").OperationRecord} 分子操作记录
	 */
	commitDelete(effect) {
		return this.#emit(createDeleteObjectOperation, effect);
	}

	/**
	 * 提交选择对象分子操作
	 * @param {Object} effect - 效果摘要
	 * @param {string} effect.chunkId - 区块 id
	 * @param {string} effect.objectId - 对象 id
	 * @param {?{ id: ?string }} [effect.supra] - 超分子句柄
	 * @returns {import("./operation.js").OperationRecord} 分子操作记录
	 */
	commitChoose(effect) {
		return this.#emit(createChooseObjectOperation, effect);
	}

	/**
	 * 提交取消选择分子操作
	 * @param {Object} effect - 效果摘要
	 * @param {string} effect.chunkId - 区块 id
	 * @param {string} effect.objectId - 对象 id
	 * @param {?{ id: ?string }} [effect.supra] - 超分子句柄
	 * @returns {import("./operation.js").OperationRecord} 分子操作记录
	 */
	commitUnchoose(effect) {
		return this.#emit(createUnchooseObjectOperation, effect);
	}

	/**
	 * 统一的发射管线：构造记录、入日志、应用到树
	 * @param {(fields: Object) => import("./operation.js").OperationRecord} factory - 分子记录工厂
	 * @param {Object} effect - 效果摘要
	 * @returns {import("./operation.js").OperationRecord} 分子操作记录
	 * @throws {Error} 记录未通过日志准入校验时抛出
	 * @private
	 */
	#emit(factory, effect) {
		const id = this.#log.nextId(this.#source);
		const time = Math.max(this.#now(), this.#lastTime);
		this.#lastTime = time;
		const supra = effect.supra ?? null;
		const record = factory({
			...effect,
			id,
			source: this.#source,
			time,
			parentId: this.#tree.head.shareId,
			supraOpId: supra === null ? null : (supra.id ?? id),
		});
		if (supra !== null && supra.id === null) {
			supra.id = id;
		}
		const errors = this.#log.append(record);
		if (errors.length > 0) {
			throw new Error(errors.join("；"));
		}
		this.#tree.applyRecord(record);
		return record;
	}
}

export {
	HitCommitter,
};
