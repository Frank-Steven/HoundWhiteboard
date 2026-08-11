# CLI 文档

本文档提供 Hound Whiteboard 命令行前端（`src/cli/`）的概述与使用说明：一个纯命令行第二前端，在 Node 环境中直接以 BoardApi 契约读写板文件，不依赖 GUI、Worker 与渲染管线。

> [!NOTE]
>
> **实现状态**：命令行组合根（node driver + 会话存储 + BoardCore + 日志跟随者）、十四个命令（create / info / list / show / add / delete / undo / redo / ops / tree / choose / choices / unchoose / modify）、daemon 模式、`--source` 协作身份与子进程端到端测试均已落地。

## 定位

CLI 是白板的**第二前端**：不经过 Worker、不经渲染管线，进程内直接持有内核。它证明 BoardApi 契约面的完整边界——板文件的全部读写（加载、修改、保存）都能在纯命令行环境中完成，也是脚本化与自动化验证的入口。

组合根为 `src/cli/board-session.js`：node driver 提供文件操作执行面，kernel/store 负责布局、恢复与日志跟随者落盘，最终经 kernel/api 的 BoardApi 契约面（与 Worker 内同一份）对外。

## daemon 模式

常驻 daemon 进程持有板（`yarn daemon --path <板目录> [--source 身份] [--relay 中继] [--board-id 房间] [--port 端口]`）：进程内装配与文件模式相同（BoardCore + BoardApi + 日志跟随者落盘），同时起 WebSocket 服务提供 BoardApi RPC，板目录写入 `.daemon.json`（端口/pid/身份）。

CLI 在板目录发现活 daemon 时自动切换为薄客户端：命令语义不变，执行从进程内直调换成经 RPC 发操作，与 GUI 调 BoardApi 同一条路。daemon 若连了中继（`--relay`），CLI 操作实时广播到协作端，协作端的操作 CLI 也能查到——「与 GUI 不同步」限制在 daemon 模式下消除。

- **身份**：daemon 模式下操作作者为 daemon 身份（`--source` 或设备自动身份），CLI 的 `--source` 可省略
- **并发**：id 分配在持板侧原子完成（`addObject` 组合面），多 CLI 并发不撞号
- **回退**：无活 daemon（或描述文件为僵尸）时 CLI 回退文件直读直写，与 GUI 不同步的限制同前
- **create**：永远走文件模式（新建板时无 daemon 可连）

## 板路径与数据参数

- **板路径**：CLI 与 daemon 的板目录一律经 `--path` 传入（支持 `~` 家目录展开，如 `--path ~/hound-whiteboard/test-board`），对象 id 与路径形态相似故不再占用位置参数。**daemon 启动后 CLI 可免路径**：板目录写入 `.daemon.json` 的同时，daemon 会把板目录登记到全局引用（`~/.hound-whiteboard/daemon.json`），`yarn cli <命令>` 不带 `--path` 时自动操作当前活动 daemon 的板。
- **--data**：`add` 的 `--data` 必传（StrokeObject 无默认数据）；传 JSON 字符串（shell 转义麻烦时）或以 `@` 开头传 JSON 文件路径，如 `--data @stroke.json`（PowerShell 中需加引号 `"@stroke.json"`；文件路径支持 `~` 展开）。宽松 JSON 解析兼容裸属性名、单引号与裸字符串值（PowerShell 吃掉内嵌双引号后的 `{color: #000}` 这类形态）；布尔/null/数字不受影响。
- **--property**：`add` 与 `modify` 的样式属性（颜色/线宽等，如 `--property '{color: #f00, width: 3}'`）；与 `--data`（几何数据，如 points）分开传入。
- **undo 目标**：`undo [<操作id>]` 可显式指定撤销目标（`info` 输出的 `chain` 列表，如 `dev-b57m/op-1`）；省略时各撤各的，只撤销本端最近操作。daemon 重启后身份会变，撤销历史操作需显式传操作 id。

```bash
# 终端 1：daemon 启动
$ yarn daemon --path ~/hound-whiteboard/test-board --relay ws://127.0.0.1:8377 --board-id demo-board

# 终端 2：CLI 免路径操作同一板
$ yarn cli add --type StrokeObject --data "@stroke.json"
$ yarn cli list
$ yarn cli info
$ yarn cli undo
```

与 UI 前端的差异只在组合根：UI 经 RPC 跨线程调用，CLI 进程内直调；两侧最终落到同一份内核代码与同一种板文件布局。

## 命令面

```text
yarn cli <命令> [参数] [--path <板目录>] [--标志 值]
```

| 命令                                                              | 说明                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| `create --path <板目录> [--width 800] [--height 600]`             | 创建空板；板目录已存在时报错                                                         |
| `info [--path <板目录>]`                                          | 打印板元数据与统计（板配置、记录数、HEAD、活动链 chain、对象/trash 计数、id 计数器） |
| `list [--path <板目录>]`                                          | 列出活动对象（id、类型）与 trash 条目                                                |
| `show <对象id> [--path <板目录>]`                                 | 打印单个对象的序列化数据                                                             |
| `add --type <类型> [--data '<json>'                               | "@文件"] [--property '<json>'] [--position x,y] [--path <板目录>]`                   | 创建并提交对象，打印新对象 id |
| `delete <对象id...> [--path <板目录>]`                            | 删除对象（移入 trash，可撤销）                                                       |
| `undo [<操作id>] [--path <板目录>]` / `redo [--path <板目录>]`    | 撤销 / 重做一步；undo 指定操作 id 时撤销该操作，省略时撤销本端最近操作               |
| `ops [--source 来源] [--type 类型] [--limit N] [--path <板目录>]` | 打印操作记录明细（id/type/source/time/parentId/supraOpId/molId/supraId/discard/properties/payload） |
| `tree [--path <板目录>]`                                          | 以缩进树打印时间回溯树（HEAD 与已撤销分支标记、重做栈；聚合节点以 `{choose+modify+unchoose}` 花括号包裹、多对象分子节点以方括号包裹、discard 型成员带 `(discard)` 后缀） |
| `choose <对象id...> --choice <名> [--path <板目录>]`              | 把对象选入命名 choice（AOM 命名选择注册表权威；同一对象同时只属一个 choice）                    |
| `choices [--path <板目录>]`                                       | 列出全部 choice 及成员状态（daemon 驻留标 active；未恢复种子标 active:false）              |
| `unchoose <名> (--apply\|--discard) [--path <板目录>]`            | 结束一个 choice：--apply 提交修改 / --discard 放弃修改                               |
| `modify <对象id> <修改标志> [--path <板目录>]`                    | 修改单对象；未选中时自动 choose→modify→commit 超分子会话，闭合折叠为一个聚合节点      |
| `modify --choice <名> <修改标志> [--path <板目录>]`               | 修改 choice 成员；增量逐对象换算，全量仅单成员 choice 允许                           |

修改标志：

- `--displacement dx,dy`：位置增量（choice/单对象均可）
- `--transform-delta a,b,c,d`：变换增量，左乘当前变换（choice/单对象均可）
- `--position x,y` / `--transform a,b,c,d` / `--property '<json>'` / `--data '<json>'|"@文件"`：全量（choice 仅单成员允许）

通用标志：

- `--path <板目录>`：板目录路径（支持 `~` 展开）；省略时操作当前活动 daemon 持有的板
- `--source <来源>`：协作身份（默认 `cli`），决定操作记录的 source 与新对象 id 前缀（`<source>/<n>`）
- `--width` / `--height`：仅新建板时生效；重开既有板以盘上板配置为准

`--type` 取对象注册表中的类型名：`StrokeObject`、`CircleObject`、`EllipseObject`、`PolygonObject`。

输出均为 stdout 上的 JSON（`add` 输出单行 id），错误经 stderr 打印并以退出码 1 结束。

## choice 与查改语义

choice 是命名选择（类比 GUI 里多套互不相干的选择）。**AOM 的命名选择注册表是权威状态**：在册成员必然在板上且处于活动状态。同一对象同时只属一个 choice（choose 新 choice 时自动从旧 choice 摘出）。choice 名不可为空、不可含 `/`、不可以 `~` 开头（`~` 是匿名选择的保留名）；不同端的同名 choice 互不相同（内核以 `"{source}/{choice}"` 形态区分）。

choose/unchoose 的日志记录与活动事件均携带 choice 名：全量重建（INIT / 哈希校验兜底）后远程端仍能看到对端的 choice 名。命名迁移（已活动对象改挂别的 choice）只经活动事件传播，不产生新记录。

板目录的 `.cli-choices.json`（临时文件 rename 原子写）是**重启种子**而非运行时真相：daemon 重启后注册表随进程丢失，`choices` 以 `active:false` 标注未恢复的 choice，首次 `modify --choice` 触发自愈重选（携带 choice 名）重建注册表。

modify 的两条路径：

- **choice 路径**：增量标志逐成员换算（读各自当前值计算新值），daemon 模式下修改驻留 AOM 活动对象（GUI 可实时看到选中与变化），`unchoose --apply` 一次性提交（修改与取消选择分子同属一个超分子，闭合折叠为一个聚合节点）；文件模式进程不常驻，每次 modify 原子完成 choose→modify→commit（每次闭合为一个聚合节点）。
- **单对象路径**：对象未选中时自动执行 choose→modify→commit 超分子会话（成员记录即时物化挂 supraId，endSupra 折叠为一个聚合节点），两模式行为一致；对象已属某 choice 时按该 choice 语义修改（成员归属先查注册表，未驻留回退文件种子）。

choice 全量修改（--position/--transform/--property/--data）仅单成员 choice 允许；多成员 choice 请用增量标志。

## 会话生命周期

每次调用都是一个完整的「加载 → 执行 → 落盘 → 关闭」循环：

1. 装配：node driver 注册根目录，`bindRoot` 收窄到板目录，创建会话存储。
2. 恢复：`loadAll` 读盘 → BoardCore 以日志记录重建时间回溯树、以板配置/id 计数器续号 → `restoreSession` 回填区块与对象。
3. 挂接：日志跟随者以盘上内容为指纹种子 attach。
4. 执行命令（经 BoardApi）。
5. `flush` 排空洞 → `close` 退接。

这个形态使每次调用都天然走一遍恢复路径——撤销、trash、id 续号在跨进程场景下的正确性被持续检验。

## 关键设计点

- **装配零专改**：CLI 不引入任何内核改动以外的机制，全部复用 `kernel/store` 与 `io` 的现有缝（node driver 是进程的自有文件面，不经权限协商）。
- **板上配置优先**：板尺寸是文档数据（决定区块划分），重开时以 `board.json` 的 `boardConfig` 为准；0 值视为未知，不写入也不抢占调用方显式配置。
- **协作身份贯穿**：`--source` 在构造 BoardCore 时注入，操作记录 source、Core 侧 id 子命名空间与 CLI 侧对象 id 池同前缀；id 池计数经 `reportObjectIdCounter` 随板元数据持久化，跨进程续号。
- **指纹种子契约**：挂接时以盘上对象与 trash 条目为调和种子，首轮 flush 不做无谓重写；种子形状即 `loadAll` 的输出形状（trash 条目 id 在 `entry.data.id`）。

## 设计约束

- 无交互与渲染能力：CLI 面向文档操作，不表达视口、选择与 overlay 状态。
- **与 GUI 不同步**：CLI 直接读写板文件，与运行中的 GUI 进程没有协同通道（无锁、无同步、无共享会话）。GUI 保持打开期间用 CLI 操作同一板目录，两侧各自按自己的内存状态落盘并追加日志段，会互相覆盖与竞态。CLI 只应在 GUI 未运行该板时使用；同步能力属于传输层（K4）的职责，不在 CLI 的文件直读直写模式内。
- 每次调用一个进程：无长驻会话，命令间状态完全经板文件传递。
- 读命令同样经 flush 收敛元数据（值不变，文件会被重写）。
- 板尺寸未知的板（`boardConfig` 缺失且未传 `--width/--height`）上执行 `add` 会因无法解析区块而失败，需显式指定尺寸。

## 相关文档

- [store-document.md](../../kernel/store/docs/store-document.md)
- [file-structure.md](../../docs/file-structure.md)
- [board-api-rpc-document.md](../../host/bridges/docs/board-api-rpc-document.md)
- [src/io/README.md](../../io/README.md)
