/**
 * @file DAG 内部工具函数
 * @description
 * 设备图内部使用的纯工具函数，包括类型判断和处理器返回值规整。
 *
 * 这些函数不持有状态，不依赖 DevicesDAG 实例。
 * `isPlainObject` 是多个模块共用的基础判断，
 * `normalizeHandlerResult` 将 handler 的各种返回形式统一为
 * `{ packets, explicitPackets, ... }` 结构。
 * @module ui/devices-dag/dag-core/dag-utils
 * @author Zhou Chenyu
 */

import { SignalPacket } from "./signal.js";

/**
 * 判断值是否为纯对象
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * 判断一个值是否满足 SubDAGDefinition 的结构约定
 * @description
 * 用于 `mountWorkflow` 中区分 Tool 实例和结构化子图定义。
 * 检查项：`nodes` 为 Map、`edges` 为数组、`rootNodeId` 为数字。
 * @param {any} value - 待判断值
 * @returns {boolean} 满足子图定义结构则返回 true
 */
function isSubDAGDefinition(value) {
  return (
    isPlainObject(value) &&
    value.nodes instanceof Map &&
    Array.isArray(value.edges) &&
    typeof value.rootNodeId === "number"
  );
}

/**
 * 将 handler 的原始返回值规整为标准结果结构。
 *
 * handler 可以返回多种形式：单个 SignalPacket、SignalPacket 数组、
 * 带有路由指令的对象、`undefined` 等。此函数统一转换为
 * `{ packets: SignalPacket[], explicitPackets: boolean, ... }` 结构。
 *
 * @param {*} rawResult - handler 的原始返回值
 * @param {{ defaultTo?: string }} [options={}] - 规整选项
 * @param {string} [options.defaultTo] - 信号包缺省 to 字段值
 * @returns {import("../dag-type.js").DevicesDAGHandlerResult} 标准结果结构
 */
function normalizeHandlerResult(rawResult, options = {}) {
  if (
    isPlainObject(rawResult) &&
    (Array.isArray(rawResult.packets) ||
      "stop" in rawResult ||
      "redirect" in rawResult)
  ) {
    return {
      ...rawResult,
      packets: SignalPacket.normalizeResult(rawResult.packets ?? [], options),
      explicitPackets: Object.prototype.hasOwnProperty.call(
        rawResult,
        "packets",
      ),
    };
  }

  if (rawResult === undefined || rawResult === null) {
    return { packets: [], explicitPackets: false };
  }

  if (Array.isArray(rawResult)) {
    const packets = [];
    for (const item of rawResult) {
      if (
        isPlainObject(item) &&
        (Array.isArray(item.packets) ||
          "stop" in item ||
          "redirect" in item)
      ) {
        packets.push(
          ...SignalPacket.normalizeResult(item.packets ?? [], options),
        );
      } else {
        packets.push(SignalPacket.from(item, options));
      }
    }
    return { packets, explicitPackets: true };
  }

  return {
    packets: SignalPacket.normalizeResult(rawResult, options),
    explicitPackets: true,
  };
}

export { isPlainObject, isSubDAGDefinition, normalizeHandlerResult };

/**
 * 判断 target 是否已能沿出边到达 source（DFS）
 * @description
 * 用于新增边前的环检查：target 可达 source 时，新增 source→target 会产生环。
 * 纯函数，仅依赖节点的 outEdges 结构，不持有 DAG 实例状态。
 * @param {Object} source - 源节点（鸭式类型，需含 id 与 outEdges）
 * @param {Object} target - 目标节点
 * @returns {boolean} target 可达 source 则为 true
 */
function wouldCreateCycle(source, target) {
  if (source === target) return true;
  const visited = new Set();
  const stack = [target];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === source) return true;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    for (const edge of node.outEdges.values()) {
      stack.push(edge.target);
    }
  }
  return false;
}

/**
 * 将子图节点定义应用到节点（共享实现）
 * @description
 * 应用 handler / semantics / services / defaultRoute / umount / toolContext 字段，
 * 并把 `def.tool` 转为 processor handler（不含 DAG 特有的 tool 注册与钩子链）。
 * `DevicesDAG#_applyNodeDefinition`（挂载路径）与 `DevicesDAGNode.createGraph`（独立图路径）
 * 共用本实现，保证两条路径行为一致。
 * @param {Object} node - 目标节点（鸭式类型：handler/semantics/services/defaultRoute/umount 字段可写）
 * @param {import("../dag-type.js").SubDAGNodeDefinition} def - 子图节点定义
 * @returns {{ tool: Object, processor: Function }|null} tool 处理结果（无 tool 时返回 null）
 */
function applyNodeDefinitionToNode(node, def) {
  if (!def) return null;

  if (def.handler != null) {
    node.handler = typeof def.handler === "function" ? def.handler : null;
  }
  if (isPlainObject(def.semantics)) {
    node.semantics = { ...node.semantics, ...def.semantics };
  }
  if (isPlainObject(def.services)) {
    node.services = { ...node.services, ...def.services };
  }
  if (typeof def.defaultRoute === "string") {
    node.defaultRoute = def.defaultRoute;
  }
  if (def.umount != null) {
    node.umount = typeof def.umount === "function" ? def.umount : null;
  }
  if (
    isPlainObject(def.toolContext) &&
    Object.keys(def.toolContext).length > 0
  ) {
    node.semantics = { ...node.semantics, toolContext: def.toolContext };
  }

  if (def.tool) {
    const processor = def.tool.createProcessor();
    node.handler = processor;
    node.semantics = { ...node.semantics, tool: true };
    return { tool: def.tool, processor };
  }
  return null;
}

export { wouldCreateCycle, applyNodeDefinitionToNode };
