# 伪窗口工具模块 (Fake Window)

一个轻量级、灵活的窗口管理工具，支持居中显示和自定义位置两种模式。

## 功能特性

✅ **双模式支持**：居中模态窗口和自定义位置窗口  
✅ **灵活定位**：支持精确坐标定位和自动居中  
✅ **智能边界检测**：自动调整位置避免超出视口  
✅ **模态控制**：可选的背景遮罩和交互阻止  
✅ **事件回调**：完整的显示/隐藏生命周期钩子  
✅ **轻量级**：仅注入必要的外层容器样式  
✅ **高度可定制**：窗口内容样式完全由用户控制  
✅ **零依赖**：纯原生 JavaScript 实现  
✅ **模块化设计**：使用 CommonJS 模块系统

## 设计理念

**职责分离**：
- **fake-window.js**：负责外层容器的定位、显示/隐藏逻辑、事件管理
- **用户 HTML**：定义窗口内容结构
- **用户 CSS**：控制窗口内容样式（背景、边框、动画等）

这种设计让开发者拥有最大的灵活性，可以创建任何样式的窗口。

## 文件结构

```
src/utils/ui/
└── fake-window.js          # 核心工具模块（样式已内联）
```

## 快速开始

### 1. 引入模块

```javascript
const FakeWindow = require('./utils/ui/fake-window');
```

### 2. 在 HTML 中定义窗口结构

```html
<!-- 居中模态窗口示例 -->
<div id="my-modal" class="fake-window-wrapper">
  <div class="my-modal-content">
    <h2>标题</h2>
    <p>这是窗口内容</p>
    <button onclick="FakeWindow.hide('my-modal')">关闭</button>
  </div>
</div>

<!-- 自定义位置窗口示例（如右键菜单） -->
<div id="context-menu" class="fake-window-wrapper">
  <div class="menu-content">
    <div class="menu-item">选项 1</div>
    <div class="menu-item">选项 2</div>
    <div class="menu-item">选项 3</div>
  </div>
</div>
```

### 3. 在 CSS 中定义窗口样式

```css
/* 居中模态窗口样式 */
.my-modal-content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-width: 500px;
  width: 90%;
}

/* 右键菜单样式 */
.menu-content {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 180px;
}

.menu-item {
  padding: 10px 16px;
  cursor: pointer;
}

.menu-item:hover {
  background: #f0f0f0;
}
```

### 4. 使用 JavaScript 控制显示

```javascript
// 居中显示模态窗口
FakeWindow.showCentered('my-modal', {
  modal: true,
  backdropClose: true
});

// 在鼠标位置显示右键菜单
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  FakeWindow.showAt('context-menu', e.clientX, e.clientY, {
    backdropClose: true
  });
});

// 隐藏窗口
FakeWindow.hide('my-modal');
```

## API 文档

### 方法

#### `FakeWindow.showCentered(elementId, options)`

在视口中央显示窗口（模态模式）。

**参数：**
- `elementId` (String) - 窗口元素的 ID
- `options` (Object) - 配置选项

**配置选项：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modal` | Boolean | `true` | 是否为模态窗口（阻止背景交互） |
| `backdropClose` | Boolean | `true` | 点击背景是否关闭窗口 |
| `zIndex` | Number | `null` | 自定义 z-index（默认自动递增） |
| `onShow` | Function | `null` | 显示时的回调函数 |
| `onHide` | Function | `null` | 隐藏时的回调函数 |

**返回值：**
- `Boolean` - 是否成功显示

**示例：**
```javascript
FakeWindow.showCentered('my-window', {
  modal: true,
  backdropClose: true,
  onShow: (element) => {
    console.log('窗口已显示', element);
  },
  onHide: (element) => {
    console.log('窗口已隐藏', element);
  }
});
```

#### `FakeWindow.showAt(elementId, x, y, options)`

在指定坐标位置显示窗口。

**参数：**
- `elementId` (String) - 窗口元素的 ID
- `x` (Number) - X 坐标（像素）
- `y` (Number) - Y 坐标（像素）
- `options` (Object) - 配置选项

**配置选项：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modal` | Boolean | `false` | 是否为模态窗口 |
| `backdropClose` | Boolean | `false` | 点击外部是否关闭窗口 |
| `adjustPosition` | Boolean | `true` | 是否自动调整位置以适应视口 |
| `quadrantMode` | Boolean | `false` | 是否启用象限模式定位 |
| `primaryQuadrant` | Number | `4` | 主象限 (1=右上, 2=左上, 3=左下, 4=右下) |
| `minMargin` | Number | `10` | 象限模式的最小边距（像素） |
| `zIndex` | Number | `null` | 自定义 z-index |
| `onShow` | Function | `null` | 显示时的回调函数 |
| `onHide` | Function | `null` | 隐藏时的回调函数 |

**返回值：**
- `Boolean` - 是否成功显示

**示例：**
```javascript
// 在鼠标位置显示
FakeWindow.showAt('context-menu', e.clientX, e.clientY, {
  backdropClose: true,
  adjustPosition: true
});

// 在固定位置显示
FakeWindow.showAt('tooltip', 100, 200, {
  modal: false,
  adjustPosition: false
});

// 使用象限模式（智能定位）
FakeWindow.showAt('context-menu', mouseX, mouseY, {
  quadrantMode: true,
  primaryQuadrant: 4,  // 优先显示在右下
  minMargin: 10
});
```

#### 象限模式说明

象限模式以指定坐标为原点，根据可用空间智能选择最佳显示位置：

```
| II  | II  | I  |
| II  | II  | I  |
| III | III | IV |
```

| 右边空间 | 下边空间 | 显示象限 |
|-|-|-|
| ✅ | ✅ | IV（右下）|
| ❌ | ✅ | III（左下）|
| ✅ | ❌ | I（右上）|
| ❌ | ❌ | II（左上）|

**示例：**
```javascript
// 右键菜单使用象限模式
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  FakeWindow.showAt('context-menu', e.clientX, e.clientY, {
    backdropClose: true,
    quadrantMode: true,
    primaryQuadrant: 4,
    minMargin: 10
  });
});
```

#### `FakeWindow.hide(elementId)`

隐藏指定窗口。

**参数：**
- `elementId` (String) - 窗口元素的 ID

**返回值：**
- `Boolean` - 是否成功隐藏

**示例：**
```javascript
FakeWindow.hide('my-window');
```

#### `FakeWindow.isVisible(elementId)`

检查窗口是否可见。

**参数：**
- `elementId` (String) - 窗口元素的 ID

**返回值：**
- `Boolean` - 是否可见

**示例：**
```javascript
if (FakeWindow.isVisible('my-window')) {
  console.log('窗口正在显示');
}
```

#### `FakeWindow.bringToFront(elementId)`

将窗口置于最前。

**参数：**
- `elementId` (String) - 窗口元素的 ID

**返回值：**
- `Boolean` - 是否成功

**示例：**
```javascript
FakeWindow.bringToFront('my-window');
```

#### `FakeWindow.hideAll()`

隐藏所有活动窗口。

**示例：**
```javascript
FakeWindow.hideAll();
```

## 使用示例

### 1. 居中模态对话框

```html
<div id="confirm-dialog" class="fake-window-wrapper">
  <div class="dialog-content">
    <div class="dialog-header">
      <h3>确认操作</h3>
    </div>
    <div class="dialog-body">
      <p>确定要删除这个项目吗？</p>
    </div>
    <div class="dialog-footer">
      <button onclick="FakeWindow.hide('confirm-dialog')">取消</button>
      <button onclick="confirmDelete()">确定</button>
    </div>
  </div>
</div>
```

```css
.dialog-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-width: 400px;
  width: 90%;
  overflow: hidden;
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
}

.dialog-body {
  padding: 24px;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
```

```javascript
function showConfirmDialog() {
  FakeWindow.showCentered('confirm-dialog', {
    modal: true,
    backdropClose: false,
    onShow: () => {
      console.log('对话框已显示');
    }
  });
}

function confirmDelete() {
  // 执行删除操作
  console.log('已删除');
  FakeWindow.hide('confirm-dialog');
}
```

### 2. 右键上下文菜单

```html
<div id="context-menu" class="fake-window-wrapper">
  <div class="context-menu-content">
    <div class="menu-item" onclick="handleEdit()">
      <span class="menu-icon">✏️</span>
      <span>编辑</span>
    </div>
    <div class="menu-item" onclick="handleCopy()">
      <span class="menu-icon">📋</span>
      <span>复制</span>
    </div>
    <div class="menu-divider"></div>
    <div class="menu-item danger" onclick="handleDelete()">
      <span class="menu-icon">🗑️</span>
      <span>删除</span>
    </div>
  </div>
</div>
```

```css
.context-menu-content {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 180px;
  padding: 6px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: #f0f0f0;
}

.menu-item.danger {
  color: #ff3b30;
}

.menu-divider {
  height: 1px;
  background: #ddd;
  margin: 6px 0;
}
```

```javascript
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  FakeWindow.showAt('context-menu', e.clientX, e.clientY, {
    backdropClose: true,
    adjustPosition: true
  });
});

function handleEdit() {
  console.log('编辑');
  FakeWindow.hide('context-menu');
}

function handleCopy() {
  console.log('复制');
  FakeWindow.hide('context-menu');
}

function handleDelete() {
  console.log('删除');
  FakeWindow.hide('context-menu');
}
```

### 3. 工具提示窗口

```html
<div id="tooltip" class="fake-window-wrapper">
  <div class="tooltip-content">
    <div class="tooltip-title">提示</div>
    <div class="tooltip-text">这是一个提示信息</div>
  </div>
</div>
```

```css
.tooltip-content {
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border-radius: 6px;
  padding: 12px 16px;
  max-width: 300px;
  font-size: 14px;
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 4px;
}
```

```javascript
function showTooltip(x, y, title, text) {
  document.querySelector('#tooltip .tooltip-title').textContent = title;
  document.querySelector('#tooltip .tooltip-text').textContent = text;
  
  FakeWindow.showAt('tooltip', x, y + 10, {
    modal: false,
    adjustPosition: true
  });
}

// 3秒后自动隐藏
setTimeout(() => {
  FakeWindow.hide('tooltip');
}, 3000);
```

### 4. 图片预览窗口

```html
<div id="image-preview" class="fake-window-wrapper">
  <div class="preview-content">
    <button class="preview-close" onclick="FakeWindow.hide('image-preview')">×</button>
    <img id="preview-image" src="" alt="预览">
  </div>
</div>
```

```css
.preview-content {
  position: relative;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-width: 90vw;
  max-height: 90vh;
}

.preview-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border-radius: 50%;
  font-size: 24px;
  cursor: pointer;
  z-index: 1;
}

#preview-image {
  max-width: 100%;
  max-height: 80vh;
  display: block;
}
```

```javascript
function previewImage(imageSrc) {
  document.getElementById('preview-image').src = imageSrc;
  FakeWindow.showCentered('image-preview', {
    modal: true,
    backdropClose: true
  });
}
```
## 象限模式详解

象限模式是一种智能定位系统，特别适合右键菜单、下拉菜单等需要根据可用空间自动调整位置的场景。

### 工作原理

以指定坐标（通常是鼠标位置）为原点，将视口划分为四个象限：

```
|II |II |I  |
|II |II |I  |
|III|III|IV |

象限编号：
- I (1) = 右上
- II (2) = 左上
- III (3) = 左下
- IV (4) = 右下
```

### 配置参数

```javascript
FakeWindow.showAt('menu', x, y, {
  quadrantMode: true,      // 启用象限模式
  primaryQuadrant: 4,      // 主象限（优先显示的象限）
  minMargin: 10           // 最小边距（像素）
});
```

### 切换逻辑

以 `primaryQuadrant: 4`（右下）为例：

| 右边空间 | 下边空间 | 显示象限 |
|---------|---------|---------|
| ✅ | ✅ | IV（右下） |
| ❌ | ✅ | III（左下） |
| ✅ | ❌ | I（右上） |
| ❌ | ❌ | II（左上） |

### 使用示例

#### 右键菜单

```javascript
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  FakeWindow.showAt('context-menu', e.clientX, e.clientY, {
    backdropClose: true,
    quadrantMode: true,
    primaryQuadrant: 4,  // 优先右下
    minMargin: 10
  });
});
```

#### 按钮下拉菜单

```javascript
function showDropdown(button) {
  const rect = button.getBoundingClientRect();
  FakeWindow.showAt('dropdown', rect.left, rect.bottom, {
    backdropClose: true,
    quadrantMode: true,
    primaryQuadrant: 4,  // 优先在按钮右下方
    minMargin: 5
  });
}
```

#### 工具提示

```javascript
function showTooltip(element, text) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  FakeWindow.showAt('tooltip', centerX, centerY, {
    quadrantMode: true,
    primaryQuadrant: 1,  // 优先在元素右上方
    minMargin: 8
  });
}
```

### 四种主象限的应用场景

| 主象限 | 适用场景 | 示例 |
|--------|---------|------|
| 1（右上） | 元素下方的提示 | 输入框验证提示 |
| 2（左上） | 右侧元素的菜单 | 侧边栏按钮菜单 |
| 3（左下） | 右上角的下拉菜单 | 用户头像菜单 |
| 4（右下） | 右键菜单、常规下拉 | 上下文菜单 |

### 与普通模式对比

| 特性 | 普通模式 | 象限模式 |
|------|---------|---------|
| 定位方式 | 固定坐标 | 智能象限 |
| 边界处理 | 简单平移 | 象限切换 |
| 适用场景 | 固定位置窗口 | 动态菜单 |
| 用户体验 | 可能被裁剪 | 始终完整显示 |


## 高级用法

### 1. 多窗口管理

```javascript
// 显示多个窗口
FakeWindow.showCentered('window1', { zIndex: 10001 });
FakeWindow.showCentered('window2', { zIndex: 10002 });

// 将窗口1置顶
FakeWindow.bringToFront('window1');

// 关闭所有窗口
FakeWindow.hideAll();
```

### 2. 生命周期钩子

```javascript
FakeWindow.showCentered('my-window', {
  onShow: (element) => {
    console.log('窗口显示', element);
    // 初始化窗口内容
    initWindowContent();
  },
  onHide: (element) => {
    console.log('窗口隐藏', element);
    // 清理资源
    cleanupResources();
  }
});
```

### 3. 动态内容更新

```javascript
// 显示窗口
FakeWindow.showCentered('dynamic-window');

// 动态更新内容
const windowElement = document.getElementById('dynamic-window');
const contentElement = windowElement.querySelector('.window-content');
contentElement.innerHTML = '<p>新内容</p>';
```

### 4. 键盘快捷键

```javascript
document.addEventListener('keydown', (e) => {
  // Ctrl+K 显示命令面板
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    FakeWindow.showCentered('command-palette', {
      modal: true,
      backdropClose: true
    });
  }
});
```

## 样式自定义

### 自动注入的样式

fake-window.js 只注入以下基础样式（外层容器）：

```css
.fake-window-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  display: none;
  pointer-events: none;
}

.fake-window-wrapper.show {
  display: block;
}

.fake-window-wrapper.modal {
  pointer-events: auto;
}

.fake-window-wrapper.centered {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fake-window-wrapper.positioned > * {
  position: fixed;
}
```

### 用户自定义样式

窗口内容的所有样式由用户完全控制：

```css
/* 背景遮罩 */
.fake-window-wrapper.modal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

/* 窗口内容 */
.my-window-content {
  position: relative;
  z-index: 1;
  /* 其他样式... */
}
```

## 注意事项

1. **元素 ID 必须唯一**：每个窗口元素必须有唯一的 ID
2. **HTML 结构**：窗口元素必须在 DOM 中预先定义
3. **样式控制**：窗口内容样式完全由用户 CSS 控制
4. **事件清理**：隐藏窗口时会自动清理事件监听器
5. **z-index 管理**：默认自动递增，也可手动指定
6. **边界检测**：自定义位置模式默认启用边界检测
7. **模态行为**：居中模式默认为模态，自定义位置模式默认非模态

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Opera 47+

## 演示页面

打开 [`fake-window-standalone.html`](./fake-window-standalone.html) 查看完整的使用示例和效果演示。

## 与其他组件对比

| 特性 | Toast | FakeWindow |
|------|-------|------------|
| 用途 | 临时通知 | 交互式窗口 |
| 模态 | 否 | 可选 |
| 位置 | 固定位置 | 灵活定位 |
| 内容 | 简单文本 | 复杂 HTML |
| 样式 | 内置 | 用户定义 |
| 交互 | 最小化 | 丰富交互 |

## 许可证

MIT License