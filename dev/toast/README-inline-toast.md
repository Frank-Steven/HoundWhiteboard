# 内联提示框组件 (Inline Toast)

一个功能完整、易于使用的通用内联提示框组件，支持多种自定义选项和动画效果。

## 功能特性

✅ **多种预设主题**：成功、警告、错误、信息四种类型  
✅ **自定义图标**：支持SVG、图片URL、Emoji等多种图标格式  
✅ **灵活定位**：6种位置选项（上/下 × 左/中/右）  
✅ **动画效果**：滑入和淡入两种动画，支持自定义  
✅ **自动/手动关闭**：可配置自动关闭时间或手动关闭  
✅ **进度条显示**：可选的倒计时进度条  
✅ **自定义样式**：支持自定义背景色、文字颜色、图标大小等  
✅ **事件回调**：支持点击和关闭事件回调  
✅ **响应式设计**：兼容移动端和桌面端  
✅ **浏览器兼容**：支持所有主流现代浏览器  
✅ **模块化设计**：使用 CommonJS 模块系统，易于集成  
✅ **零依赖**：纯原生 JavaScript 实现

## 文件结构

```
src/utils/ui/
└── toast.js            # 核心组件（样式已内联）
```

## 快速开始

### 1. 引入模块

在 JavaScript 文件中使用 `require` 引入类并创建实例：

```javascript
const Toast = require('./utils/ui/toast');
const toast = new Toast();

// 使用提示框
toast.success('操作成功！');
```

**特性**：
- ✅ 样式已内联到 JS 文件中，自动注入到页面
- ✅ 无需手动引入 CSS 文件
- ✅ 打包友好，不依赖文件系统
- ✅ 支持自定义父容器

### 1.1 自定义父容器（可选）

```javascript
const Toast = require('./utils/ui/toast');
const customToast = new Toast(document.getElementById('my-container'));
customToast.success('操作成功！');
```

### 2. 基础使用

```javascript
// 成功提示
toast.success('操作成功！');

// 警告提示
toast.warning('请注意检查输入');

// 错误提示
toast.error('操作失败，请重试');

// 信息提示
toast.info('这是一条提示信息');
```

## API 文档

### 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | String | `'info'` | 提示类型：`success`、`warning`、`error`、`info` |
| `message` | String | `''` | 提示文本内容 |
| `icon` | String/null | `null` | 自定义图标（SVG字符串、图片URL或Emoji） |
| `iconSize` | Number | `24` | 图标大小（像素） |
| `iconPosition` | String | `'left'` | 图标位置：`left`、`right` |
| `duration` | Number | `3000` | 自动关闭时间（毫秒），0表示不自动关闭 |
| `position` | String | `'top-right'` | 位置：`top-left`、`top-center`、`top-right`、`bottom-left`、`bottom-center`、`bottom-right` |
| `backgroundColor` | String/null | `null` | 自定义背景色 |
| `textColor` | String/null | `null` | 自定义文字颜色 |
| `showClose` | Boolean | `true` | 是否显示关闭按钮 |
| `showProgress` | Boolean | `false` | 是否显示进度条 |
| `animation` | String | `'slideIn'` | 动画类型：`slideIn`、`fadeIn` |
| `onClose` | Function/null | `null` | 关闭时的回调函数 |
| `onClick` | Function/null | `null` | 点击时的回调函数 |
| `customClass` | String | `''` | 自定义CSS类名 |

### 方法

#### `toast.show(options)`
显示一个提示框，返回提示框实例。

```javascript
const toastInstance = toast.show({
  type: 'success',
  message: '操作成功',
  duration: 3000
});
```

#### `toast.success(message, options)`
显示成功提示的快捷方法。

```javascript
toast.success('保存成功', { duration: 2000 });
```

#### `toast.warning(message, options)`
显示警告提示的快捷方法。

```javascript
toast.warning('请检查输入', { showProgress: true });
```

#### `toast.error(message, options)`
显示错误提示的快捷方法。

```javascript
toast.error('操作失败', { duration: 4000 });
```

#### `toast.info(message, options)`
显示信息提示的快捷方法。

```javascript
toast.info('提示信息', { position: 'top-center' });
```

#### `toast.close(toastInstance)`
关闭指定的提示框。

```javascript
const instance = toast.info('消息');
setTimeout(() => toast.close(instance), 2000);
```

#### `toast.closeAll()`
关闭所有提示框。

```javascript
toast.closeAll();
```

## 使用示例

### 1. 基础类型

```javascript
const Toast = require('./utils/ui/toast');
const toast = new Toast();

// 成功提示
toast.success('数据保存成功！', {
  duration: 3000,
  showProgress: true
});

// 警告提示
toast.warning('请检查必填项', {
  duration: 3000
});

// 错误提示
toast.error('网络连接失败', {
  duration: 4000
});

// 信息提示
toast.info('系统将在5分钟后维护', {
  duration: 5000
});
```

### 2. 自定义图标

```javascript
// SVG图标
const customSVG = `
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
  </svg>
`;

toast.show({
  type: 'info',
  message: '自定义SVG图标',
  icon: customSVG,
  iconSize: 28
});

// 图片图标
toast.show({
  type: 'success',
  message: '使用图片图标',
  icon: './path/to/icon.png',
  iconSize: 32
});

// Emoji图标
toast.show({
  type: 'info',
  message: '任务完成！',
  icon: '🎉',
  iconSize: 28
});
```

### 3. 自定义样式

```javascript
// 自定义颜色
toast.show({
  type: 'info',
  message: '自定义样式提示',
  backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  textColor: '#ffffff',
  duration: 3000
});

// 大图标
toast.show({
  type: 'success',
  message: '大图标提示',
  iconSize: 40,
  duration: 3000
});

// 无图标
toast.show({
  type: 'info',
  message: '无图标提示',
  icon: null,
  duration: 3000
});
```

### 4. 位置和动画

```javascript
// 顶部居中
toast.info('顶部提示', {
  position: 'top-center',
  animation: 'slideIn'
});

// 底部右侧
toast.success('底部提示', {
  position: 'bottom-right',
  animation: 'fadeIn'
});

// 左侧
toast.warning('左侧提示', {
  position: 'top-left'
});
```

### 5. 自动/手动关闭

```javascript
// 自动关闭（带进度条）
toast.info('3秒后自动关闭', {
  duration: 3000,
  showProgress: true
});

// 手动关闭
toast.warning('需要手动关闭', {
  duration: 0,
  showClose: true
});

// 长文本
toast.info('这是一条很长的提示消息，用于演示提示框如何处理长文本内容...', {
  duration: 5000,
  showProgress: true
});
```

### 6. 事件回调

```javascript
// 关闭回调
toast.success('操作完成', {
  duration: 3000,
  onClose: () => {
    console.log('提示框已关闭');
    // 执行后续操作
  }
});

// 点击回调
toast.info('点击查看详情', {
  duration: 0,
  onClick: (element) => {
    alert('您点击了提示框');
    // 跳转到详情页等操作
  }
});
```

### 7. 多个提示框

```javascript
// 连续显示多个提示框
toast.success('第一条消息', { position: 'top-right' });

setTimeout(() => {
  toast.warning('第二条消息', { position: 'top-right' });
}, 500);

setTimeout(() => {
  toast.error('第三条消息', { position: 'top-right' });
}, 1000);
```

### 8. 在 Electron 渲染进程中使用

```javascript
// 在渲染进程的 JavaScript 文件中
const Toast = require('./utils/ui/toast');
const toast = new Toast();

// 监听主进程消息
const { ipcRenderer } = require('electron');

ipcRenderer.on('show-notification', (event, message) => {
  toast.success(message, {
    duration: 3000,
    showProgress: true
  });
});

// 表单提交示例
document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    await saveData();
    toast.success('保存成功', { showProgress: true });
  } catch (error) {
    toast.error('保存失败：' + error.message);
  }
});
```

## 样式自定义

### 通过CSS变量自定义

```css
/* 自定义主题颜色 */
.toast-success {
  background-color: rgba(76, 175, 80, 0.95) !important;
}

.toast-warning {
  background-color: rgba(255, 152, 0, 0.95) !important;
}

.toast-error {
  background-color: rgba(244, 67, 54, 0.95) !important;
}

.toast-info {
  background-color: rgba(33, 150, 243, 0.95) !important;
}
```

### 通过自定义类

```javascript
toast.show({
  type: 'info',
  message: '自定义样式',
  customClass: 'my-custom-toast'
});
```

```css
.my-custom-toast {
  border: 2px solid #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  font-weight: bold;
}
```

## 模块化优势

### 1. 简化集成
- 无需在 HTML 中手动引入 CSS 文件
- 一行代码即可引入并使用
- 样式自动加载，避免遗漏

### 2. 更好的依赖管理
- 使用 CommonJS 模块系统
- 明确的依赖关系
- 易于维护和更新

### 3. 适用场景
- Electron 应用
- Node.js 环境（配合打包工具）
- 使用 Webpack/Browserify 等打包工具的项目

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Opera 47+

## 注意事项

1. 确保在DOM加载完成后使用组件
2. 多个提示框会自动堆叠显示
3. 自定义图标时，SVG需要是完整的字符串
4. 图片图标建议使用相对路径或绝对URL
5. 进度条仅在设置了自动关闭时间时有效
6. 样式会在模块加载时自动注入到页面
7. 模块导出的是类，需要实例化后使用
8. 支持创建多个独立的 toast 实例

## 演示页面

打开 `dev/toast/inline-toast-standalone.html` 查看完整的使用示例和效果演示。

## 技术细节

### 模块结构
- **toast.js**: 核心逻辑，导出 `InlineToast` 类
- 样式已内联到 JS 文件中，无需单独的 CSS 文件

### 样式加载机制
模块在加载时自动将内联的 CSS 内容注入到页面的 `<head>` 中：
- 使用 `<style>` 标签注入样式
- 通过 ID 检查避免重复注入
- 打包友好，不依赖文件系统读取
- 适用于 Electron 和各种打包工具

### 实例化模式
模块导出的是 `InlineToast` 类，而非单例实例：
- 支持创建多个独立的 toast 管理器
- 每个实例可以有自己的父容器
- 灵活性更高，适用于复杂场景

## 许可证

MIT License