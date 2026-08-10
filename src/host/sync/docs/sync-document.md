# 同步层文档

本文档提供协作同步层（`src/host/sync/`）的概述与实现语义：多端经中继服务器交换操作记录与 AOM 活动事件，各端收敛到同一板状态。内核侧的收敛规则见[时间回溯树内核文档](../../../kernel/hit/docs/undo-tree-kernel-document.md)，会话持久化见[会话存储内核文档](../../../kernel/store/docs/store-document.md)。

> [!NOTE]
>
> **实现状态**：中继服务器（无状态纯转发、板即房间）、网络协调器（本地广播、远程接入、延迟容忍窗、INIT 全量补齐、周期摘要校验、断线清理）、GUI 接入（core-worker 携带 syncUrl 自动连接）均已落地并通过跨设备（Windows + macOS）双 Tauri 窗口实测。待落地：断线自动重连与离线队列、CLI daemon 化。

## 模块定位

同步层是内核的传输宿主：kernel 保持零网络依赖，`applyRemoteOperations` 是唯一远端接入缝。中继与协调器全部在 `src/host/sync/`：

- `network-coordinator.js`：BoardApi 的同步薄包装，订阅日志与活动事件、接入远程记录
- `relay-server.js`：无状态中继，房间成员管理与房间内广播
- `start-relay.js`：启动入口（`yarn relay`，打印本机与局域网地址）

数据流：端（GUI worker / CLI / 测试对等端）经 WebSocket（JSON 消息）连接中继，本地操作由协调器广播，远程消息经协调器接入内核。

## 拓扑与房间

星型拓扑：各端连接同一中继，消息经中继转发，端与端不直连。**板即房间**：join 时携带 boardId，中继按 boardId 分组，不同房间互不可见。demo 固定房间 `demo-board`，无认证（信任本机/局域网）。

同一房间内以 source 标识成员；**同 source 重复加入会覆盖旧连接**（后到者顶替，先到者不再被转发）。同机多窗口共享 localStorage 时身份可能冲突，demo 提供 `hwb.setSource` 显式区分。

## 消息协议（JSON over WebSocket）

| 方向            | 消息                                                          | 语义                             |
| --------------- | ------------------------------------------------------------- | -------------------------------- |
| 客户端 → 服务器 | `{type:"join", boardId, source}`                              | 加入房间（首条消息必须为 join）  |
| 服务器 → 客户端 | `{type:"joined", source, peers:[...]}`                        | 加入确认 + 现有成员列表          |
| 服务器 → 客户端 | `{type:"peer-joined", source}` / `{type:"peer-left", source}` | 成员变动广播                     |
| 客户端 → 服务器 | `{type:"records", records:[...]}`                             | 操作记录广播（微任务合批）       |
| 服务器 → 客户端 | `{type:"records", source, records:[...]}`                     | 记录转发（附来源，不回发发送者） |
| 客户端 → 服务器 | `{type:"aom", event:{kind, ids, choice?, ...}}`                | AOM 活动事件广播（choose 携带命名选择名） |
| 服务器 → 客户端 | `{type:"aom", source, event}`                                 | 活动事件转发                     |
| 客户端 → 服务器 | `{type:"awareness", data}`                                       | awareness 广播（volatile） |
| 服务器 → 客户端 | `{type:"awareness", source, data}`                              | awareness 转发（可丢、不进日志） |
| 客户端 → 服务器 | `{type:"request-init"}`                                       | 请求全量日志（新成员 / 落后端）  |
| 服务器 → 客户端 | `{type:"request-init", source}`                               | 转发给其他成员                   |
| 客户端 → 服务器 | `{type:"respond-init", to, records, meta}`                    | 定向全量响应                     |
| 服务器 → 客户端 | `{type:"respond-init", source, records, meta}`                | 定向转发（仅目标收到）           |
| 客户端 → 服务器 | `{type:"digest", digest}`                                     | 周期状态摘要（默认 30s）         |
| 服务器 → 客户端 | `{type:"digest", source, digest}`                             | 摘要转发                         |

## 中继服务器

- **无状态纯转发**：不缓存任何记录，离线与迟到合并由 K6 负责；房间成员表是唯一状态。
- **广播语义**：records/aom/awareness/digest 广播给房间内除发送者外全部成员；request-init 同广播；respond-init 定向。awareness 是 volatile 通道：不经 operationLog / applyRemoteOperations，无持久化、无确认重发、不参与哈希校验。
- **连接生命周期**：close/error 移出房间并广播 peer-left；房间空则销毁。
- **非法消息**：join 前非 join 消息、格式非法消息一律忽略。

## 网络协调器

### 本地 → 远端

- 订阅 `operationLog.onAppend`：仅广播本端 source 的记录（远程应用的记录过滤，防回环放大）。
- **微任务合批**：超分子成员在 endSupra 时同步连续物化，合批保证成员同批到达——传输中的超分子原子性与日志一致（逐条广播会让接收端部分建节点、后续成员效果丢失）。
- 订阅 `activityEventBus`：手势内 choose/commit 事件即时广播（超分子闭合前 choose 不入日志，互斥与实时可见依赖此通道）。choose 事件携带 `choice`（命名选择名，匿名缺省）；unchoose/commit 事件按（来源，对象）注销，无需携带。
- **awareness（K5）**：光标位置经 `sendAwareness` 走 volatile 通道广播，接收端由 `onAwareness` 回调转发宿主（只画不存）；peer-left 以 `{kind:"peer-left"}` 通知，供接收端清理远程光标。远程选择的装饰走 aom 可靠通道与 remote-activity 通知，不经 volatile 通道。
- **SubFrame 中间帧预览**：手势写入口（modifyObject / appendListItem 等）在内核事件总线发射 subframe 事件，`subframe-forwarder` 按 33ms 间隔节流合批（position/transform 后帧盖前帧、append 按序累积）后经 volatile 通道广播；接收端只画不存（预览位置画选择框），丢了不补，最终分子操作到达时按记录归位。

### 远端 → 本地

- **去重**：按记录 id 跳过日志中已有的与缓冲中待接入的。
- **预检接入**：按来源序号连续性与父在日志判定，通过后整组交给 `applyRemoteOperations`；超分子成员按 supraOpId 成组，组内同批应用。
- **延迟容忍窗**：乱序记录（来源序号空洞 / 父未达）入缓冲，500ms 窗到再整理；连续 3 窗仍未补齐则广播 request-init 请求全量。
- **INIT**：join 时房间已有成员则 request-init；收到 respond-init 后去重接入全量日志。
- **周期摘要**：30s 广播 `{logSize, head, objects}`；落后或同长分歧时 request-init（全量重建兜底）。
- **断线清理**：peer-left 到达时清除该来源的远程活动登记（解锁其选择的对象）。

### 连接生命周期

- `connect()` 在 joined 后兑现；连接失败 reject，宿主（core-worker）捕获后降级离线运行，不阻塞开板。
- `close()` 清订阅与定时器后关套接字；对连接失败的套接字（undici 不发 close 事件）以短超时兜底。

## 收敛语义

- **日志是权威**：choose/unchoose 是日志中的分子操作，随记录同步；`#transitionEffects` 按记录 source 路由——远程 choose 登记远程活动（`isRemoteActive`），不进本地活动集；本地 choose 效果撤销该对象的远程登记（并发冲突按链序收敛）。choose/unchoose 记录携带 `choice`（命名选择名）：远程端除互斥外还能看到对端的 choice 名，全量重建后标签保留（命名迁移只经活动事件传播，重建后按首次登记呈现）。
- **trash 一致性**：delete 记录携带对象快照与层位边，接收端凭以重建 trash 条目；「对象在册即无 trash 条目」不变量由 add/restore 效果维护。
- **状态收敛**：各端日志补齐后树 = f(日志)，根到 HEAD 确定性回放得到同一状态；性质测试以随机种子脚本 + 任意交错投递断言三端摘要全等（`src/kernel/api/tests/sync-convergence.test.js`）。

## 设计约束

- 中继无状态：断线期间的消息不缓存，重连后靠 INIT/摘要补齐（K6 才做离线队列）。
- 无自动重连：断线后协调器进入 closed，需重建连接。[todo]
- 同 source 覆盖：中继按 source 唯一定位成员，同 source 并发连接会互相顶替（同机双开需显式区分身份）。
- 远程活跃对象可见但无视觉指示：锁定感与选中框属 K5 awareness 通道（choice 名已经由 choice 字段就位）。
- 浏览器（无 Tauri）打开 demo 为内存板：同步照常，内容不落盘。

## 相关文档

- [undo-tree-kernel-document.md](../../../kernel/hit/docs/undo-tree-kernel-document.md)
- [store-document.md](../../../kernel/store/docs/store-document.md)
- [cli-document.md](../../../cli/docs/cli-document.md)
- [README.md](../../../../README.md)
