# Hound Whiteboard

基于 Tauri 2 的桌面白板应用，采用 Worker 架构分离核心与 UI。

## 架构概述

本项目专注于白板内核与 Tauri 桌面端：

- **Kernel** — 对象模型、几何、区块、BoardCore 静态图、AOM 动态图、操作日志（hit）与 BoardApi 契约；零 canvas/DOM，可运行于 Worker、UI 线程或 Node 环境
- **Renderer 插件** — canvas 渲染器贴附内核同宿运行：脏区渲染、位图合成、对象绘制策略注册表；渲染过程不过桥，RPC 只过操作与帧
- **Host** — 组合根与通道：Core Worker 宿主与 bridges，决定内核与渲染器进程内直连（standalone）还是 RPC 绑定（Worker）
- **Devices DAG** — 输入设备路由图，将鼠标/键盘/触摸等输入信号路由到对应的工具处理器
- **Tool System** — 创建、选择、修改、擦除等交互工具

UI Kit 另由 [HoundTek/hound-react-ui-kit](https://github.com/HoundTek/hound-react-ui-kit) 独立开发，使用 Cell DSL 构建 UI，为后续 React UI 迁移做准备。

## 项目结构

```
src/
├── kernel/        # 内核包（零 canvas/DOM：对象、几何、区块、BoardCore、AOM、hit、BoardApi）
├── renderers/     # 渲染插件（canvas 渲染器、绘制策略注册表）
├── host/          # 组合根与通道（core-worker、bridges/RPC）
├── ui/            # UI front（Board、Viewport、DevicesDAG、Tools、overlay）
├── docs/          # 架构文档
├── demo/          # 白板 HTML/CSS/JS 入口
├── utils/         # 应用级工具（filesys、log、safe-io）
└── src-tauri/     # Rust 后端（Cargo workspace）
```

## 准备工作

确保已安装：

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) ≥ 1.70
- [Tauri CLI](https://v2.tauri.app/)（通过 `cargo install tauri-cli` 或随 `yarn` 自动管理）

## 快速开始

```bash
# 1. 安装依赖（完成后自动配置 git hooks）
yarn install

# 2. 启动开发模式（带热更新）
yarn dev

# 3. 运行测试
yarn test

# 4. 生产构建
yarn build
```

## 命令参考

### 开发

| 命令              | 说明                       |
| ----------------- | -------------------------- |
| `yarn dev`        | Tauri 开发模式（带热更新） |
| `yarn dev:win`    | Windows 开发模式           |
| `yarn dev:mac`    | macOS 开发模式             |
| `yarn dev:linux`  | Linux 开发模式             |
| `yarn dev:android`| Android 开发模式           |
| `yarn dev:ios`    | iOS 开发模式               |

### 测试与 CI

| 命令                 | 说明                                        |
| -------------------- | ------------------------------------------- |
| `yarn test`          | 运行全部测试                                |
| `yarn ci-check`      | 运行文档链接检查 + `@module` 路径一致性检查 |
| `yarn check:docs`    | 检查文档内部链接是否有效                    |
| `yarn check:modules` | 检查文件头 `@module` 路径与实际目录是否一致 |
| `yarn bench`         | 运行全部性能基准                            |

CI 流水线定义见 `.github/workflows/ci.yml`，提交到 `master` 后自动运行。

### 构建

| 命令                       | 说明                                    |
| -------------------------- | --------------------------------------- |
| `yarn build`               | 通用生产构建                            |
| `yarn build:quick`         | 仅构建（跳过依赖安装和图标生成）        |
| `yarn build:mac`           | macOS 构建（dmg + app）                 |
| `yarn build:mac-universal` | macOS 通用构建（Intel + Apple Silicon） |
| `yarn build:win`           | Windows 构建（nsis + msi）              |
| `yarn build:linux`         | Linux 构建（deb + appimage + rpm）      |
| `yarn build:android`       | Android 构建（APK）                     |
| `yarn build:ios`           | iOS 构建                                |

### 发布

| 命令                | 说明                    |
| ------------------- | ----------------------- |
| `yarn ship`         | 运行测试 + 桌面端构建   |
| `yarn ship:win`     | 运行测试 + Windows 构建 |
| `yarn ship:mac`     | 运行测试 + macOS 构建   |
| `yarn ship:linux`   | 运行测试 + Linux 构建   |
| `yarn ship:android` | 运行测试 + Android 构建 |
| `yarn ship:ios`     | 运行测试 + iOS 构建     |

### 图标管理

各平台支持独立的图标源文件，构建时自动使用对应平台的图标：

| 命令                | 源文件                                             | 说明                  |
| ------------------- | -------------------------------------------------- | --------------------- |
| `yarn icon`         | 所有平台                                           | 生成所有平台图标      |
| `yarn icon:desktop` | `icon-desktop.png` → `icon.png`                    | 生成通用桌面图标      |
| `yarn icon:mac`     | `icon-mac.png` → `icon-desktop.png` → `icon.png`   | 生成 macOS 专属图标   |
| `yarn icon:win`     | `icon-win.png` → `icon-desktop.png` → `icon.png`   | 生成 Windows 专属图标 |
| `yarn icon:linux`   | `icon-linux.png` → `icon-desktop.png` → `icon.png` | 生成 Linux 专属图标   |
| `yarn icon:android` | `icon-android.png` → `icon.png`                    | 生成 Android 图标     |
| `yarn icon:ios`     | `icon-ios.png` → `icon.png`                        | 生成 iOS 图标         |

### 移动端

| 命令                 | 说明                |
| -------------------- | ------------------- |
| `yarn init:android`  | 初始化 Android 项目 |
| `yarn dev:android`   | Android 开发模式    |
| `yarn build:android` | Android 构建        |
| `yarn init:ios`      | 初始化 iOS 项目     |
| `yarn dev:ios`       | iOS 开发模式        |
| `yarn build:ios`     | iOS 构建            |

### 清理

| 命令                | 说明                                            |
| ------------------- | ----------------------------------------------- |
| `yarn clean`        | 清理所有构建产物（target + gen + icons + temp） |
| `yarn clean:target` | 清理 Rust 构建产物                              |
| `yarn clean:gen`    | 清理移动端生成文件                              |
| `yarn clean:icons`  | 清理桌面端图标                                  |
| `yarn clean:temp`   | 清理临时目录                                    |
| `yarn clean:status` | 查看当前图标来源                                |
| `yarn clean:help`   | 显示清理命令帮助                                |

## 图标配置

图标配置文件位于 `scripts/build/icon-config.json`，可自定义各平台的源文件和输出目录。

### 图标源文件优先级

每个平台按优先级查找图标源文件：

| 平台    | 优先级                                             |
| ------- | -------------------------------------------------- |
| macOS   | `icon-mac.png` > `icon-desktop.png` > `icon.png`   |
| Windows | `icon-win.png` > `icon-desktop.png` > `icon.png`   |
| Linux   | `icon-linux.png` > `icon-desktop.png` > `icon.png` |
| Android | `icon-android.png` > `icon.png`                    |
| iOS     | `icon-ios.png` > `icon.png`                        |

## 许可

- 项目整体遵循 **GPL-3.0-only**（见 [LICENSE](LICENSE)）
- `src/kernel/`（未来的 npm 包）以 **MIT** 发布（见 [src/kernel/LICENSE](src/kernel/LICENSE)）；对 kernel 的贡献默认按 MIT 接收
