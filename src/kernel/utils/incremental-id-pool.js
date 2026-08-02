/**
 * @file 递增 id 池
 * @description 提供带来源命名空间的递增 id 分配。
 * @module kernel/utils/incremental-id-pool
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

import { CounterPool } from "./counter-pool.js";

/**
 * 递增 id 池
 * @class
 * @description
 * 包装 CounterPool，allocate 时把来源标识拼进字符串 id。
 * 来源标识用于区分 id 的分配方（如不同用户、UI 侧与 Core 侧），
 * 使各方独立分配而互不冲突。
 * @author Zhou Chenyu
 */
class IncrementalIdPool {
  /**
   * 来源标识，空串表示无来源
   * @type {string}
   */
  source;

  /**
   * 内部计数器池
   * @type {CounterPool}
   * @private
   */
  #counterPool;

  /**
   * @param {string} [source=""] - 来源标识
   * @param {number} [start=0] - 起始计数
   * @constructor
   */
  constructor(source = "", start = 0) {
    this.source = source;
    this.#counterPool = new CounterPool(start);
  }

  /**
   * 申请下一个 id
   * @returns {string} source 非空时为 `${source}/${n}`，为空时为 `${n}`
   */
  allocate() {
    const next = this.#counterPool.generate();
    return this.source ? `${this.source}/${next}` : `${next}`;
  }
}

export { IncrementalIdPool };
