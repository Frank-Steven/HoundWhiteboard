/**
 * @file 会话存储
 * @description 白板会话的存储布局语义：板元数据、对象快照、trash 留存与操作日志段文件的读写编排，仅依赖注入的 SessionDriver。
 * @module kernel/store/session-store
 * @author Zhou Chenyu
 * SPDX-License-Identifier: MIT
 */

/**
 * 会话驱动
 * @description
 * 内核会话存储的最小文件操作接口（结构化契约，kernel 不依赖具体实现）。
 * io 包的 bindRoot 输出天然满足该结构；memory/node/tauri 驱动经绑定后均可注入。
 * 所有方法不抛业务错误：失败返回 null/false/[]。
 * @typedef {Object} SessionDriver
 * @property {(relPath: string) => Promise<string|null>} read - 读取文件内容（utf8）
 * @property {(relPath: string, content: string) => Promise<boolean>} write - 写入文件内容
 * @property {(relPath: string) => Promise<Array<{name: string, isDir: boolean, isFile: boolean}>>} ls - 列出目录条目
 * @property {(relPath: string) => Promise<boolean>} exists - 检查路径是否存在
 * @property {(relPath: string) => Promise<boolean>} rm - 删除文件或目录
 * @property {(srcRel: string, destRel: string) => Promise<boolean>} mv - 移动文件或目录
 * @property {(relPath: string) => Promise<boolean>} mkdir - 创建目录
 */

/** 板文件格式版本 */
const FORMAT_VERSION = 1;

/** 板元数据文件名 */
const BOARD_META_FILE = "board.json";

/** 活动对象目录名 */
const OBJECTS_DIR = "objects";

/** trash 目录名 */
const TRASH_DIR = "trash";

/** 操作日志目录名 */
const HIT_DIR = "hit";

/** 区块元数据目录名 */
const CHUNKS_DIR = "chunks";

/** 日志段文件名前缀 */
const SEGMENT_PREFIX = "seg-";

/** 日志段文件名后缀 */
const SEGMENT_EXT = ".jsonl";

/** 日志段序号的十进制宽度 */
const SEGMENT_SEQ_WIDTH = 6;

/**
 * 对象 id 编码为文件名
 * @param {string} objectId - 对象 id
 * @returns {string} 文件名（含 .json 后缀）
 *
 * @description
 * 对象 id 含「/」（如 demo/1），需编码后方可作为文件名单段使用。
 */
function encodeObjectFileName(objectId) {
  return `${encodeURIComponent(objectId)}.json`;
}

/**
 * 文件名解码为对象 id
 * @param {string} fileName - 文件名（含 .json 后缀）
 * @returns {string|null} 对象 id，文件名不合法时为 null
 */
function decodeObjectFileName(fileName) {
  if (typeof fileName !== "string" || !fileName.endsWith(".json")) return null;
  try {
    return decodeURIComponent(fileName.slice(0, -".json".length));
  } catch {
    return null;
  }
}

/**
 * 日志段序号编码为文件名
 * @param {number} seq - 段序号（非负整数）
 * @returns {string} 段文件名
 */
function segmentFileName(seq) {
  return `${SEGMENT_PREFIX}${String(seq).padStart(SEGMENT_SEQ_WIDTH, "0")}${SEGMENT_EXT}`;
}

/**
 * 日志段文件名解析为序号
 * @param {string} fileName - 文件名
 * @returns {number|null} 段序号，文件名不合法时为 null
 */
function parseSegmentSeq(fileName) {
  if (
    typeof fileName !== "string" ||
    !fileName.startsWith(SEGMENT_PREFIX) ||
    !fileName.endsWith(SEGMENT_EXT)
  ) {
    return null;
  }
  const body = fileName.slice(
    SEGMENT_PREFIX.length,
    fileName.length - SEGMENT_EXT.length,
  );
  if (!/^\d+$/.test(body)) return null;
  return Number(body);
}

/**
 * 安全解析 JSON 文本
 * @param {string|null} content - JSON 文本
 * @returns {*} 解析结果，失败为 null
 */
function parseJson(content) {
  if (typeof content !== "string" || content.length === 0) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 创建会话存储
 * @param {SessionDriver} driver - 注入的会话驱动（已绑定白板根目录）
 * @returns {Object} 会话存储操作面
 *
 * @description
 * 布局 v1：board.json（板元数据）、objects/{id}.json（活动对象快照）、
 * trash/{id}.json（trash 条目，含层位边）、chunks/{chunkId}.json（区块层叠图与覆盖索引）、
 * hit/seg-{NNNNNN}.jsonl（操作日志段，一行一条记录）。
 */
function createSessionStore(driver) {
  /**
   * 读取目录下全部对象数据
   * @param {string} dir - 目录相对路径
   * @returns {Promise<Object[]>} 对象数据数组（跳过缺失与损坏文件）
   */
  const readAllObjectsIn = async (dir) => {
    const entries = await driver.ls(dir);
    const files = entries
      .filter((entry) => entry.isFile)
      .map((entry) => entry.name)
      .filter((name) => decodeObjectFileName(name) !== null);
    const objects = await Promise.all(
      files.map(async (name) => {
        const data = parseJson(await driver.read(`${dir}/${name}`));
        return data && typeof data === "object" ? data : null;
      }),
    );
    return objects.filter((data) => data !== null);
  };

  return {
    /**
     * 检查白板文件是否存在
     * @returns {Promise<boolean>} board.json 是否存在
     */
    async exists() {
      return driver.exists(BOARD_META_FILE);
    },

    /**
     * 创建白板目录骨架
     * @param {Object} [meta={}] - 初始板元数据（并入骨架）
     * @returns {Promise<boolean>} 是否成功
     *
     * @description
     * 幂等：目录与元数据文件已存在时不覆盖已有元数据。
     */
    async create(meta = {}) {
      if (await driver.exists(BOARD_META_FILE)) return true;
      const dirsReady = await Promise.all([
        driver.mkdir(OBJECTS_DIR),
        driver.mkdir(TRASH_DIR),
        driver.mkdir(HIT_DIR),
        driver.mkdir(CHUNKS_DIR),
      ]);
      if (!dirsReady.every(Boolean)) return false;
      return driver.write(
        BOARD_META_FILE,
        JSON.stringify({ formatVersion: FORMAT_VERSION, ...meta }),
      );
    },

    /**
     * 读取板元数据
     * @returns {Promise<Object|null>} 板元数据，缺失或损坏时为 null
     */
    async readMeta() {
      const meta = parseJson(await driver.read(BOARD_META_FILE));
      return meta && typeof meta === "object" ? meta : null;
    },

    /**
     * 重写板元数据
     * @param {Object} meta - 板元数据
     * @returns {Promise<boolean>} 是否成功
     */
    async writeMeta(meta) {
      if (!meta || typeof meta !== "object") return false;
      return driver.write(
        BOARD_META_FILE,
        JSON.stringify({ formatVersion: FORMAT_VERSION, ...meta }),
      );
    },

    /**
     * 追加一段操作日志段
     * @param {number} seq - 段序号（单调递增，由调用方维护）
     * @param {Object[]} records - 操作记录数组
     * @returns {Promise<boolean>} 是否成功
     *
     * @description
     * 段内容为 JSONL：一行一条序列化记录。
     */
    async appendSegment(seq, records) {
      if (!Number.isInteger(seq) || seq < 0 || !Array.isArray(records)) {
        return false;
      }
      if (records.length === 0) return true;
      const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
      return driver.write(`${HIT_DIR}/${segmentFileName(seq)}`, content);
    },

    /**
     * 读取全部操作记录
     * @returns {Promise<{records: Object[], nextSegmentSeq: number}>} 按段序拼接的记录数组与下一个可用段序号
     *
     * @description
     * 段按文件名序号升序拼接；损坏的段内行跳过。
     */
    async readAllRecords() {
      const entries = await driver.ls(HIT_DIR);
      const segments = entries
        .filter((entry) => entry.isFile)
        .map((entry) => ({ name: entry.name, seq: parseSegmentSeq(entry.name) }))
        .filter((seg) => seg.seq !== null)
        .sort((a, b) => a.seq - b.seq);
      const records = [];
      for (const seg of segments) {
        const content = await driver.read(`${HIT_DIR}/${seg.name}`);
        if (typeof content !== "string") continue;
        for (const line of content.split("\n")) {
          const record = parseJson(line);
          if (record && typeof record === "object") records.push(record);
        }
      }
      const nextSegmentSeq =
        segments.length === 0 ? 0 : segments[segments.length - 1].seq + 1;
      return { records, nextSegmentSeq };
    },

    /**
     * 写入活动对象快照
     * @param {Object} objectData - 对象序列化数据（必须含字符串 id）
     * @returns {Promise<boolean>} 是否成功
     */
    async writeObject(objectData) {
      if (!objectData || typeof objectData.id !== "string") return false;
      return driver.write(
        `${OBJECTS_DIR}/${encodeObjectFileName(objectData.id)}`,
        JSON.stringify(objectData),
      );
    },

    /**
     * 读取全部活动对象快照
     * @returns {Promise<Object[]>} 对象数据数组
     */
    async readAllObjects() {
      return readAllObjectsIn(OBJECTS_DIR);
    },

    /**
     * 读取全部 trash 对象数据
     * @returns {Promise<Object[]>} 对象数据数组
     */
    async readAllTrash() {
      return readAllObjectsIn(TRASH_DIR);
    },

    /**
     * 写入 trash 条目
     * @param {Object} entry - trash 条目（含 data 与 chunks 层位边）
     * @returns {Promise<boolean>} 是否成功
     */
    async writeTrashEntry(entry) {
      if (!entry?.data || typeof entry.data.id !== "string") return false;
      return driver.write(
        `${TRASH_DIR}/${encodeObjectFileName(entry.data.id)}`,
        JSON.stringify(entry),
      );
    },

    /**
     * 移除活动对象文件（已不存在视为成功）
     * @param {string} objectId - 对象 id
     * @returns {Promise<boolean>} 是否成功
     */
    async removeObject(objectId) {
      const rel = `${OBJECTS_DIR}/${encodeObjectFileName(objectId)}`;
      if (!(await driver.exists(rel))) return true;
      return driver.rm(rel);
    },

    /**
     * 写入区块元数据
     * @param {number} chunkId - 区块 id
     * @param {{tierGraph: any[], objectCoverIndex: any[]}} metadata - 区块元数据
     * @returns {Promise<boolean>} 是否成功
     */
    async writeChunkMetadata(chunkId, metadata) {
      if (!Number.isInteger(chunkId) || !metadata) return false;
      return driver.write(
        `${CHUNKS_DIR}/${chunkId}.json`,
        JSON.stringify({
          tierGraph: Array.isArray(metadata.tierGraph) ? metadata.tierGraph : [],
          objectCoverIndex: Array.isArray(metadata.objectCoverIndex)
            ? metadata.objectCoverIndex
            : [],
        }),
      );
    },

    /**
     * 读取全部区块元数据
     * @returns {Promise<Array<{chunkId: number, tierGraph: any[], objectCoverIndex: any[]}>>} 区块元数据列表
     */
    async readAllChunkMetadata() {
      const entries = await driver.ls(CHUNKS_DIR);
      const files = entries
        .filter((entry) => entry.isFile)
        .map((entry) => entry.name)
        .filter((name) => /^\d+\.json$/.test(name));
      const list = await Promise.all(
        files.map(async (name) => {
          const data = parseJson(await driver.read(`${CHUNKS_DIR}/${name}`));
          if (!data || typeof data !== "object") return null;
          return {
            chunkId: Number(name.slice(0, -".json".length)),
            tierGraph: Array.isArray(data.tierGraph) ? data.tierGraph : [],
            objectCoverIndex: Array.isArray(data.objectCoverIndex)
              ? data.objectCoverIndex
              : [],
          };
        }),
      );
      return list.filter((item) => item !== null);
    },

    /**
     * 聚合读取全部会话数据（打开既有板）
     * @returns {Promise<Object>} 会话数据（meta、records、nextSegmentSeq、chunkMetadataList、objects、trash）
     */
    async loadAll() {
      const [meta, { records, nextSegmentSeq }, chunkMetadataList, objects, trash] =
        await Promise.all([
          this.readMeta(),
          this.readAllRecords(),
          this.readAllChunkMetadata(),
          this.readAllObjects(),
          this.readAllTrash(),
        ]);
      return { meta, records, nextSegmentSeq, chunkMetadataList, objects, trash };
    },

    /**
     * 移除 trash 对象文件（已不存在视为成功）
     * @param {string} objectId - 对象 id
     * @returns {Promise<boolean>} 是否成功
     */
    async removeTrashObject(objectId) {
      const rel = `${TRASH_DIR}/${encodeObjectFileName(objectId)}`;
      if (!(await driver.exists(rel))) return true;
      return driver.rm(rel);
    },
  };
}

export { createSessionStore };
