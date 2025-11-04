# 工具模块文档

本文档提供项目中所有工具模块的概述。

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
- `setupFileOpenCloseIPC(ipc, windows)` - 设置窗口打开/关闭的IPC处理器

### 依赖:
- Electron 的 `BrowserWindow`
- `settingManager` 用于加载设置

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
- `loadTemplateByID(templateID)` - 根据ID加载模板
- `setupTemplateOperationIPC(ipc, windows)` - 设置模板IPC处理器

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
- `setupSettingsIPC(ipc, BrowserWindow)` - 设置设置IPC处理器

### 依赖:
- `io` 类用于文件操作

---

## [File Open Manager](file-open-manager.js)

### 功能
- 文件操作对话框

### 主要方法

- `setupFileOperationIPC(ipc, windows)` - 设置文件操作IPC处理器

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

## [algorithm](algorithm.js)

提供基础算法。

### 功能:
- 随机数池
- 双指、三指操作的矩阵变换计算

### 主要方法:
- `getDualFingerResult(x1, y1, x2, y2, x1q, y1q, x2q, y2q, aq, bq, cq, dq, eq, fq)` - 计算双指操作的变换矩阵
- `getTriFingerResult(x1, y1, x2, y2, x3, y3, x1q, y1q, x2q, y2q, x3q, y3q, aq, bq, cq, dq, eq, fq)` - 计算三指操作的变换矩阵

### 主要类:
- `randomNumberPool` - 不重复随机数池类

### 依赖:
- `crypto.randomInt` 用于生成随机数

## [fp](fp.js)

特化 `fs` 的功能，封装文件操作。

### 功能:
- 目录和文件的基本操作
- 文件压缩和解压
- 文件复制、移动、删除

### 主要方法:
- `mkdir(dir)` - 创建目录
- `lsDir(dir)` - 列出子目录
- `lsFile(dir)` - 列出文件
- `readFile(file)` - 读取文件内容
- `writeFile(file, content)` - 写入文件内容
- `cp(source, dest)` - 复制文件
- `mv(source, dest)` - 移动文件
- `rm(file)` - 删除文件
- `extractFile(source, dest)` - 解压文件
- `compressFile(source, dest, remove)` - 压缩目录

### 依赖:
- `fs` - Node.js 文件系统模块
- `adm-zip` - ZIP 压缩库

## [io](io.js)

封装文件操作，提供面向对象的文件和目录管理。

### 功能:
- 文件和目录的面向对象封装
- 随机文件名池管理
- 文件隐藏和显示
- 路径解析和操作

### 主要类:
- `directory` - 目录操作类
- `file` - 文件操作类
- `fileNameRandomPool` - 随机文件名池类

### 主要方法:
- `directory` 类方法: `getPath()`, `cd()`, `make()`, `exist()`, `ls()`, `cp()`, `mv()`, `rm()`
- `file` 类方法: `getPath()`, `cat()`, `write()`, `exist()`, `cp()`, `mv()`, `rm()`
- `fileNameRandomPool` 类方法: `generate()`, `add()`, `remove()`, `rename()`

### 依赖:
- `path` - Node.js 路径模块
- `hidefile` - 文件隐藏库
- `fp` - 文件操作模块

## [Fake Window](ui/fake-window.js)

提供模拟窗口UI组件，采用严格的面向对象设计。

### 功能:
- 模态和非模态窗口显示
- 居中和自定义位置显示
- 象限模式智能定位
- 事件驱动架构
- Z-index 层级管理
- 多种预设窗口类型

### 主要类:
- `FakeWindow` - 主窗口类
- `WindowFactory` - 窗口工厂类
- `EventEmitter` - 事件发射器基类

### 主要方法:
- `showCentered()` - 居中显示窗口
- `showAt(x, y, options)` - 在指定位置显示窗口
- `hide()` - 隐藏窗口
- `toggle()` - 切换窗口可见性

### 依赖:
- 无 (纯 DOM 操作)

---

## [Toast](ui/toast.js)

提供内联通知系统，轻量级提示框组件。

### 功能:
- 多种通知类型 (成功、警告、错误、信息)
- 多种显示位置
- 自定义动画
- 进度指示器

### 主要方法:
- `show(options)` - 显示自定义提示框
- `success(message, options)` - 显示成功提示
- `warning(message, options)` - 显示警告提示
- `error(message, options)` - 显示错误提示
- `info(message, options)` - 显示信息提示
- `close(toast)` - 关闭指定提示框
- `closeAll()` - 关闭所有提示框

### 依赖:
- 无 (纯 DOM 操作)
