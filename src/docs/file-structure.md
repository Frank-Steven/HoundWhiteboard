# 白板文件结构文档

本文档整理当前代码中**可以被源码直接验证**的白板文件结构与持久化语义。

需要特别说明：

- 这份文档描述的是 kernel 会话存储（`src/kernel/store/`）与 io 持久化适配器（`src/io/adapter/`）共同约定的布局
- 默认 Worker runtime 以 `rootPath` 是否有效区分内存模式与持久化模式
- 内存模式下不落任何文件；持久化模式下根目录即板目录

## 概述

持久化相关代码分三层：

1. **kernel 定义缝**：`kernel/board/persistence-adapter`（区块元数据与对象读写契约）、`kernel/store/session-store` 的 `SessionDriver`（最小文件操作契约）
2. **io 包实现缝**：`io/driver/`（memory / node / tauri 三实现）、`io/adapter/persistence`（PersistenceAdapter 实现）
3. **host 组合根接线**：core-worker `createBoard` 注册根目录、构造 BoardCore、恢复会话并挂接日志跟随者

板目录结构（布局 v1）：

```text
{board}/
  board.json               # 板元数据
  objects/{objectId}.json  # 活动对象快照
  trash/{objectId}.json    # trash 条目
  chunks/{chunkId}.json    # 区块元数据
  hit/seg-{NNNNNN}.jsonl   # 操作日志段
```

## 各文件与目录说明

### `board.json`

板元数据文件。每次落盘批次末尾整体重写。

```json
{
  "formatVersion": 1,
  "lastTime": 1786009532137,
  "nextSegmentSeq": 5,
  "coreIdCounters": { "demo": 2 }
}
```

字段含义：

- `formatVersion`：布局版本号
- `lastTime`：已落盘记录的最晚时间标记，重开时续给 commit 边界
- `nextSegmentSeq`：下一个可用日志段序号
- `coreIdCounters`：各来源的 Core 侧对象 id 已分配最大计数（如擦除分裂段 id），重开时续号防碰撞

### `objects/{objectId}.json`

活动对象的序列化快照，扁平存储，每对象一文件。

对象 id 含斜杠（如 `demo/1`），文件名经 `encodeURIComponent` 编码（如 `demo%2F1.json`）。

内容由日志跟随者按当前板状态调和写入：序列化指纹比对，仅写差异。

### `trash/{objectId}.json`

trash 条目文件，文件名编码规则与活动对象相同。内容为完整条目：

```json
{
  "data": { "id": "demo/2", "type": "StrokeObject", "...": "..." },
  "chunks": [{ "chunkId": "1", "below": ["demo/1"], "above": [] }]
}
```

- `data`：删除时刻的全量序列化
- `chunks`：删除时刻各区块的层位边（`below` / `above` 为该对象在区块静态图中的前驱与后继）

层位边使跨会话的撤销删除能把对象按原层位关系回图。

### `chunks/{chunkId}.json`

区块元数据文件：

```json
{
  "tierGraph": [],
  "objectCoverIndex": []
}
```

- `tierGraph`：区块静态层叠图的数组化结果（`DirectedGraph.toArray()`）
- `objectCoverIndex`：对象覆盖区块索引，`Array<[objectId, number[]]>`

由日志跟随者按当前层叠图状态调和写入（指纹比对，仅写差异）。

### `hit/seg-{NNNNNN}.jsonl`

操作日志段文件。每个落盘批次追加一段，段序号为六位十进制零填充，单调递增。

段内容为 JSONL：一行一条序列化操作记录（分子操作记录结构见 [operation-document.md](../kernel/hit/docs/operation-document.md)）。

打开板时按段序号升序拼接，经 `OperationLog.fromJSON` 重建日志、`UndoTree.rebuild()` 重建时间回溯树，撤销历史由此穿越重开。

## 落盘语义

### 日志跟随者

`kernel/store/journaler` 订阅操作日志的 append 事件（本地 commit 与远端应用共用同一入日志通道），微任务合批后自动落盘。每轮 flush 按序执行：

1. 队列中的新记录写为一段 `hit/seg-{N}.jsonl`
2. 对象文件调和：活动对象写 `objects/`，trash 条目写 `trash/`，既非活动亦非 trash 的对象从盘上移除
3. 区块元数据调和：层叠图与覆盖索引指纹比对，仅写差异
4. 重写 `board.json`

调和以板当前状态为准，撤销/重做/远端记录引起的任意状态迁移统一收敛，无逐类型效果逻辑。

### 会话恢复

打开既有板（core-worker `createBoard` 携带有效 `rootPath`）：

1. `registerRoot` 注册根目录（`~` 家目录展开；目录不存在且声明写权限时自动创建）
2. `loadAll` 聚合读取板元数据、日志记录、区块元数据、对象与 trash
3. 构造 BoardCore：`hitRecords` 重建日志与树、`lastTime` 与 `coreIdCounters` 续号
4. `restoreSession` 回填层叠图与覆盖索引、注册对象实例、恢复 trash 条目；恢复的区块标记完整加载态
5. 挂接日志跟随者（以盘上内容为指纹种子，避免首轮重写）

### 安全边界

webview 与 worker 只构造受限意图（`rootId` + 相对路径），root 注册表、路径校验、符号链接边界与权限强制全部在 Rust（`src-tauri/src/commands/`）。详见 [src/io/README.md](../io/README.md)。

## 当前已知约束

- 选择状态（活动对象集合）不随会话持久化，重开后为空
- 区块只增不减：已从板上卸载的区块其元数据文件保留在盘上
- 大板场景的区块懒加载读写路径（`loadChunkObjectEntries` 等）存在但未接入演示流程

## 相关文档

- [src/io/README.md](../io/README.md)
- [operation-document.md](../kernel/hit/docs/operation-document.md)
- [undo-tree-kernel-document.md](../kernel/hit/docs/undo-tree-kernel-document.md)
- [board-core-document.md](../kernel/board/docs/board-core-document.md)
- [core-data-model.md](./core-data-model.md)
- [core-overview.md](./core-overview.md)
