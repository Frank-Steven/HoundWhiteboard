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

## 文件结构

```
src/templates/
├── css/
│   └── inline-toast.css           # 样式文件
└── js/
    └── inline-toast.js            # 核心组件
```

## 快速开始

### 1. 引入文件

在HTML中引入必要的CSS和JS文件：

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="../css/inline-toast.css"/>
</head>
<body>
  <!-- 提示框容器（可选，组件会自动创建） -->
  <div id="toast-container"></div>
  
  <script src="../js/inline-toast.js"></script>
</body>
</html>
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

## 演示页面

打开 `dev/toast/inline-toast.html` 查看完整的使用示例和效果演示。

## 许可证

MIT License