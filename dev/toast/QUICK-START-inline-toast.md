# 内联提示框组件 - 快速开始指南

## 🚀 集成到项目

在 JavaScript 文件中使用 `require` 引入模块：

```javascript
const toast = require('./utils/ui/toast');

// 使用提示框
toast.success('操作成功！');
```

**优势**：
- ✅ 无需在 HTML 中手动引入 CSS 文件
- ✅ 样式自动加载
- ✅ 更好的依赖管理
- ✅ 适用于 Electron 和现代前端项目

## 💡 基础用法

### 1. 简单提示
```javascript
const Toast = require('./utils/ui/toast');
const toast = new Toast();

// 成功
toast.success('保存成功！');

// 警告
toast.warning('请检查输入');

// 错误
toast.error('操作失败');

// 信息
toast.info('提示信息');
```

### 2. 带进度条
```javascript
toast.success('操作成功', {
  duration: 3000,
  showProgress: true
});
```

### 3. 自定义位置
```javascript
toast.info('顶部居中提示', {
  position: 'top-center'
});

toast.success('底部右侧提示', {
  position: 'bottom-right'
});
```

### 4. 自定义图标
```javascript
// Emoji图标
toast.show({
  type: 'info',
  message: '任务完成！',
  icon: '🎉',
  iconSize: 28
});

// 图片图标
toast.show({
  type: 'success',
  message: '上传成功',
  icon: './path/to/icon.png',
  iconSize: 32
});
```

### 5. 自定义颜色
```javascript
toast.show({
  type: 'info',
  message: '自定义样式',
  backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  textColor: '#ffffff'
});
```

### 6. 手动关闭
```javascript
toast.warning('需要手动关闭', {
  duration: 0,  // 0表示不自动关闭
  showClose: true
});
```

### 7. 事件回调
```javascript
// 关闭回调
toast.success('操作完成', {
  onClose: () => {
    console.log('提示框已关闭');
  }
});

// 点击回调
toast.info('点击查看详情', {
  onClick: () => {
    alert('您点击了提示框');
  }
});
```

## 📋 完整配置选项

```javascript
toast.show({
  type: 'success',              // 类型：success, warning, error, info
  message: '提示内容',           // 文本内容
  icon: null,                   // 自定义图标（SVG/图片URL/Emoji）
  iconSize: 24,                 // 图标大小（像素）
  iconPosition: 'left',         // 图标位置：left, right
  duration: 3000,               // 自动关闭时间（毫秒），0=不关闭
  position: 'top-right',        // 位置：top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
  backgroundColor: null,        // 自定义背景色
  textColor: null,              // 自定义文字颜色
  showClose: true,              // 显示关闭按钮
  showProgress: false,          // 显示进度条
  animation: 'slideIn',         // 动画：slideIn, fadeIn
  onClose: null,                // 关闭回调函数
  onClick: null,                // 点击回调函数
  customClass: ''               // 自定义CSS类
});
```

## 🎨 常用示例

### 表单验证提示
```javascript
const Toast = require('./utils/ui/toast');
const toast = new Toast();

function validateForm() {
  if (!username) {
    toast.error('请输入用户名', { showProgress: true });
    return false;
  }
  if (!password) {
    toast.error('请输入密码', { showProgress: true });
    return false;
  }
  toast.success('验证通过', { showProgress: true });
  return true;
}
```

### 异步操作提示
```javascript
async function saveData() {
  try {
    await api.save(data);
    toast.success('保存成功', {
      duration: 2000,
      showProgress: true
    });
  } catch (error) {
    toast.error('保存失败：' + error.message, {
      duration: 4000
    });
  }
}
```

### 多步骤操作提示
```javascript
function processSteps() {
  toast.info('开始处理...', { duration: 1000 });
  
  setTimeout(() => {
    toast.info('步骤1完成', { duration: 1000 });
  }, 1000);
  
  setTimeout(() => {
    toast.info('步骤2完成', { duration: 1000 });
  }, 2000);
  
  setTimeout(() => {
    toast.success('全部完成！', {
      duration: 3000,
      showProgress: true
    });
  }, 3000);
}
```

### Electron 应用集成
```javascript
// 在渲染进程的 JavaScript 文件中
const Toast = require('./utils/ui/toast');
const toast = new Toast();
const { ipcRenderer } = require('electron');

// 监听主进程消息
ipcRenderer.on('show-notification', (event, message) => {
  toast.success(message, {
    duration: 3000,
    showProgress: true
  });
});

// 按钮点击事件
document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    const result = await ipcRenderer.invoke('save-data', data);
    toast.success('保存成功', { showProgress: true });
  } catch (error) {
    toast.error('保存失败：' + error.message);
  }
});
```

## 🔧 高级技巧

### 1. 关闭所有提示框
```javascript
toast.closeAll();
```

### 2. 手动控制提示框
```javascript
const myToast = toast.info('处理中...', { duration: 0 });

// 稍后手动关闭
setTimeout(() => {
  toast.close(myToast);
}, 5000);
```

### 3. 自定义样式类
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

### 4. 动态加载提示
```javascript
// 加载状态
const loadingToast = toast.info('正在加载...', {
  duration: 0,
  showClose: false
});

// 加载完成后关闭并显示结果
setTimeout(() => {
  toast.close(loadingToast);
  toast.success('加载完成！', { showProgress: true });
}, 2000);
```

## 📱 响应式支持

组件自动适配移动端和桌面端：
- 移动端：提示框宽度自适应屏幕
- 桌面端：固定最大宽度400px

## 🌐 浏览器兼容性

✅ Chrome 60+  
✅ Firefox 55+  
✅ Safari 12+  
✅ Edge 79+  
✅ Opera 47+

## 📚 更多信息

查看完整文档：[`README-inline-toast.md`](./README-inline-toast.md)

## 🎯 快速测试

在项目中创建测试文件：

```javascript
// test-toast.js
const Toast = require('./utils/ui/toast');
const toast = new Toast();

// 测试所有类型
toast.success('成功提示', { showProgress: true });

setTimeout(() => {
  toast.warning('警告提示', { showProgress: true });
}, 500);

setTimeout(() => {
  toast.error('错误提示', { showProgress: true });
}, 1000);

setTimeout(() => {
  toast.info('信息提示', { showProgress: true });
}, 1500);

// 测试自定义
setTimeout(() => {
  toast.show({
    type: 'info',
    message: '🎉 自定义提示',
    icon: '🚀',
    iconSize: 32,
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    duration: 3000,
    showProgress: true
  });
}, 2000);
```

## ✨ 特色功能

1. ✅ **零依赖** - 纯原生JavaScript实现
2. ✅ **轻量级** - 核心代码不到10KB
3. ✅ **易使用** - 简洁的API设计
4. ✅ **高定制** - 丰富的配置选项
5. ✅ **动画流畅** - CSS3动画效果
6. ✅ **响应式** - 自适应各种屏幕
7. ✅ **多实例** - 支持同时显示多个提示框
8. ✅ **事件支持** - 完整的回调机制
9. ✅ **模块化** - CommonJS 模块系统
10. ✅ **自动加载样式** - 无需手动引入 CSS

## 💡 最佳实践

### 1. 统一管理
```javascript
// utils/notification.js
const Toast = require('./ui/toast');
const toast = new Toast();

module.exports = {
  success: (msg) => toast.success(msg, { showProgress: true }),
  error: (msg) => toast.error(msg, { duration: 4000 }),
  warning: (msg) => toast.warning(msg, { showProgress: true }),
  info: (msg) => toast.info(msg, { duration: 3000 })
};
```

### 2. 错误处理
```javascript
const Toast = require('./utils/ui/toast');
const toast = new Toast();

async function handleRequest() {
  try {
    const result = await apiCall();
    toast.success('操作成功');
    return result;
  } catch (error) {
    toast.error(`操作失败：${error.message}`);
    throw error;
  }
}
```

### 3. 加载状态
```javascript
const Toast = require('./utils/ui/toast');
const toast = new Toast();

async function loadData() {
  const loading = toast.info('加载中...', {
    duration: 0,
    showClose: false
  });
  
  try {
    const data = await fetchData();
    toast.close(loading);
    toast.success('加载成功', { showProgress: true });
    return data;
  } catch (error) {
    toast.close(loading);
    toast.error('加载失败');
    throw error;
  }
}
```

---

**开始使用吧！** 🚀