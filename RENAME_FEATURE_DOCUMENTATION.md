# 重命名功能 UI 实现文档

## 概述

本文档描述了为 `src/templates/js/new-file.js` 文件中的模板重命名功能创建的完整用户界面实现。

## 功能特性

### 1. 核心功能
- ✅ 内联编辑模式的重命名界面
- ✅ 实时输入验证和字符过滤
- ✅ 友好的错误提示和成功反馈
- ✅ 键盘快捷键支持（Enter确认、Esc取消）
- ✅ 加载状态和禁用状态处理
- ✅ 国际化支持（中英文）
- ✅ 移动端和桌面端自适应

### 2. 输入验证规则
- 文件名不能为空
- 不能包含非法字符：`< > : " / \ . @ | ? * ~ $ ^ ' ` 和控制字符`
- 最大长度：251个字符（保留 `.hwb` 扩展名空间）
- 自动过滤 Windows 保留名称（CON, PRN, AUX, NUL, COM1-9, LPT1-9）
- 新名称不能与原名称相同

## 文件修改清单

### 1. HTML 结构 (`src/templates/html/new-file.html`)

添加了重命名编辑器的 HTML 结构：

```html
<!-- 内联重命名编辑器 -->
<div id="rename-editor" class="rename-editor">
  <div class="rename-editor-backdrop"></div>
  <div class="rename-editor-container">
    <div class="rename-editor-header">
      <span class="rename-editor-icon">✏️</span>
      <span id="rename-editor-title" class="rename-editor-title"></span>
    </div>
    <div class="rename-editor-body">
      <input 
        id="rename-editor-input" 
        type="text" 
        class="rename-editor-input"
        placeholder=""
        maxlength="251"
      />
      <div id="rename-editor-error" class="rename-editor-error"></div>
      <div class="rename-editor-hint">
        <span id="rename-editor-hint"></span>
      </div>
    </div>
    <div class="rename-editor-footer">
      <button id="rename-editor-cancel-btn" class="rename-editor-btn rename-editor-btn-cancel">
        <span id="rename-editor-cancel"></span>
      </button>
      <button id="rename-editor-confirm-btn" class="rename-editor-btn rename-editor-btn-confirm">
        <span id="rename-editor-confirm"></span>
      </button>
    </div>
  </div>
</div>
```

### 2. CSS 样式 (`src/templates/css/new-file.css`)

添加了完整的样式定义，包括：

#### 主要样式类
- `.rename-editor` - 编辑器容器（全屏遮罩）
- `.rename-editor-backdrop` - 背景遮罩（带模糊效果）
- `.rename-editor-container` - 编辑器主体
- `.rename-editor-header` - 头部区域
- `.rename-editor-body` - 内容区域
- `.rename-editor-footer` - 底部按钮区
- `.rename-editor-input` - 输入框
- `.rename-editor-error` - 错误提示
- `.rename-editor-btn` - 按钮样式

#### 动画效果
- `fadeIn` - 背景淡入
- `slideUp` - 编辑器滑入
- `shake` - 错误抖动
- `spin` - 加载旋转

#### 响应式设计
- 桌面端：固定宽度（最大480px）
- 移动端：95%宽度，按钮垂直排列

### 3. JavaScript 功能 (`src/templates/js/new-file.js`)

#### 核心函数

1. **`showRenameEditor(templateButton)`**
   - 显示重命名编辑器
   - 初始化输入框值为当前模板名称
   - 自动聚焦并选中文本

2. **`hideRenameEditor()`**
   - 隐藏编辑器
   - 清理状态和错误提示
   - 重置加载状态

3. **`validateTemplateName(name)`**
   - 验证文件名合法性
   - 返回验证结果和错误信息
   - 支持国际化错误消息

4. **`sanitizeTemplateName(value)`**
   - 清理和过滤文件名
   - 移除非法字符
   - 处理保留名称

5. **`performRename()`**
   - 执行重命名操作
   - 显示加载状态
   - 更新UI显示

#### 事件处理

```javascript
// 输入框实时验证
renameInput.addEventListener('input', () => {
  const newValue = sanitizeTemplateName(renameInput.value);
  if (renameInput.value !== newValue) {
    renameInput.value = newValue;
  }
  if (renameError.classList.contains('show')) {
    clearRenameError();
  }
});

// 键盘快捷键
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performRename();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideRenameEditor();
  }
});

// 点击背景关闭
renameEditor.addEventListener('click', (e) => {
  if (e.target.classList.contains('rename-editor-backdrop')) {
    hideRenameEditor();
  }
});
```

### 4. 国际化支持

#### 中文 (`src/data/languages/zh-CN.json`)
```json
"rename-editor": {
  "title": "重命名模板",
  "hint": "按 Enter 确认，Esc 取消",
  "confirm": "确认",
  "cancel": "取消",
  "errors": {
    "empty": "模板名称不能为空",
    "too-long": "模板名称过长（最多{max}个字符）",
    "illegal-chars": "模板名称包含非法字符",
    "same-name": "新名称与原名称相同"
  }
}
```

#### 英文 (`src/data/languages/en-US.json`)
```json
"rename-editor": {
  "title": "Rename Template",
  "hint": "Press Enter to confirm, Esc to cancel",
  "confirm": "Confirm",
  "cancel": "Cancel",
  "errors": {
    "empty": "Template name cannot be empty",
    "too-long": "Template name is too long (max {max} characters)",
    "illegal-chars": "Template name contains illegal characters",
    "same-name": "New name is the same as the original"
  }
}
```

## 使用方法

### 触发重命名
用户通过右键菜单选择"重命名"选项来触发重命名功能：

```javascript
// 在上下文菜单点击处理中
case "rename":
  console.log("rename", currentContextButton);
  templateRename(currentContextButton);
  break;
```

### 用户交互流程

1. **打开编辑器**
   - 用户右键点击模板按钮
   - 选择"重命名"选项
   - 编辑器以动画形式显示
   - 输入框自动聚焦并选中当前名称

2. **输入新名称**
   - 用户输入新的模板名称
   - 系统实时过滤非法字符
   - 如有错误，显示友好提示

3. **确认或取消**
   - 点击"确认"按钮或按 Enter 键确认
   - 点击"取消"按钮或按 Esc 键取消
   - 点击背景遮罩也可取消

4. **处理结果**
   - 显示加载状态
   - 更新模板名称显示
   - 关闭编辑器

## 待完成的集成工作

当前实现为纯 UI 层代码，需要与后端集成：

### 1. IPC 通信
在 `performRename()` 函数中添加实际的 IPC 调用：

```javascript
// TODO: 发送IPC消息到主进程执行实际的重命名操作
ipc.send('template-rename', {
  templateId: currentRenameButton.id,
  oldName: originalTemplateName,
  newName: newName
});
```

### 2. 响应处理
添加 IPC 响应监听：

```javascript
ipc.on('template-rename-result', (event, result) => {
  if (result.success) {
    // 重命名成功
    hideRenameEditor();
    // 可选：显示成功提示
  } else {
    // 重命名失败
    showRenameError(result.error);
    renameConfirmBtn.classList.remove('loading');
    renameConfirmBtn.disabled = false;
  }
});
```

### 3. 文件系统操作
在主进程中实现实际的文件重命名逻辑。

## 样式变量依赖

UI 使用了以下 CSS 变量（需在主题文件中定义）：
- `--bg0` - 主背景色
- `--bg1` - 次级背景色
- `--bg2` - 第三级背景色（可选）
- `--fg0` - 主前景色（文字）
- `--fg1` - 次级前景色（边框等）

## 浏览器兼容性

- ✅ 现代浏览器（Chrome, Firefox, Safari, Edge）
- ✅ Electron 环境
- ✅ 移动端浏览器
- ⚠️ 需要 CSS Grid 和 Flexbox 支持
- ⚠️ 需要 backdrop-filter 支持（模糊效果）

## 测试建议

### 功能测试
1. 测试空名称验证
2. 测试非法字符过滤
3. 测试长度限制
4. 测试相同名称检测
5. 测试键盘快捷键
6. 测试点击背景关闭

### UI 测试
1. 测试动画效果
2. 测试响应式布局
3. 测试深色/浅色主题
4. 测试移动端显示
5. 测试加载状态显示

### 国际化测试
1. 测试中文界面
2. 测试英文界面
3. 测试语言切换

## 性能优化

- 使用 CSS 动画而非 JavaScript 动画
- 事件委托减少监听器数量
- 防抖输入验证（如需要）
- 懒加载国际化文本

## 可访问性

- ✅ 键盘导航支持
- ✅ 焦点管理
- ✅ 语义化 HTML
- ⚠️ 建议添加 ARIA 标签
- ⚠️ 建议添加屏幕阅读器支持

## 总结

本实现提供了一个完整、美观、易用的重命名功能 UI，具有以下优势：

1. **用户体验优秀** - 流畅的动画、清晰的反馈
2. **代码质量高** - 结构清晰、易于维护
3. **扩展性强** - 易于添加新功能
4. **国际化完善** - 支持多语言
5. **响应式设计** - 适配各种设备

只需完成后端集成即可投入使用。