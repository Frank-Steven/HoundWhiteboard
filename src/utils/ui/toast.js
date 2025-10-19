/**
 * 内联提示框组件 - 模块化版本
 * 功能完整的通用提示框系统
 *
 * @module toast
 * @description 零依赖、轻量级的提示框组件，支持多种自定义选项和动画效果
 * @example
 * const Toast = require('./utils/ui/toast');
 * const toast = new Toast();
 * toast.success('操作成功！');
 *
 * // 或者指定父容器
 * const customToast = new Toast(document.getElementById('my-container'));
 */

// 内联样式内容
const CSS_CONTENT = `
/* 提示框容器 */
#toast-container {
  position: fixed;
  display: block;
  width: 100%;
  height: 100%;
  top: 0;
  z-index: 9999;
  pointer-events: none;
}

/* 提示框基础样式 */
.inline-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin: 8px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  line-height: 1.5;
  max-width: 400px;
  min-width: 200px;
  pointer-events: auto;
  position: absolute;
  overflow: hidden;
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.toast-icon svg {
  width: 100%;
  height: 100%;
}

.toast-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.toast-message {
  flex: 1;
  word-wrap: break-word;
  user-select: text;
}

.toast-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.toast-close:hover {
  opacity: 1;
}

.toast-close svg {
  width: 16px;
  height: 16px;
}

.toast-success {
  background-color: rgba(76, 175, 80, 0.95);
  color: white;
}

.toast-warning {
  background-color: rgba(255, 152, 0, 0.95);
  color: white;
}

.toast-error {
  background-color: rgba(244, 67, 54, 0.95);
  color: white;
}

.toast-info {
  background-color: rgba(33, 150, 243, 0.95);
  color: white;
}

.toast-position-top-center {
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.toast-position-top-right {
  top: 20px;
  right: 20px;
}

.toast-position-top-left {
  top: 20px;
  left: 20px;
}

.toast-position-bottom-center {
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.toast-position-bottom-right {
  bottom: 20px;
  right: 20px;
}

.toast-position-bottom-left {
  bottom: 20px;
  left: 20px;
}

@keyframes slideInTop {
  from {
    opacity: 0;
    transform: translateY(-100%) translateX(-50%);
  }
  to {
    opacity: 1;
    transform: translateY(0) translateX(-50%);
  }
}

@keyframes slideInTopNoCenter {
  from {
    opacity: 0;
    transform: translateY(-100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInBottom {
  from {
    opacity: 0;
    transform: translateY(100%) translateX(-50%);
  }
  to {
    opacity: 1;
    transform: translateY(0) translateX(-50%);
  }
}

@keyframes slideInBottomNoCenter {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
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

@keyframes fadeInCenter {
  from {
    opacity: 0;
    transform: scale(0.9) translateX(-50%);
  }
  to {
    opacity: 1;
    transform: scale(1) translateX(-50%);
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}

@keyframes fadeOutCenter {
  from {
    opacity: 1;
    transform: scale(1) translateX(-50%);
  }
  to {
    opacity: 0;
    transform: scale(0.9) translateX(-50%);
  }
}

.toast-animation-slideInTop {
  animation: slideInTop 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-slideInTopNoCenter {
  animation: slideInTopNoCenter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-slideInBottom {
  animation: slideInBottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-slideInBottomNoCenter {
  animation: slideInBottomNoCenter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-slideInLeft {
  animation: slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-slideInRight {
  animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-fadeIn {
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-fadeInCenter {
  animation: fadeInCenter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-fadeOut {
  animation: fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-animation-fadeOutCenter {
  animation: fadeOutCenter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background-color: rgba(255, 255, 255, 0.5);
  transition: width linear;
}

@media (max-width: 768px) {
  .inline-toast {
    max-width: calc(100vw - 40px);
    margin: 8px 20px;
  }
}
`;

// 自动注入样式表
(function injectStyles() {
  // 检查样式是否已经注入
  if (document.getElementById('inline-toast-styles')) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'inline-toast-styles';
  styleElement.textContent = CSS_CONTENT;
  document.head.appendChild(styleElement);
})();

/**
 * 零依赖、轻量级的提示框组件，支持多种自定义选项和动画效果
 * @example
 * const Toast = require('./utils/ui/toast');
 * const toast = new Toast();
 * toast.success('操作成功！');
 *
 * // 或者指定父容器
 * const customToast = new Toast(document.getElementById('my-container'));
 */
class InlineToast {
  /**
   * 创建 Toast 实例
   * @param {HTMLElement} [parentElement=null] - 可选的父容器元素。如果不提供，将创建全屏容器
   */
  constructor(parentElement = null) {
    this.parentElement = parentElement;
    this.container = null;
    this.toasts = [];
    this.defaultOptions = {
      type: 'info', // success, warning, error, info
      message: '',
      icon: null, // 自定义图标：SVG字符串、图片URL或null
      iconSize: 24, // 图标大小
      iconPosition: 'left', // left, right
      duration: 3000, // 自动关闭时间（毫秒），0表示不自动关闭
      position: 'top-right', // top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
      backgroundColor: null, // 自定义背景色
      textColor: null, // 自定义文字颜色
      showClose: true, // 是否显示关闭按钮
      showProgress: false, // 是否显示进度条
      animation: 'slideIn', // slideIn, fadeIn
      onClose: null, // 关闭回调
      onClick: null, // 点击回调
      customClass: '', // 自定义CSS类
    };
    this.init();
  }

  /**
   * 初始化容器
   */
  init() {
    if (!this.container) {
      // 如果指定了父元素，在父元素中查找或创建容器
      if (this.parentElement) {
        this.container = this.parentElement.querySelector('.toast-container');
        if (!this.container) {
          this.container = document.createElement('div');
          this.container.className = 'toast-container';
          // 为自定义父容器设置相对定位样式
          this.container.style.position = 'relative';
          this.container.style.width = '100%';
          this.container.style.height = '100%';
          this.container.style.pointerEvents = 'none';
          this.parentElement.appendChild(this.container);
        }
      } else {
        // 默认行为：创建全屏容器
        this.container = document.getElementById('toast-container');
        if (!this.container) {
          this.container = document.createElement('div');
          this.container.id = 'toast-container';
          document.body.appendChild(this.container);
        }
      }
    }
  }

  /**
   * 显示提示框
   * @param {Object} options - 配置选项
   * @returns {Object} 提示框实例
   */
  show(options) {
    const config = { ...this.defaultOptions, ...options };
    const toast = this.createToast(config);
    
    this.toasts.push(toast);
    this.container.appendChild(toast.element);

    // 应用动画和位置
    this.applyAnimation(toast.element, config);
    
    // 计算并应用堆叠偏移
    this.applyStackOffset(toast);

    // 自动关闭
    if (config.duration > 0) {
      this.autoClose(toast, config.duration);
    }

    // 进度条
    if (config.showProgress && config.duration > 0) {
      this.showProgress(toast.element, config.duration);
    }

    return toast;
  }

  /**
   * 应用堆叠偏移
   * @param {Object} toast - 提示框对象
   */
  applyStackOffset(toast) {
    const position = toast.config.position;
    const samePositionToasts = this.toasts.filter(t =>
      t.config.position === position && t !== toast
    );

    if (samePositionToasts.length > 0) {
      let offset = 0;
      samePositionToasts.forEach(t => {
        offset += t.element.offsetHeight + 8; // 8px 是间距
      });

      // 根据位置应用偏移
      if (position.includes('top')) {
        const currentTop = parseInt(toast.element.style.top || 20);
        toast.element.style.top = `${currentTop + offset}px`;
      } else if (position.includes('bottom')) {
        const currentBottom = parseInt(toast.element.style.bottom || 20);
        toast.element.style.bottom = `${currentBottom + offset}px`;
      }

      // 保持居中位置的 transform
      if (position.includes('center')) {
        toast.element.style.transform = 'translateX(-50%)';
      }
    }
  }

  /**
   * 创建提示框元素
   * @param {Object} config - 配置
   * @returns {Object} 提示框对象
   */
  createToast(config) {
    const element = document.createElement('div');
    element.className = `inline-toast toast-${config.type}`;
    
    // 添加自定义类
    if (config.customClass) {
      element.className += ` ${config.customClass}`;
    }

    // 自定义样式
    if (config.backgroundColor) {
      element.style.backgroundColor = config.backgroundColor;
    }
    if (config.textColor) {
      element.style.color = config.textColor;
    }

    // 图标
    if (config.icon !== null || this.hasDefaultIcon(config.type)) {
      const iconElement = this.createIcon(config);
      if (config.iconPosition === 'left') {
        element.appendChild(iconElement);
      }
    }

    // 消息文本
    const messageElement = document.createElement('div');
    messageElement.className = 'toast-message';
    messageElement.textContent = config.message;
    element.appendChild(messageElement);

    // 图标在右侧
    if (config.icon !== null && config.iconPosition === 'right') {
      const iconElement = this.createIcon(config);
      element.appendChild(iconElement);
    }

    // 关闭按钮
    if (config.showClose) {
      const closeButton = this.createCloseButton();
      element.appendChild(closeButton);
    }

    // 点击事件
    if (config.onClick) {
      element.style.cursor = 'pointer';
      element.addEventListener('click', (e) => {
        if (!e.target.closest('.toast-close')) {
          config.onClick(element);
        }
      });
    }

    const toast = {
      element,
      config,
      timer: null,
    };

    // 关闭按钮事件
    const closeBtn = element.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close(toast));
    }

    return toast;
  }

  /**
   * 创建图标元素
   * @param {Object} config - 配置
   * @returns {HTMLElement} 图标元素
   */
  createIcon(config) {
    const iconContainer = document.createElement('div');
    iconContainer.className = 'toast-icon';
    iconContainer.style.width = `${config.iconSize}px`;
    iconContainer.style.height = `${config.iconSize}px`;

    if (config.icon) {
      // 自定义图标
      if (config.icon.startsWith('<svg')) {
        // SVG字符串
        iconContainer.innerHTML = config.icon;
      } else if (config.icon.startsWith('http') || config.icon.startsWith('data:') || config.icon.startsWith('./') || config.icon.startsWith('../')) {
        // 图片URL
        const img = document.createElement('img');
        img.src = config.icon;
        img.alt = 'icon';
        iconContainer.appendChild(img);
      } else {
        // 文本（如emoji）
        iconContainer.textContent = config.icon;
        iconContainer.style.fontSize = `${config.iconSize}px`;
      }
    } else {
      // 默认图标
      iconContainer.innerHTML = this.getDefaultIcon(config.type);
    }

    return iconContainer;
  }

  /**
   * 创建关闭按钮
   * @returns {HTMLElement} 关闭按钮
   */
  createCloseButton() {
    const button = document.createElement('button');
    button.className = 'toast-close';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;
    return button;
  }

  /**
   * 获取默认图标
   * @param {string} type - 类型
   * @returns {string} SVG图标
   */
  getDefaultIcon(type) {
    const icons = {
      success: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>`,
      warning: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>`,
      error: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>`,
      info: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>`,
    };
    return icons[type] || icons.info;
  }

  /**
   * 检查是否有默认图标
   * @param {string} type - 类型
   * @returns {boolean}
   */
  hasDefaultIcon(type) {
    return ['success', 'warning', 'error', 'info'].includes(type);
  }

  /**
   * 应用动画
   * @param {HTMLElement} element - 元素
   * @param {Object} config - 配置
   */
  applyAnimation(element, config) {
    const position = config.position;
    const isCenter = position.includes('center');
    let animationClass = isCenter ? 'toast-animation-fadeInCenter' : 'toast-animation-fadeIn';

    if (config.animation === 'slideIn') {
      if (position.includes('top')) {
        animationClass = isCenter ? 'toast-animation-slideInTop' : 'toast-animation-slideInTopNoCenter';
      } else if (position.includes('bottom')) {
        animationClass = isCenter ? 'toast-animation-slideInBottom' : 'toast-animation-slideInBottomNoCenter';
      } else if (position.includes('left')) {
        animationClass = 'toast-animation-slideInLeft';
      } else if (position.includes('right')) {
        animationClass = 'toast-animation-slideInRight';
      }
    }

    element.classList.add(animationClass);
    element.classList.add(`toast-position-${position}`);
  }

  /**
   * 显示进度条
   * @param {HTMLElement} element - 元素
   * @param {number} duration - 持续时间
   */
  showProgress(element, duration) {
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    progress.style.width = '100%';
    element.appendChild(progress);

    setTimeout(() => {
      progress.style.width = '0%';
      progress.style.transition = `width ${duration}ms linear`;
    }, 10);
  }

  /**
   * 自动关闭
   * @param {Object} toast - 提示框对象
   * @param {number} duration - 持续时间
   */
  autoClose(toast, duration) {
    toast.timer = setTimeout(() => {
      this.close(toast);
    }, duration);
  }

  /**
   * 关闭提示框
   * @param {Object} toast - 提示框对象
   */
  close(toast) {
    if (toast.timer) {
      clearTimeout(toast.timer);
    }

    const isCenter = toast.config.position.includes('center');
    toast.element.classList.add(isCenter ? 'toast-animation-fadeOutCenter' : 'toast-animation-fadeOut');

    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      
      const index = this.toasts.indexOf(toast);
      if (index > -1) {
        this.toasts.splice(index, 1);
      }

      // 重新调整同位置的其他提示框
      this.repositionToasts(toast.config.position);

      if (toast.config.onClose) {
        toast.config.onClose();
      }
    }, 300);
  }

  /**
   * 重新定位指定位置的所有提示框
   * @param {string} position - 位置
   */
  repositionToasts(position) {
    const samePositionToasts = this.toasts.filter(t => t.config.position === position);
    
    samePositionToasts.forEach((toast, index) => {
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += samePositionToasts[i].element.offsetHeight + 8;
      }

      if (position.includes('top')) {
        toast.element.style.top = `${20 + offset}px`;
      } else if (position.includes('bottom')) {
        toast.element.style.bottom = `${20 + offset}px`;
      }

      // 保持居中位置的 transform
      if (position.includes('center')) {
        toast.element.style.transform = 'translateX(-50%)';
      }
    });
  }

  /**
   * 关闭所有提示框
   */
  closeAll() {
    this.toasts.forEach(toast => this.close(toast));
  }

  /**
   * 快捷方法：成功提示
   * @param {string} message - 提示消息
   * @param {Object} options - 配置选项
   * @returns {Object} 提示框实例
   */
  success(message, options = {}) {
    return this.show({ ...options, type: 'success', message });
  }

  /**
   * 快捷方法：警告提示
   * @param {string} message - 提示消息
   * @param {Object} options - 配置选项
   * @returns {Object} 提示框实例
   */
  warning(message, options = {}) {
    return this.show({ ...options, type: 'warning', message });
  }

  /**
   * 快捷方法：错误提示
   * @param {string} message - 提示消息
   * @param {Object} options - 配置选项
   * @returns {Object} 提示框实例
   */
  error(message, options = {}) {
    return this.show({ ...options, type: 'error', message });
  }

  /**
   * 快捷方法：信息提示
   * @param {string} message - 提示消息
   * @param {Object} options - 配置选项
   * @returns {Object} 提示框实例
   */
  info(message, options = {}) {
    return this.show({ ...options, type: 'info', message });
  }
}

// 导出类
module.exports = InlineToast;