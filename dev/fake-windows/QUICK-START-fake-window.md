# 伪窗口工具 - 快速开始指南

## 🚀 集成到项目

在 JavaScript 文件中使用 `require` 引入模块：

```javascript
const FakeWindow = require('./utils/ui/fake-window');

// 居中显示窗口
FakeWindow.showCentered('my-window', { modal: true });

// 自定义位置显示
FakeWindow.showAt('context-menu', 100, 200);
```

**优势**：
- ✅ 外层容器样式自动注入
- ✅ 窗口内容样式完全自定义
- ✅ 简洁的 API 设计
- ✅ 适用于 Electron 和现代前端项目

## 💡 基础用法

### 1. 居中模态窗口

```html
<!-- HTML 定义窗口结构 -->
<div id="my-dialog" class="fake-window-wrapper">
  <div class="dialog-box">
    <h2>确认操作</h2>
    <p>确定要继续吗？</p>
    <div class="dialog-buttons">
      <button onclick="FakeWindow.hide('my-dialog')">取消</button>
      <button onclick="confirm()">确定</button>
    </div>
  </div>
</div>
```

```css
/* CSS 定义窗口样式 */
.dialog-box {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-width: 400px;
  width: 90%;
}

.dialog-buttons {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: flex-end;
}
```

```javascript
// JavaScript 显示窗口
FakeWindow.showCentered('my-dialog', {
  modal: true,
  backdropClose: true
});
```

### 2. 右键上下文菜单

```html
<div id="context-menu" class="fake-window-wrapper">
  <div class="menu-list">
    <div class="menu-item" onclick="handleEdit()">编辑</div>
    <div class="menu-item" onclick="handleCopy()">复制</div>
    <div class="menu-item" onclick="handleDelete()">删除</div>
  </div>
</div>
```

```css
.menu-list {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 150px;
}

.menu-item {
  padding: 10px 16px;
  cursor: pointer;
}

.menu-item:hover {
  background: #f0f0f0;
}
```

```javascript
// 使用象限模式智能定位
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  FakeWindow.showAt('context-menu', e.clientX, e.clientY, {
    backdropClose: true,
    quadrantMode: true,      // 启用象限模式
    primaryQuadrant: 4,      // 主象限：右下
    minMargin: 10           // 最小边距
  });
});

function handleEdit() {
  console.log('编辑');
  FakeWindow.hide('context-menu');
}
```

**象限模式说明：**

以鼠标位置为原点，根据可用空间智能选择显示位置：

```
┌─────────────────┐
│  II  │  I       │  象限编号：
│──────●──────────│  1 = 右上
│      │          │  2 = 左上
│ III  │  IV      │  3 = 左下
└─────────────────┘  4 = 右下（默认）
```

主象限4的切换逻辑：
- 右下都有空间 → 第四象限（右下）
- 右边超出 → 第三象限（左下）
- 下边超出 → 第一象限（右上）
- 都超出 → 第二象限（左上）

### 3. 添加背景遮罩

```css
/* 为居中窗口添加背景遮罩 */
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

/* 确保窗口内容在遮罩之上 */
.dialog-box {
  position: relative;
  z-index: 1;
}
```

## 📋 API 速查

### 显示窗口

```javascript
// 居中显示（模态）
FakeWindow.showCentered(elementId, {
  modal: true,              // 是否模态
  backdropClose: true,      // 点击背景关闭
  zIndex: 10001,           // 自定义层级
  onShow: (el) => {},      // 显示回调
  onHide: (el) => {}       // 隐藏回调
});

// 自定义位置显示
FakeWindow.showAt(elementId, x, y, {
  modal: false,            // 是否模态
  backdropClose: true,     // 点击外部关闭
  adjustPosition: true,    // 自动调整位置
  quadrantMode: false,     // 象限模式
  primaryQuadrant: 4,      // 主象限(1-4)
  minMargin: 10,          // 最小边距
  zIndex: 10001,          // 自定义层级
  onShow: (el) => {},     // 显示回调
  onHide: (el) => {}      // 隐藏回调
});
```

### 隐藏窗口

```javascript
// 隐藏指定窗口
FakeWindow.hide('my-window');

// 隐藏所有窗口
FakeWindow.hideAll();
```

### 工具方法

```javascript
// 检查是否可见
if (FakeWindow.isVisible('my-window')) {
  console.log('窗口正在显示');
}

// 置顶显示
FakeWindow.bringToFront('my-window');
```

## 🎨 常用示例

### 确认对话框

```javascript
function showConfirmDialog(message, onConfirm) {
  // 更新对话框内容
  document.querySelector('#confirm-dialog .message').textContent = message;
  
  // 显示对话框
  FakeWindow.showCentered('confirm-dialog', {
    modal: true,
    backdropClose: false,
    onShow: () => {
      // 绑定确认按钮事件
      document.getElementById('confirm-btn').onclick = () => {
        onConfirm();
        FakeWindow.hide('confirm-dialog');
      };
    }
  });
}

// 使用
showConfirmDialog('确定要删除吗？', () => {
  console.log('已确认删除');
});
```

### 加载提示窗口

```javascript
function showLoading(message = '加载中...') {
  document.querySelector('#loading .message').textContent = message;
  FakeWindow.showCentered('loading', {
    modal: true,
    backdropClose: false
  });
}

function hideLoading() {
  FakeWindow.hide('loading');
}

// 使用
async function loadData() {
  showLoading('正在加载数据...');
  try {
    await fetchData();
    hideLoading();
  } catch (error) {
    hideLoading();
    showError('加载失败');
  }
}
```

### 图片预览

```javascript
function previewImage(imageSrc) {
  const img = document.querySelector('#image-preview img');
  img.src = imageSrc;
  
  FakeWindow.showCentered('image-preview', {
    modal: true,
    backdropClose: true,
    onShow: () => {
      // 图片加载完成后调整大小
      img.onload = () => {
        console.log('图片已加载');
      };
    }
  });
}

// 使用
document.querySelectorAll('.thumbnail').forEach(thumb => {
  thumb.addEventListener('click', () => {
    previewImage(thumb.dataset.fullImage);
  });
});
```

### 表单编辑器

```javascript
function showEditor(data) {
  // 填充表单数据
  document.getElementById('editor-name').value = data.name;
  document.getElementById('editor-email').value = data.email;
  
  FakeWindow.showCentered('editor-dialog', {
    modal: true,
    backdropClose: false,
    onShow: () => {
      // 聚焦第一个输入框
      document.getElementById('editor-name').focus();
    }
  });
}

function saveEditor() {
  const data = {
    name: document.getElementById('editor-name').value,
    email: document.getElementById('editor-email').value
  };
  
  console.log('保存数据', data);
  FakeWindow.hide('editor-dialog');
}
```

## 🎯 象限模式详解

象限模式是智能定位系统，让窗口根据可用空间自动选择最佳显示位置。

### 基本概念

象限布局：

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

### 快速使用

```javascript
// 右键菜单 - 最常用
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  FakeWindow.showAt('menu', e.clientX, e.clientY, {
    quadrantMode: true,
    primaryQuadrant: 4,  // 优先右下
    minMargin: 10
  });
});
```

### 四种主象限

```javascript
// 1. 右下（最常用 - 右键菜单）
FakeWindow.showAt('menu', x, y, {
  quadrantMode: true,
  primaryQuadrant: 4
});

// 2. 右上（按钮下拉菜单）
FakeWindow.showAt('dropdown', x, y, {
  quadrantMode: true,
  primaryQuadrant: 1
});

// 3. 左上（右侧工具栏）
FakeWindow.showAt('toolbar-menu', x, y, {
  quadrantMode: true,
  primaryQuadrant: 2
});

// 4. 左下（右上角菜单）
FakeWindow.showAt('user-menu', x, y, {
  quadrantMode: true,
  primaryQuadrant: 3
});
```

### 切换规则

主象限4（右下）的自动切换：
- ✅ 右下空间充足 → 显示在右下（IV）
- ⚠️ 右边不够 → 切换到左下（III）
- ⚠️ 下边不够 → 切换到右上（I）
- ⚠️ 都不够 → 切换到左上（II）

### 下拉菜单（象限模式）

```javascript
function showDropdown(buttonElement) {
  const rect = buttonElement.getBoundingClientRect();
  const x = rect.left;
  const y = rect.bottom;
  
  FakeWindow.showAt('dropdown-menu', x, y, {
    backdropClose: true,
    quadrantMode: true,
    primaryQuadrant: 4,  // 优先右下
    minMargin: 10
  });
}

// 使用
document.getElementById('menu-button').addEventListener('click', (e) => {
  showDropdown(e.target);
});
```

## 🔧 高级技巧

### 1. 窗口动画

```css
/* 淡入动画 */
.fake-window-wrapper.show .dialog-box {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 滑入动画 */
.fake-window-wrapper.show .menu-list {
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 2. 响应式设计

```css
/* 移动端适配 */
@media (max-width: 600px) {
  .dialog-box {
    width: 95%;
    max-width: none;
    margin: 0 auto;
  }
  
  .dialog-buttons {
    flex-direction: column-reverse;
  }
  
  .dialog-buttons button {
    width: 100%;
  }
}
```

### 3. 主题适配

```css
/* 使用 CSS 变量支持主题 */
.dialog-box {
  background: var(--bg-color, white);
  color: var(--text-color, black);
  border: 1px solid var(--border-color, #ddd);
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .dialog-box {
    --bg-color: #2c2c2c;
    --text-color: #ffffff;
    --border-color: #444;
  }
}
```

### 4. 键盘快捷键

```javascript
// ESC 键自动关闭（已内置）
// 可以添加其他快捷键

document.addEventListener('keydown', (e) => {
  // Enter 键确认
  if (e.key === 'Enter' && FakeWindow.isVisible('confirm-dialog')) {
    document.getElementById('confirm-btn').click();
  }
  
  // Ctrl+K 打开命令面板
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    FakeWindow.showCentered('command-palette');
  }
});
```

### 5. 多窗口管理

```javascript
// 显示多个窗口
function showMultipleWindows() {
  FakeWindow.showCentered('window1', { zIndex: 10001 });
  
  setTimeout(() => {
    FakeWindow.showCentered('window2', { zIndex: 10002 });
  }, 500);
}

// 关闭所有窗口
function closeAllWindows() {
  FakeWindow.hideAll();
}

// 窗口切换
function switchWindow(fromId, toId) {
  FakeWindow.hide(fromId);
  setTimeout(() => {
    FakeWindow.showCentered(toId);
  }, 300);
}
```

## 📱 移动端优化

### 触摸事件支持

```javascript
// 支持触摸事件
let touchStartX, touchStartY;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  
  // 长按显示菜单
  if (Math.abs(touchEndX - touchStartX) < 10 && 
      Math.abs(touchEndY - touchStartY) < 10) {
    FakeWindow.showAt('context-menu', touchEndX, touchEndY);
  }
});
```

### 防止页面滚动

```javascript
FakeWindow.showCentered('my-dialog', {
  modal: true,
  onShow: () => {
    // 阻止背景滚动
    document.body.style.overflow = 'hidden';
  },
  onHide: () => {
    // 恢复滚动
    document.body.style.overflow = '';
  }
});
```

## 🌐 浏览器兼容性

✅ Chrome 60+  
✅ Firefox 55+  
✅ Safari 12+  
✅ Edge 79+  
✅ Opera 47+

## 📚 更多信息

查看完整文档：[`README-fake-window.md`](./README-fake-window.md)

## 🎯 快速测试

创建测试文件：

```html
<!DOCTYPE html>
<html>
<head>
  <title>FakeWindow 测试</title>
  <style>
    .dialog-box {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      max-width: 400px;
    }
    
    .fake-window-wrapper.modal::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>
  <button onclick="test()">测试窗口</button>
  
  <div id="test-window" class="fake-window-wrapper">
    <div class="dialog-box">
      <h2>测试窗口</h2>
      <p>这是一个测试窗口</p>
      <button onclick="FakeWindow.hide('test-window')">关闭</button>
    </div>
  </div>
  
  <script>
    const FakeWindow = require('./utils/ui/fake-window');
    
    function test() {
      FakeWindow.showCentered('test-window', {
        modal: true,
        backdropClose: true
      });
    }
  </script>
</body>
</html>
```

## ✨ 特色功能

1. ✅ **零依赖** - 纯原生 JavaScript 实现
2. ✅ **轻量级** - 核心代码简洁高效
3. ✅ **易使用** - 简洁的 API 设计
4. ✅ **高定制** - 样式完全自定义
5. ✅ **双模式** - 居中和自定义位置
6. ✅ **智能定位** - 自动边界检测
7. ✅ **事件支持** - 完整的回调机制
8. ✅ **模块化** - CommonJS 模块系统
9. ✅ **自动注入** - 外层样式自动加载
10. ✅ **灵活控制** - 内容样式用户定义

## 💡 最佳实践

### 1. 统一管理

```javascript
// utils/dialog.js
const FakeWindow = require('./ui/fake-window');

module.exports = {
  confirm: (message, onConfirm) => {
    // 显示确认对话框
  },
  alert: (message) => {
    // 显示提示对话框
  },
  prompt: (message, defaultValue) => {
    // 显示输入对话框
  }
};
```

### 2. 错误处理

```javascript
function showWindow(id) {
  const success = FakeWindow.showCentered(id);
  if (!success) {
    console.error(`无法显示窗口: ${id}`);
  }
}
```

### 3. 内存管理

```javascript
// 确保窗口隐藏时清理资源
FakeWindow.showCentered('my-window', {
  onHide: () => {
    // 清理定时器
    clearInterval(timer);
    // 清理事件监听器
    element.removeEventListener('click', handler);
  }
});
```

---

**开始使用吧！** 🚀
