/**
 * @file Board API 类型定义
 * @description 定义 BoardApi 的共享 JSDoc typedef，约束同线程实现与 RPC 实现的统一签名。
 * @module kernel/types/board-api-types
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

/**
 * 对象修改 patch
 * @typedef {Object} ObjectPatch
 * @property {import("./types.js").Point2D} [position] - 新的绝对位置
 * @property {import("./types.js").TransformMatrix2D} [transform] - 新的变换矩阵
 * @property {Record<string, any>} [property] - 样式属性合并块
 * @property {Record<string, any>} [data] - 对象专属数据合并块
 */

/**
 * 创建对象参数
 * @typedef {Object} CreateObjectProps
 * @property {string} id - 显式 objectId（必填），由 UI 侧 id 池分配，供同步分配复用既有 id 分配逻辑
 * @property {import("./types.js").Point2D} position - 新对象位置
 * @property {import("./types.js").TransformMatrix2D} [transform] - 初始变换矩阵，缺省为恒等变换
 * @property {Record<string, any>} [property] - 初始样式属性
 * @property {Record<string, any>} [data] - 初始对象专属数据
 */

/**
 * 批量对象修改条目
 * @typedef {Object} ObjectPatchEntry
 * @property {string} objectId - 对象 id
 * @property {ObjectPatch} patch - 该对象的 patch
 */

/**
 * 创建 ViewportCore 的参数
 * @typedef {Object} CreateViewportOptions
 * @property {string | number} viewportId - viewport 标识
 * @property {number} width - 视口宽度
 * @property {number} height - 视口高度
 */

/**
 * BoardApi 接口摘要
 * @typedef {Object} BoardApi
 * @description
 * 两份实现共享同一方法签名与语义，本 typedef 以领域返回类型为准：
 * - kernel/api/board-api.js（直连）：同步方法直接返回结果，hitTest / eraseData 因区块加载返回 Promise。
 * - bridges/board-api-rpc.js（RPC）：所有方法返回 Promise，包裹下列返回类型。
 * 写路径分两层语义：modifyObject / appendListItem / replaceListItem / removeListItem
 * 在 RPC 实现中为 fire-and-forget 批写（入队即 resolve，失败经 onBatchError 旁路上报）；
 * 其余写方法为确认式（resolve 即 Core 已处理）。
 * createViewport / destroyViewport / createBoard / destroyBoard 属于 Worker 生命周期方法，
 * 仅由 RPC 实现与 CoreWorkerRuntime 提供，不属于本领域契约。
 * @property {(type: string, props: CreateObjectProps) => string} createObject - 创建对象并返回 objectId
 * @property {(objectId: string, patch: ObjectPatch) => void} modifyObject - 修改单个对象
 * @property {(patches: ObjectPatchEntry[]) => void} modifyObjects - 批量修改多个对象
 * @property {(objectId: string, key: string, items: any[]) => void} appendListItem - 追加列表属性元素
 * @property {(objectId: string, key: string, index: number, item: any) => void} replaceListItem - 替换列表属性元素
 * @property {(objectId: string, key: string, index: number) => void} removeListItem - 删除列表属性元素
 * @property {(objectIds: string[]) => void} deleteObjects - 删除对象集合
 * @property {(objectIds: string[]) => string[]} commitObjects - 提交活动对象集合，返回实际提交的对象 id
 * @property {(objectIds: string[]) => void} addActiveObjects - 将对象加入 AOM
 * @property {(objectIds: string[]) => void} discardActiveObjects - 将对象从 AOM 丢弃
 * @property {(ids: string[]) => import("./types.js").ObjectSummary[]} queryObjects - 按 id 查询对象摘要
 * @property {(chunkIds: number[]) => string[]} queryChunkObjects - 按区块查询对象 id
 * @property {(range: import("../range/range.js").Range | import("./types.js").Rect, mode?: string) => Promise<string[]>} hitTest - 执行命中查询
 * @property {(payload: { points: import("./types.js").Point2D[], radius: number, source?: string }) => Promise<{ modified: string[], created: string[], deleted: string[] }>} eraseData - 按橡皮轨迹擦除命中对象的数据
 * @property {(targetNodeId?: string) => { undone: boolean, targetNodeId: ?string, forcedEndMolIds: string[] }} undo - 执行撤销（自动闭合本端未闭合分子）
 * @property {() => { redone: boolean, targetNodeId: ?string }} redo - 执行重做
 * @property {(key: string) => void} beginSupra - 开启一个超分子
 * @property {(key: string) => void} endSupra - 闭合一个超分子（先闭合其下未闭合分子，再追加 close-supra 记录）
 * @property {(key: string) => void} abortSupra - 中止一个超分子（丢弃未闭合分子并逐个撤销已物化成员）
 * @property {(objectIds: string[], options?: { supraKey?: string, create?: boolean }) => string} beginMol - 开启增量式分子（捕获 before 快照），返回 molId
 * @property {(molId: string, patchesByObject: Object<string, ObjectPatch>) => boolean} amendMol - 对进行中的分子施加增量修正（RPC 实现中为 fire-and-forget 批写）
 * @property {(molId: string) => boolean} endMol - 定稿增量式分子（物化上链）
 * @property {(molId: string) => boolean} abortMol - 中止增量式分子（丢弃 amend 流并还原实例）
 * @property {() => Array<Object>} queryOpenMols - 查询本端未闭合的增量式分子清单
 */

export { };
