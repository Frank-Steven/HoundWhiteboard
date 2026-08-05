# safe-io v4（src/io）

安全文件操作框架，Tauri 2 可用、kernel 可用、host 可用。

## 架构

```
src/io/
├── core/                  # 纯 JS 零依赖（任何 JS 运行时可用）
│   ├── dsl.js             # 路径 DSL：名称校验、Dir/File、cd/father
│   └── policy.js          # 权限位掩码、预设、操作映射
├── driver/                # IoDriver 执行器契约 + 平台实现（全部 async）
│   ├── io-driver.js       # 契约 + OP 枚举 + bindRoot 绑定辅助
│   ├── memory.js          # 内存实现（测试 / headless / 预览）
│   ├── node.js            # Node fs 实现（CLI / jest / 独立工具）
│   └── tauri.js           # Tauri invoke → Rust commands（transport 可注入）
├── adapter/
│   └── persistence.js     # PersistenceAdapter 契约（kernel 注入缝）
└── api/
    └── safe-io.js         # 对外 API：registerRoot → open → handle
```

## 分层原则

- **core / api 零平台依赖**：不 import fs/path/electron，可在 webview、worker、node、Rust 旁任意运行。
- **IoDriver 是唯一的执行出口**：所有文件操作经驱动执行；驱动只处理 root 相对路径，不做权限判断。
- **安全判断下沉可信执行面**：Tauri 模式下 root 注册表、路径校验、符号链接边界与权限强制全部在 Rust（`src-tauri/src/commands/`）；webview/worker 只构造受限意图（rootId + relPath）。
- **不抛业务错误**：driver 失败返回 null/false/[]；Rust command 返回 `Err` 时 JS 驱动捕获转为安全值。

## 使用

```js
import { createTauriDriver } from "./driver/tauri.js";
import { createSafeIO } from "./api/safe-io.js";

const io = createSafeIO(createTauriDriver()); // webview 直连
// const io = createSafeIO(createTauriDriver({ invoke: forwardToMain }));  // worker 转发

const root = await io.registerRoot("/path/to/board", "READ_WRITE");
const handle = await io.open(root, "chunks/0.json");
await handle.read(); // → string | null
await handle.write("{}");
handle.getAuditHistory();
```

### 注入 kernel

```js
import { createTauriDriver } from "../../io/driver/tauri.js";
import { createPersistenceAdapter } from "../../io/adapter/persistence.js";

const driver = createTauriDriver();
const root = await io.registerRoot(boardPath, "READ_WRITE");
const adapter = createPersistenceAdapter({ driver, rootId: root.rootId });

const boardCore = new BoardCore({ persistenceAdapter: adapter, ... });
```

存储布局与旧 file-operate-bridge 兼容：`chunks/{chunkId}.json`、`objects/{objectId}.json`。

## Rust commands

`src-tauri/src/commands/`：`registry`（root 注册表 + resolve）、`fs`（读写/列目录/状态/删除/复制/移动/隐藏）、`zip`（压缩/解压/列表）。全部经 `resolve()` 做词法校验 + 符号链接边界检查 + 权限强制。

## 测试

- JS：`src/io/**/tests/*.test.js`（jest，覆盖 dsl/policy/memory/node/tauri/api/adapter）
- Rust：`src-tauri/src/commands/` 内 `#[cfg(test)]`（路径校验与 zip-slip 防护）
