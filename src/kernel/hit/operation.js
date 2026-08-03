/**
 * @file 操作记录定义
 * @description 定义 hit 的分子操作记录模型：八种分子类型、公共属性与载荷结构、校验与排序辅助。
 * @module kernel/hit/operation
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

/**
 * 分子操作类型
 * @typedef {"add-object" | "modify-object" | "delete-object" | "choose-object" | "unchoose-object" | "move-head" | "undo" | "redo"} OperationType
 */

/**
 * 分子操作按对 hit 的作用分类
 * @typedef {"append-node" | "move-head" | "reattach"} OperationEffectKind
 */

/**
 * 分子操作类型常量
 * @readonly
 * @type {Readonly<Object<string, OperationType>>}
 */
const OPERATION_TYPES = Object.freeze({
	ADD_OBJECT: "add-object",
	MODIFY_OBJECT: "modify-object",
	DELETE_OBJECT: "delete-object",
	CHOOSE_OBJECT: "choose-object",
	UNCHOOSE_OBJECT: "unchoose-object",
	MOVE_HEAD: "move-head",
	UNDO: "undo",
	REDO: "redo",
});

/**
 * 作用类别常量
 * @readonly
 * @type {Readonly<Object<string, OperationEffectKind>>}
 */
const OPERATION_EFFECT_KINDS = Object.freeze({
	APPEND_NODE: "append-node",
	MOVE_HEAD: "move-head",
	REATTACH: "reattach",
});

/**
 * 对象级操作类型：效果落在白板文档状态上，可被撤消操作抵消
 * @type {Readonly<OperationType[]>}
 */
const WHITEBOARD_OPERATION_TYPES = Object.freeze([
	OPERATION_TYPES.ADD_OBJECT,
	OPERATION_TYPES.MODIFY_OBJECT,
	OPERATION_TYPES.DELETE_OBJECT,
	OPERATION_TYPES.CHOOSE_OBJECT,
	OPERATION_TYPES.UNCHOOSE_OBJECT,
]);

/**
 * 树级操作类型：效果落在树的结构与指针上
 * @type {Readonly<OperationType[]>}
 */
const TREE_OPERATION_TYPES = Object.freeze([
	OPERATION_TYPES.MOVE_HEAD,
	OPERATION_TYPES.UNDO,
	OPERATION_TYPES.REDO,
]);

/**
 * 各操作类型对 hit 的作用类别
 * @type {Readonly<Object<OperationType, OperationEffectKind>>}
 */
const EFFECT_KIND_OF_TYPE = Object.freeze({
	[OPERATION_TYPES.ADD_OBJECT]: OPERATION_EFFECT_KINDS.APPEND_NODE,
	[OPERATION_TYPES.MODIFY_OBJECT]: OPERATION_EFFECT_KINDS.APPEND_NODE,
	[OPERATION_TYPES.DELETE_OBJECT]: OPERATION_EFFECT_KINDS.APPEND_NODE,
	[OPERATION_TYPES.CHOOSE_OBJECT]: OPERATION_EFFECT_KINDS.APPEND_NODE,
	[OPERATION_TYPES.UNCHOOSE_OBJECT]: OPERATION_EFFECT_KINDS.APPEND_NODE,
	[OPERATION_TYPES.MOVE_HEAD]: OPERATION_EFFECT_KINDS.MOVE_HEAD,
	[OPERATION_TYPES.UNDO]: OPERATION_EFFECT_KINDS.REATTACH,
	[OPERATION_TYPES.REDO]: OPERATION_EFFECT_KINDS.MOVE_HEAD,
});

/**
 * 分子操作记录
 * @typedef {Object} OperationRecord
 * @property {string} id - 操作 id，形如 `"{source}/op-{n}"`
 * @property {OperationType} type - 分子操作类型
 * @property {string} source - 发起者标识，即 hit 节点的 author
 * @property {number} time - 毫秒时间标记（unix 纪元），操作级 CRDT 重建的排序依据
 * @property {?string} parentId - 记录时刻本地视角的父节点 id；首个操作为 null
 * @property {?string} supraOpId - 所属超分子操作的 id；独立分子操作为 null
 * @property {string[]} properties - 涉及属性的集合（如 `position`、`property`、`data.points`），冲突合并的判定粒度
 * @property {Object} payload - 类型载荷，结构由 type 决定
 */

/**
 * 查询操作类型对 hit 的作用类别
 * @param {OperationType} type - 分子操作类型
 * @returns {?OperationEffectKind} 作用类别；未知类型返回 null
 */
function getOperationEffectKind(type) {
	return EFFECT_KIND_OF_TYPE[type] ?? null;
}

/**
 * 构造操作 id
 * @param {string} source - 发起者标识
 * @param {number} n - 该发起者的操作序号
 * @returns {string} 操作 id，形如 `"{source}/op-{n}"`
 */
function makeOperationId(source, n) {
	return `${source}/op-${n}`;
}

/**
 * 解析操作 id
 * @param {string} id - 操作 id
 * @returns {?{ source: string, n: number }} 解析结果；id 形如 `"{source}/op-{n}"` 以外时返回 null
 */
function parseOperationId(id) {
	if (typeof id !== "string") {
		return null;
	}
	const match = /^(.+)\/op-(\d+)$/.exec(id);
	if (match === null) {
		return null;
	}
	return { source: match[1], n: Number(match[2]) };
}

/**
 * 比较两条记录的时间标记（时钟环：毫秒数，相同毫秒按 author 字典序）
 * @param {OperationRecord} a - 记录 a
 * @param {OperationRecord} b - 记录 b
 * @returns {number} a 排在 b 前为负，相等为 0，a 排在 b 后为正
 */
function compareTimeMarks(a, b) {
	if (a.time !== b.time) {
		return a.time - b.time;
	}
	if (a.source === b.source) {
		return 0;
	}
	return a.source < b.source ? -1 : 1;
}

/**
 * 构造分子操作记录的公共属性
 * @param {Object} fields - 公共属性
 * @param {string} fields.id - 操作 id
 * @param {OperationType} fields.type - 分子操作类型
 * @param {string} fields.source - 发起者标识
 * @param {number} fields.time - 毫秒时间标记
 * @param {?string} [fields.parentId] - 记录时刻本地视角的父节点 id
 * @param {?string} [fields.supraOpId] - 所属超分子操作的 id
 * @param {string[]} [fields.properties] - 涉及属性的集合
 * @param {Object} payload - 类型载荷
 * @returns {OperationRecord} 分子操作记录
 * @private
 */
function _buildRecord(fields, payload) {
	return {
		id: fields.id,
		type: fields.type,
		source: fields.source,
		time: fields.time,
		parentId: fields.parentId ?? null,
		supraOpId: fields.supraOpId ?? null,
		properties: fields.properties ?? [],
		payload,
	};
}

/**
 * 构造增加对象操作记录
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @param {string} fields.chunkId - 区块 id
 * @param {string} fields.objectId - 对象 id
 * @param {Object} fields.data - 对象全量内容（可 JSON 序列化）
 * @param {string[]} fields.layerStackSnapshot - 操作时刻的完整层栈快照（z-order）
 * @returns {OperationRecord} 增加对象操作记录
 */
function createAddObjectOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.ADD_OBJECT }, {
		chunkId: fields.chunkId,
		objectId: fields.objectId,
		data: fields.data,
		layerStackSnapshot: fields.layerStackSnapshot,
	});
}

/**
 * 构造修改对象操作记录
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields；properties 承载涉及属性集合
 * @param {string} fields.chunkId - 区块 id
 * @param {string} fields.objectId - 对象 id
 * @param {Object} fields.before - 修改前快照，undo 用前快照回退（可 JSON 序列化）
 * @param {Object} fields.after - 修改后快照，协作用后快照传播（可 JSON 序列化）
 * @param {string[]} fields.layerStackSnapshot - 操作时刻的完整层栈快照（z-order）
 * @returns {OperationRecord} 修改对象操作记录
 */
function createModifyObjectOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.MODIFY_OBJECT }, {
		chunkId: fields.chunkId,
		objectId: fields.objectId,
		before: fields.before,
		after: fields.after,
		layerStackSnapshot: fields.layerStackSnapshot,
	});
}

/**
 * 构造删除对象操作记录
 * @description 对象本体由 commit 边界移入 history/trash/，记录只携带定位信息。
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @param {string} fields.chunkId - 区块 id
 * @param {string} fields.objectId - 对象 id
 * @returns {OperationRecord} 删除对象操作记录
 */
function createDeleteObjectOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.DELETE_OBJECT }, {
		chunkId: fields.chunkId,
		objectId: fields.objectId,
	});
}

/**
 * 构造选择对象操作记录
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @param {string} fields.chunkId - 区块 id
 * @param {string} fields.objectId - 对象 id
 * @returns {OperationRecord} 选择对象操作记录
 */
function createChooseObjectOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.CHOOSE_OBJECT }, {
		chunkId: fields.chunkId,
		objectId: fields.objectId,
	});
}

/**
 * 构造取消选择操作记录
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @param {string} fields.chunkId - 区块 id
 * @param {string} fields.objectId - 对象 id
 * @returns {OperationRecord} 取消选择操作记录
 */
function createUnchooseObjectOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.UNCHOOSE_OBJECT }, {
		chunkId: fields.chunkId,
		objectId: fields.objectId,
	});
}

/**
 * 构造更改 HEAD 指针操作记录
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @param {string} fields.targetNodeId - HEAD 移动的目标节点 id
 * @returns {OperationRecord} 更改 HEAD 指针操作记录
 */
function createMoveHeadOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.MOVE_HEAD }, {
		targetNodeId: fields.targetNodeId,
	});
}

/**
 * 构造撤销操作记录
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @param {string} fields.targetNodeId - 撤消操作的目标节点 id（缺省为活动链末端，由调用方解析后记录）
 * @param {string} fields.previousHeadId - 撤销前的 HEAD 位置，重做的移动目标
 * @returns {OperationRecord} 撤销操作记录
 */
function createUndoOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.UNDO }, {
		targetNodeId: fields.targetNodeId,
		previousHeadId: fields.previousHeadId,
	});
}

/**
 * 构造重做操作记录
 * @description 重做的移动目标由最近一次生效撤销的记录派生，自身不携带目标。
 * @param {Object} fields - 公共属性，同 _buildRecord 的 fields
 * @returns {OperationRecord} 重做操作记录
 */
function createRedoOperation(fields) {
	return _buildRecord({ ...fields, type: OPERATION_TYPES.REDO }, {});
}

/**
 * 校验分子操作记录
 * @param {*} record - 待校验的记录
 * @returns {string[]} 错误列表；空数组表示记录合法
 */
function validateOperation(record) {
	const errors = [];
	if (record === null || typeof record !== "object") {
		return ["记录必须是对象"];
	}
	const idParts = parseOperationId(record.id);
	if (idParts === null) {
		errors.push(`id 形如 "{source}/op-{n}"：${String(record.id)}`);
	}
	if (typeof record.source !== "string" || record.source.length === 0) {
		errors.push("source 必须是非空字符串");
	} else if (idParts !== null && idParts.source !== record.source) {
		errors.push(`id 的 source 段（${idParts.source}）与 source（${record.source}）不一致`);
	}
	if (!Object.values(OPERATION_TYPES).includes(record.type)) {
		errors.push(`未知操作类型：${String(record.type)}`);
	}
	if (typeof record.time !== "number" || !Number.isFinite(record.time)) {
		errors.push("time 必须是有限数值");
	}
	if (record.parentId !== null && parseOperationId(record.parentId) === null) {
		errors.push(`parentId 非法：${String(record.parentId)}`);
	}
	if (record.supraOpId !== null && parseOperationId(record.supraOpId) === null) {
		errors.push(`supraOpId 非法：${String(record.supraOpId)}`);
	}
	if (
		record.supraOpId !== null &&
		getOperationEffectKind(record.type) !== OPERATION_EFFECT_KINDS.APPEND_NODE
	) {
		errors.push("仅增加节点类操作可属于超分子操作");
	}
	if (!Array.isArray(record.properties) || record.properties.some((p) => typeof p !== "string")) {
		errors.push("properties 必须是字符串数组");
	}
	if (record.payload === null || typeof record.payload !== "object") {
		errors.push("payload 必须是对象");
		return errors;
	}
	_validatePayload(record, errors);
	return errors;
}

/**
 * 校验记录的载荷
 * @param {OperationRecord} record - 分子操作记录
 * @param {string[]} errors - 错误收集列表
 * @private
 */
function _validatePayload(record, errors) {
	const { type, payload } = record;
	/**
	 * 校验字符串字段
	 * @param {string} key - 字段名
	 * @returns {void}
	 */
	const requireString = (key) => {
		if (typeof payload[key] !== "string" || payload[key].length === 0) {
			errors.push(`${type} 载荷的 ${key} 必须是非空字符串`);
		}
	};
	/**
	 * 校验节点 id 字段
	 * @param {string} key - 字段名
	 * @returns {void}
	 */
	const requireNodeId = (key) => {
		if (parseOperationId(payload[key]) === null) {
			errors.push(`${type} 载荷的 ${key} 非法：${String(payload[key])}`);
		}
	};
	switch (type) {
		case OPERATION_TYPES.ADD_OBJECT:
			requireString("chunkId");
			requireString("objectId");
			if (payload.data === undefined) {
				errors.push("add-object 载荷缺 data");
			}
			_validateLayerStackSnapshot(payload, errors);
			break;
		case OPERATION_TYPES.MODIFY_OBJECT:
			requireString("chunkId");
			requireString("objectId");
			if (payload.before === undefined || payload.after === undefined) {
				errors.push("modify-object 载荷缺 before/after 快照");
			}
			_validateLayerStackSnapshot(payload, errors);
			break;
		case OPERATION_TYPES.DELETE_OBJECT:
		case OPERATION_TYPES.CHOOSE_OBJECT:
		case OPERATION_TYPES.UNCHOOSE_OBJECT:
			requireString("chunkId");
			requireString("objectId");
			break;
		case OPERATION_TYPES.MOVE_HEAD:
			requireNodeId("targetNodeId");
			break;
		case OPERATION_TYPES.UNDO:
			requireNodeId("targetNodeId");
			requireNodeId("previousHeadId");
			break;
		case OPERATION_TYPES.REDO:
			break;
		default:
			break;
	}
}

/**
 * 校验层栈快照字段
 * @param {Object} payload - 类型载荷
 * @param {string[]} errors - 错误收集列表
 * @private
 */
function _validateLayerStackSnapshot(payload, errors) {
	if (!Array.isArray(payload.layerStackSnapshot) || payload.layerStackSnapshot.some((id) => typeof id !== "string")) {
		errors.push("layerStackSnapshot 必须是字符串数组");
	}
}

export {
	OPERATION_TYPES,
	OPERATION_EFFECT_KINDS,
	WHITEBOARD_OPERATION_TYPES,
	TREE_OPERATION_TYPES,
	getOperationEffectKind,
	makeOperationId,
	parseOperationId,
	compareTimeMarks,
	createAddObjectOperation,
	createModifyObjectOperation,
	createDeleteObjectOperation,
	createChooseObjectOperation,
	createUnchooseObjectOperation,
	createMoveHeadOperation,
	createUndoOperation,
	createRedoOperation,
	validateOperation,
};
