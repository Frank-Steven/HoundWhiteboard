# 组件文档

## [Window Manager](window-manager.js)

处理 Electron 应用中的窗口创建和管理。

### 功能:

- 创建标准窗口、全屏窗口和模态窗口
- 管理窗口生命周期
- 处理窗口进程间通信 (IPC)

### 主要方法:

- `createWindow(template, size)` - 创建标准浏览器窗口
- `createFullScreenWindow(template)` - 创建全屏窗口
- `createModalWindow(template, parent, size)` - 创建模态窗口
- `setupFileOpenCloseIPC(ipc, windows)` - 设置窗口打开/关闭的 IPC 处理器

### 依赖:

- Electron 的 `BrowserWindow`
- `settingManager` 用于加载设置

---

## [Board Manager](board-manager.js)

管理白板生命周期和页面。

### 功能:

- 白板创建、打开和保存
- 页面管理
- 模板应用

### 主要方法:

- `init(app)` - 初始化白板管理器
- `createEmptyBoard(boardInfo)` - 创建空白白板
- `addPage(pool, templateID)` - 向白板添加新页面
- `openBoard(boardFile)` - 打开白板文件
- `saveBoard(boardDir)` - 保存白板

### 依赖:

- `window-manager` 用于窗口操作
- `io` 类用于文件操作

---

## [Template Manager](template-manager.js)

处理模板生命周期和操作。

### 功能:

- 模板的增删改查操作
- 模板元数据管理
- 模板进程间通信

### 主要方法:

- `init(app)` - 初始化模板管理器
- `saveTemplate(template)` - 保存模板
- `loadTemplateAll()` - 加载所有模板
- `loadTemplateByID(templateID)` - 根据 ID 加载模板
- `setupTemplateOperationIPC(ipc, windows)` - 设置模板 IPC 处理器

### 依赖:

- `window-manager` 用于窗口操作
- `io` 类用于文件操作

---

## [Setting Manager](setting-manager.js)

管理应用设置和文件操作。

### 功能:

- 设置持久化
- 设置变更通知

### 主要方法:

- `init(app)` - 初始化设置管理器
- `loadSettings()` - 从文件加载设置
- `saveSettings(settings)` - 保存设置到文件
- `setupSettingsIPC(ipc, BrowserWindow)` - 设置设置 IPC 处理器

### 依赖:

- `io` 类用于文件操作

---

## [File Open Manager](file-open-manager.js)

### 功能

- 文件操作对话框

### 主要方法

- `setupFileOperationIPC(ipc, windows)` - 设置文件操作 IPC 处理器

### 依赖:

- Electron 的 `dialog`

---

## [Texture Manager](texture-manager.js)

处理 SVG 纹理生成和拼接。

### 功能:

- SVG 纹理生成
- 拼接纹理创建

### 主要方法:

- `generateSVG(config)` - 生成 SVG 纹理单元
- `createTiledTexture(config, containerWidth, containerHeight)` - 创建拼接纹理

### 依赖:

- 无 (纯 DOM 操作)

---
