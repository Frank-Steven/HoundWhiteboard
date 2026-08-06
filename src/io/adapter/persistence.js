/**
 * @file 持久化适配器
 * @description 实现 kernel 的 PersistenceAdapter 契约（区块元数据 / 对象批量读写），底层经 IoDriver 执行。
 * @module io/adapter/persistence
 * @author Zhou Chenyu
 */

import { joinRel } from "../core/dsl.js";
import { bindRoot } from "../driver/io-driver.js";

/**
 * 创建持久化适配器
 * @param {Object} params - 参数
 * @param {import("../driver/io-driver.js").IoDriver} params.driver - IoDriver 实现
 * @param {string} params.rootId - 白板根目录 id
 * @returns {Object} PersistenceAdapter 契约实现
 *
 * @description
 * 存储布局：
 * - 区块元数据：{root}/chunks/{chunkId}.json，内容 { tierGraph, objectCoverIndex }
 * - 对象：{root}/objects/{objectId}.json，扁平存储每对象一文件
 */
export const createPersistenceAdapter = ({ driver, rootId }) => {
  /** @type {Object} 绑定 rootId 的驱动窄接口 */
  const d = bindRoot(driver, rootId);

  /**
   * 拼接区块元数据相对路径
   * @param {number} chunkId - 区块 id
   * @returns {string|null} 相对路径或 null
   */
  const chunkMetaRel = (chunkId) => {
    if (!Number.isInteger(chunkId)) return null;
    return joinRel("chunks", { __type: "File", name: String(chunkId), ext: "json" });
  };

  /**
   * 拼接对象相对路径
   * @param {number} objectId - 对象 id
   * @returns {string|null} 相对路径或 null
   */
  const objectRel = (objectId) => {
    if (!Number.isInteger(objectId)) return null;
    return joinRel("objects", { __type: "File", name: String(objectId), ext: "json" });
  };

  return {
    /**
     * 加载区块元数据
     * @param {number} chunkId - 区块 id
     * @returns {Promise<{tierGraph: any[], objectCoverIndex: any[]}>} 区块元数据
     */
    async loadChunkMetadata(chunkId) {
      const rel = chunkMetaRel(chunkId);
      if (rel === null) return { tierGraph: [], objectCoverIndex: [] };

      const content = await d.read(rel);
      if (content === null) return { tierGraph: [], objectCoverIndex: [] };

      try {
        const data = JSON.parse(content);
        return {
          tierGraph: Array.isArray(data?.tierGraph) ? data.tierGraph : [],
          objectCoverIndex: Array.isArray(data?.objectCoverIndex)
            ? data.objectCoverIndex
            : [],
        };
      } catch {
        return { tierGraph: [], objectCoverIndex: [] };
      }
    },

    /**
     * 保存区块元数据
     * @param {number} chunkId - 区块 id
     * @param {{tierGraph: any[], objectCoverIndex: any[]}} metadata - 区块元数据
     * @returns {Promise<boolean>} 是否成功
     */
    async saveChunkMetadata(chunkId, metadata) {
      const rel = chunkMetaRel(chunkId);
      if (rel === null || !metadata || !Array.isArray(metadata.tierGraph)) {
        return false;
      }

      const content = JSON.stringify({
        tierGraph: metadata.tierGraph,
        objectCoverIndex: Array.isArray(metadata.objectCoverIndex)
          ? metadata.objectCoverIndex
          : [],
      });

      return d.write(rel, content);
    },

    /**
     * 按对象 ID 批量加载对象 JSON
     * @param {number[]} objectIds - 对象 ID 数组
     * @returns {Promise<object[]>} 对象数组（跳过缺失对象）
     */
    async loadObjects(objectIds) {
      if (!Array.isArray(objectIds)) return [];

      const results = await Promise.all(
        objectIds.map(async (objectId) => {
          const rel = objectRel(objectId);
          if (rel === null) return null;
          const content = await d.read(rel);
          if (content === null) return null;
          try {
            return JSON.parse(content);
          } catch {
            return null;
          }
        })
      );

      return results.filter((obj) => obj !== null);
    },

    /**
     * 批量保存对象 JSON（扁平存储，每对象一文件）
     * @param {object[]} objects - 对象 plain object 数组，每项必须含数字 id
     * @returns {Promise<boolean>} 是否成功
     */
    async saveObjects(objects) {
      if (!Array.isArray(objects)) return false;

      const results = await Promise.all(
        objects.map(async (objectData) => {
          const rel = objectRel(objectData?.id);
          if (rel === null) return false;
          return d.write(rel, JSON.stringify(objectData));
        })
      );

      return results.every(Boolean);
    },

    /**
     * 删除对象 JSON
     * @param {number} objectId - 对象 id
     * @returns {Promise<boolean>} 是否成功
     */
    async deleteObject(objectId) {
      const rel = objectRel(objectId);
      if (rel === null) return false;
      return d.rm(rel);
    },
  };
};
