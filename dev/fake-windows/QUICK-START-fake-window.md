# 伪窗口工具 - 快速开始指南

基于面向对象设计的窗口管理系统快速入门教程。

## 🎯 特性

- ✅ **完整的 OOP 设计** - ES6+ Class 语法
- ✅ **事件系统** - 观察者模式
- ✅ **工厂模式** - 便捷创建窗口
- ✅ **私有字段** - 严格的封装
- ✅ **Getter/Setter** - 属性访问控制
- ✅ **链式调用** - 流畅的 API
- ✅ **生命周期钩子** - 完整的事件回调

## 🚀 快速集成

### 1. 引入模块

```javascript
// 方式一：引入主类
const FakeWindow = require('./utils/ui/fake-window');

// 方式二：解构引入
const { FakeWindow, WindowFactory } = require('./utils/ui/fake-window');
```

## 💡 基础用法

### 方式一：使用构造函数（推荐用于自定义配置）

```javascript
// 创建窗口实例
const window = new FakeWindow(document.getElementById('my-window'), {
  mode: 'centered',      // 居中模式
  modal: true,           // 模态窗口
  backdropClose: true    // 点击背景关闭
});

// 显示窗口
window.show();

// 隐藏窗口
window.hide();

// 切换显示
window.toggle();
```

### 方式二：使用工厂模式（推荐用于标准场景）

```javascript
// 创建对话框
const dialog = WindowFactory.createDialog(element);

// 创建右键菜单
const menu = WindowFactory.createContextMenu(element);

// 创建工具提示
const tooltip = WindowFactory.createTooltip(element);

// 显示
dialog.show();
menu.showAt(100, 200);
```

## 📚 核心概念

### 1. 窗口模式

#### 居中模式 (Centered)

窗口在视口中央显示，通常用于对话框、提示框等。

```javascript
const dialog = new FakeWindow(element, {
  mode: 'centered',
  modal: true
});

dialog.showCentered();
```

#### 定位模式 (Positioned)

窗口在指定坐标显示，通常用于右键菜单、下拉菜单等。

```javascript
const menu = new FakeWindow(element, {
  mode: 'positioned',
  quadrantMode: true  // 启用智能定位
});

menu.showAt(x, y);
```

### 2. 事件系统

基于观察者模式的完整事件系统。

```javascript
const window = new FakeWindow(element);

// 注册事件监听器
window.on('show', (element) => {
  console.log('窗口已显示', element);
});

window.on('hide', (element) => {
  console.log('窗口已隐藏', element);
});

// 生命周期钩子
window.on('beforeShow', () => {
  console.log('即将显示');
});

window.on('beforeHide', () => {
  console.log('即将隐藏');
});
```

### 3. 属性访问

使用 Getter/Setter 访问和修改属性。

```javascript
// 获取属性
console.log(window.visible);  // 是否可见
console.log(window.mode);     // 显示模式
console.log(window.modal);    // 是否模态

// 设置属性
window.mode = 'centered';
window.modal = true;

// 获取配置对象
const config = window.config;
console.log(config);
```

### 4. 链式调用

所有返回 `this` 的方法都支持链式调用。

```javascript
window
  .updateConfig({ modal: false })
  .show()
  .bringToFront();

// 事件注册也支持链式
window
  .on('show', handler1)
  .on('hide', handler2)
  .showCentered();
```

## 🎨 实战示例

### 示例 1：确认对话框

```html
<!-- HTML -->
<div id="confirm-dialog" class="fake-window-wrapper">
  <div class="dialog-box">
    <h2>确认操作</h2>
    <p>确定要删除这个项目吗？</p>
    <div class="dialog-buttons">
      <button onclick="confirmDialog.hide()">取消</button>
      <button onclick="handleConfirm()">确定</button>
    </div>
  </div>
</div>
```

```css
/* CSS */
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
```

```javascript
// JavaScript - 使用工厂模式
const confirmDialog = WindowFactory.createDialog(
  document.getElementById('confirm-dialog')
);

// 添加事件监听
confirmDialog.on('show', () => {
  console.log('对话框已显示');
});

// 显示对话框
function showConfirm() {
  confirmDialog.showCentered();
}

// 处理确认
function handleConfirm() {
  console.log('已确认删除');
  confirmDialog.hide();
  // 执行删除操作
  deleteItem();
}
```

### 示例 2：右键菜单

```html
<!-- HTML -->
<div id="context-menu" class="fake-window-wrapper">
  <div class="menu-list">
    <div class="menu-item" onclick="handleEdit()">✏️ 编辑</div>
    <div class="menu-item" onclick="handleCopy()">📋 复制</div>
    <div class="menu-divider"></div>
    <div class="menu-item danger" onclick="handleDelete()">🗑️ 删除</div>
  </div>
</div>
```

```css
/* CSS */
.menu-list {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 180px;
  padding: 6px 0;
}

.menu-item {
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
```

```javascript
// JavaScript - 使用工厂模式创建右键菜单
const contextMenu = WindowFactory.createContextMenu(
  document.getElementById('context-menu')
);

// 监听右键事件
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  
  // 在鼠标位置显示菜单（自动象限定位）
  contextMenu.showAt(e.clientX, e.clientY);
});

// 菜单操作
function handleEdit() {
  console.log('编辑');
  contextMenu.hide();
}

function handleCopy() {
  console.log('复制');
  contextMenu.hide();
}

function handleDelete() {
  console.log('删除');
  contextMenu.hide();
}
```

### 示例 3：表单编辑器

```html
<!-- HTML -->
<div id="form-dialog" class="fake-window-wrapper">
  <div class="dialog-box">
    <h2>编辑信息</h2>
    <div class="form-group">
      <label>姓名</label>
      <input type="text" id="form-name" class="form-input">
    </div>
    <div class="form-group">
      <label>邮箱</label>
      <input type="email" id="form-email" class="form-input">
    </div>
    <div class="dialog-buttons">
      <button onclick="formDialog.hide()">取消</button>
      <button onclick="saveForm()">保存</button>
    </div>
  </div>
</div>
```

```javascript
// JavaScript - 使用构造函数创建
const formDialog = new FakeWindow(
  document.getElementById('form-dialog'),
  {
    mode: 'centered',
    modal: true,
    backdropClose: false  // 不允许点击背景关闭
  }
);

// 显示时聚焦第一个输入框
formDialog.on('show', () => {
  document.getElementById('form-name').focus();
});

// 显示表单
function showForm(data) {
  // 填充数据
  document.getElementById('form-name').value = data.name || '';
  document.getElementById('form-email').value = data.email || '';
  
  // 显示窗口
  formDialog.show();
}

// 保存表单
function saveForm() {
  const data = {
    name: document.getElementById('form-name').value,
    email: document.getElementById('form-email').value
  };
  
  console.log('保存数据:', data);
  formDialog.hide();
  
  // 提交数据
  submitData(data);
}
```

### 示例 4：图片预览

```html
<!-- HTML -->
<div id="image-preview" class="fake-window-wrapper">
  <div class="preview-content">
    <button class="preview-close" onclick="imagePreview.hide()">×</button>
    <img id="preview-image" src="" alt="预览">
  </div>
</div>
```

```css
/* CSS */
.preview-content {
  position: relative;
  z-index: 1;
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
  cursor: pointer;
}

#preview-image {
  max-width: 100%;
  max-height: 80vh;
  display: block;
}
```

```javascript
// JavaScript - 使用工厂模式
const imagePreview = WindowFactory.createModal(
  document.getElementById('image-preview')
);

// 显示图片预览
function previewImage(imageSrc) {
  const img = document.getElementById('preview-image');
  img.src = imageSrc;
  
  imagePreview.show();
}

// 使用示例
document.querySelectorAll('.thumbnail').forEach(thumb => {
  thumb.addEventListener('click', () => {
    previewImage(thumb.dataset.fullImage);
  });
});
```

### 示例 5：加载提示

```html
<!-- HTML -->
<div id="loading" class="fake-window-wrapper">
  <div class="loading-content">
    <div class="spinner"></div>
    <div class="loading-text">加载中...</div>
  </div>
</div>
```

```css
/* CSS */
.loading-content {
  position: relative;
  z-index: 1;
  background: white;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f0f0f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

```javascript
// JavaScript
const loading = new FakeWindow(
  document.getElementById('loading'),
  {
    mode: 'centered',
    modal: true,
    backdropClose: false  // 不允许关闭
  }
);

// 异步操作示例
async function loadData() {
  // 显示加载
  loading.show();
  
  try {
    const data = await fetchData();
    loading.hide();
    displayData(data);
  } catch (error) {
    loading.hide();
    showError(error.message);
  }
}
```

## 🎯 象限模式快速指南

象限模式让窗口根据可用空间自动选择最佳显示位置。

### 基本概念

```
┌─────────────────┐
│  II  │  I       │  象限编号：
│──────●──────────│  1 = 右上
│      │          │  2 = 左上
│ III  │  IV      │  3 = 左下
└─────────────────┘  4 = 右下
```

### 使用方法

```javascript
// 创建支持象限模式的窗口
const menu = new FakeWindow(element, {
  mode: 'positioned',
  quadrantMode: true,      // 启用象限模式
  primaryQuadrant: 4,      // 主象限：右下
  minMargin: 10           // 最小边距
});

// 显示菜单
menu.showAt(e.clientX, e.clientY);
```

### 四种主象限

```javascript
// 1. 右下（最常用 - 右键菜单）
const contextMenu = WindowFactory.createContextMenu(element);
contextMenu.showAt(x, y);

// 2. 右上（工具提示）
const tooltip = WindowFactory.createTooltip(element);
tooltip.showAt(x, y);

// 3. 左上（右侧菜单）
const sideMenu = new FakeWindow(element, {
  quadrantMode: true,
  primaryQuadrant: 2
});

// 4. 左下（右上角下拉）
const userMenu = new FakeWindow(element, {
  quadrantMode: true,
  primaryQuadrant: 3
});
```

## 🔧 进阶用法

### 1. 事件系统进阶

```javascript
const window = new FakeWindow(element);

// 注册多个事件
window
  .on('beforeShow', () => {
    console.log('准备显示');
    // 准备数据
  })
  .on('show', () => {
    console.log('已显示');
    // 启动动画
  })
  .on('beforeHide', () => {
    console.log('准备隐藏');
    // 保存状态
  })
  .on('hide', () => {
    console.log('已隐藏');
    // 清理资源
  });

// 一次性事件
window.once('show', () => {
  console.log('只触发一次');
});

// 移除事件
const handler = () => console.log('显示');
window.on('show', handler);
window.off('show', handler);  // 移除特定处理器
window.off('show');           // 移除所有 show 事件
```

### 2. 配置动态更新

```javascript
const window = new FakeWindow(element, {
  mode: 'centered',
  modal: true
});

// 方式一：使用 setter
window.modal = false;
window.mode = 'positioned';

// 方式二：批量更新
window.updateConfig({
  modal: true,
  backdropClose: false,
  quadrantMode: true
});

// 获取当前配置
console.log(window.config);
```

### 3. 多窗口管理

```javascript
// 创建多个窗口实例
const windows = {
  dialog: WindowFactory.createDialog(element1),
  menu: WindowFactory.createContextMenu(element2),
  tooltip: WindowFactory.createTooltip(element3),
  loading: new FakeWindow(element4, {
    mode: 'centered',
    modal: true,
    backdropClose: false
  })
};

// 显示多个窗口
windows.dialog.show();
windows.menu.showAt(100, 200);

// 关闭所有窗口
function closeAll() {
  Object.values(windows).forEach(w => w.hide());
}

// 将特定窗口置顶
windows.dialog.bringToFront();
```

### 4. 自定义扩展

```javascript
// 继承 FakeWindow 创建自定义窗口类
class NotificationWindow extends FakeWindow {
  constructor(element, options) {
    super(element, {
      mode: 'positioned',
      modal: false,
      ...options
    });
    
    this.autoHideTimer = null;
  }
  
  // 重写 show 方法
  show() {
    super.show();
    this.startAutoHide();
    return this;
  }
  
  // 添加自动隐藏功能
  startAutoHide(delay = 3000) {
    this.clearAutoHide();
    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, delay);
  }
  
  clearAutoHide() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
  
  // 重写 hide 方法
  hide() {
    this.clearAutoHide();
    return super.hide();
  }
}

// 使用自定义类
const notification = new NotificationWindow(element);
notification.showAt(window.innerWidth - 20, 20);
// 3秒后自动隐藏
```

### 5. 自定义预设

```javascript
// 注册自定义预设
WindowFactory.registerPreset('notification', {
  mode: 'positioned',
  modal: false,
  backdropClose: true,
  quadrantMode: true,
  primaryQuadrant: 1,
  minMargin: 20
});

// 使用自定义预设
const notification = WindowFactory.create(
  element,
  'notification'
);

notification.showAt(window.innerWidth - 20, 20);
```

### 6. 生命周期管理

```javascript
const window = new FakeWindow(element);

// 完整的生命周期管理
window
  .on('beforeShow', () => {
    // 1. 准备数据
    loadData();
  })
  .on('show', () => {
    // 2. 启动动画
    startAnimation();
    // 3. 绑定事件
    bindEvents();
  })
  .on('beforeHide', () => {
    // 4. 保存状态
    saveState();
  })
  .on('hide', () => {
    // 5. 清理资源
    cleanup();
    // 6. 解绑事件
    unbindEvents();
  });

// 销毁窗口
function destroyWindow() {
  window.destroy();
  // 窗口已完全销毁，无法再使用
}
```

## 🎨 最佳实践

### 1. 统一管理窗口实例

```javascript
// utils/windows.js
const { WindowFactory } = require('./ui/fake-window');

class WindowManager {
  constructor() {
    this.windows = {};
  }
  
  create(id, type, element, options = {}) {
    const createMethod = `create${type.charAt(0).toUpperCase() + type.slice(1)}`;
    this.windows[id] = WindowFactory[createMethod](element, options);
    return this.windows[id];
  }
  
  get(id) {
    return this.windows[id];
  }
  
  hideAll() {
    Object.values(this.windows).forEach(w => w.hide());
  }
  
  destroy(id) {
    if (this.windows[id]) {
      this.windows[id].destroy();
      delete this.windows[id];
    }
  }
}

// 导出单例
module.exports = new WindowManager();
```

```javascript
// 使用
const windowManager = require('./utils/windows');

// 创建窗口
windowManager.create('confirm', 'dialog', element);
windowManager.create('menu', 'contextMenu', element);

// 使用窗口
windowManager.get('confirm').show();
windowManager.get('menu').showAt(100, 200);

// 关闭所有
windowManager.hideAll();
```

### 2. 错误处理

```javascript
function showWindow(id) {
  try {
    const window = windowManager.get(id);
    
    if (!window) {
      throw new Error(`Window ${id} not found`);
    }
    
    if (window.destroyed) {
      throw new Error(`Window ${id} has been destroyed`);
    }
    
    window.show();
  } catch (error) {
    console.error('Failed to show window:', error);
    // 显示错误提示
    showError(error.message);
  }
}
```

### 3. 内存管理

```javascript
// 确保窗口隐藏时清理资源
const window = new FakeWindow(element);

window.on('hide', () => {
  // 清理定时器
  if (window.timer) {
    clearInterval(window.timer);
    window.timer = null;
  }
  
  // 清理事件监听器
  if (window.customHandler) {
    element.removeEventListener('click', window.customHandler);
    window.customHandler = null;
  }
});

// 页面卸载时销毁所有窗口
window.addEventListener('beforeunload', () => {
  windowManager.hideAll();
  Object.keys(windowManager.windows).forEach(id => {
    windowManager.destroy(id);
  });
});
```

### 4. 响应式设计

```javascript
// 根据屏幕尺寸调整窗口行为
function createResponsiveWindow(element) {
  const isMobile = window.innerWidth < 768;
  
  return new FakeWindow(element, {
    mode: 'centered',
    modal: true,
    backdropClose: !isMobile  // 移动端不允许点击背景关闭
  });
}

// 监听窗口大小变化
window.addEventListener('resize', () => {
  // 重新定位已显示的窗口
  if (menu.visible) {
    menu.hide();
    // 根据新尺寸重新显示
  }
});
```

### 5. 主题适配

```css
/* 使用 CSS 变量支持主题切换 */
.dialog-box {
  background: var(--window-bg, white);
  color: var(--window-text, black);
  border: 1px solid var(--window-border, #ddd);
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .dialog-box {
    --window-bg: #2c2c2c;
    --window-text: #ffffff;
    --window-border: #444;
  }
}
```

## 📱 移动端优化

### 触摸事件支持

```javascript
// 长按显示菜单
let touchTimer;
let touchStartX, touchStartY;

element.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  
  touchTimer = setTimeout(() => {
    menu.showAt(touchStartX, touchStartY);
  }, 500);  // 长按 500ms
});

element.addEventListener('touchend', () => {
  clearTimeout(touchTimer);
});

element.addEventListener('touchmove', () => {
  clearTimeout(touchTimer);
});
```

### 防止页面滚动

```javascript
const dialog = WindowFactory.createDialog(element);

dialog
  .on('show', () => {
    // 阻止背景滚动
    document.body.style.overflow = 'hidden';
  })
  .on('hide', () => {
    // 恢复滚动
    document.body.style.overflow = '';
  });
```

## 🌐 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Opera 47+

**注意：** 需要支持 ES6+ 特性（Class、私有字段等）

## 📚 更多资源

- [完整 API 文档](./README-fake-window.md)
- [在线示例](./fake-window-standalone.html)
- [源代码](../../src/utils/ui/fake-window.js)

## 💡 常见问题

### Q: 如何创建自定义窗口类型？

A: 继承 FakeWindow 类或使用 WindowFactory.registerPreset()

```javascript
// 方式一：继承
class CustomWindow extends FakeWindow {
  // 自定义实现
}

// 方式二：注册预设
WindowFactory.registerPreset('custom', {
  mode: 'centered',
  modal: true
});
```

### Q: 如何在窗口显示时执行初始化？

A: 使用 `beforeShow` 或 `show` 事件

```javascript
window.on('beforeShow', () => {
  // 初始化逻辑
  loadData();
});
```

### Q: 如何防止窗口被点击背景关闭？

A: 设置 `backdropClose: false`

```javascript
const window = new FakeWindow(element, {
  backdropClose: false
});
```

### Q: 如何实现窗口动画？

A: 使用 CSS 动画

```css
.fake-window-wrapper.show .dialog-box {
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Q: 如何管理多个窗口的层级？

A: 使用 `bringToFront()` 方法

```javascript
window1.show();
window2.show();
window1.bringToFront();  // 将 window1 置顶
```

---

**开始使用吧！** 🚀

查看 [完整文档](./README-fake-window.md) 了解更多高级功能。
