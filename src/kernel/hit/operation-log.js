/**
 * @file 操作日志
 * @description hit 的 append-only 操作日志：id 分配与连续性把关、准入校验、全序视图与序列化。
 * @module kernel/hit/operation-log
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import {
	makeOperationId,
	parseOperationId,
	compareTimeMarks,
	validateOperation,
} from "./operation.js";

/**
 * 操作日志
 * @description
 * hit 的 append-only 操作日志，全量分子操作记录的权威载体：树与 HEAD 均由日志派生。
 * 日志只增不删；追加时校验记录，并把守各 source 的 id 序号连续递增（自增 id 即日志顺序）。
 * @class
 * @author Zhou Chenyu
 */
class OperationLog {
	/**
	 * 按追加序存放的记录
	 * @type {import("./operation.js").OperationRecord[]}
	 */
	#records = [];

	/**
	 * id 索引
	 * @type {Map<string, import("./operation.js").OperationRecord>}
	 */
	#byId = new Map();

	/**
	 * 各 source 的下一个操作序号
	 * @type {Map<string, number>}
	 */
	#nextSeq = new Map();

	/**
	 * 记录条数
	 * @type {number}
	 */
	get size() {
		return this.#records.length;
	}

	/**
	 * 分配某 source 的下一个操作 id
	 * @param {string} source - 发起者标识
	 * @returns {string} 操作 id，形如 `"{source}/op-{n}"`
	 */
	nextId(source) {
		return makeOperationId(source, this.#nextSeq.get(source) ?? 1);
	}

	/**
	 * 追加一条记录
	 * @description 记录须通过 validateOperation 校验，且 id 序号恰为该 source 的下一个序号；追加失败时日志保持不变。
	 * @param {import("./operation.js").OperationRecord} record - 分子操作记录
	 * @returns {string[]} 错误列表；空数组表示追加成功
	 */
	append(record) {
		const errors = validateOperation(record);
		if (errors.length > 0) {
			return errors;
		}
		const expected = this.#nextSeq.get(record.source) ?? 1;
		const actual = parseOperationId(record.id).n;
		if (actual !== expected) {
			return [`id 序号不连续：期望 ${makeOperationId(record.source, expected)}，实际 ${record.id}`];
		}
		this.#records.push(record);
		this.#byId.set(record.id, record);
		this.#nextSeq.set(record.source, expected + 1);
		return [];
	}

	/**
	 * 按 id 查找记录
	 * @param {string} id - 操作 id
	 * @returns {?import("./operation.js").OperationRecord} 记录；不存在时为 null
	 */
	get(id) {
		return this.#byId.get(id) ?? null;
	}

	/**
	 * 判断日志是否含有某 id 的记录
	 * @param {string} id - 操作 id
	 * @returns {boolean} 是否含有
	 */
	has(id) {
		return this.#byId.has(id);
	}

	/**
	 * 按追加序导出全部记录
	 * @returns {import("./operation.js").OperationRecord[]} 记录数组的副本
	 */
	toArray() {
		return [...this.#records];
	}

	/**
	 * 按时间标记（时钟环）全序导出全部记录，日志重放的顺序依据
	 * @returns {import("./operation.js").OperationRecord[]} 全序记录数组
	 */
	toSortedArray() {
		return [...this.#records].sort(compareTimeMarks);
	}

	/**
	 * 序列化为 JSON（记录数组）
	 * @returns {import("./operation.js").OperationRecord[]} 记录数组
	 */
	toJSON() {
		return this.toArray();
	}

	/**
	 * 从序列化数据重建日志
	 * @param {*} json - toJSON 产出的记录数组
	 * @returns {OperationLog} 重建的日志
	 * @throws {Error} 数据非法或序号不连续时抛出，错误信息合并全部失败条目
	 */
	static fromJSON(json) {
		const log = new OperationLog();
		const list = Array.isArray(json) ? json : [];
		const errors = [];
		for (const record of list) {
			errors.push(...log.append(record));
		}
		if (!Array.isArray(json)) {
			errors.push("序列化数据必须是记录数组");
		}
		if (errors.length > 0) {
			throw new Error(errors.join("；"));
		}
		return log;
	}
}

export {
	OperationLog,
};
