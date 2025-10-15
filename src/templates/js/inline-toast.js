/**
 * 内联提示框组件
 * 功能完整的通用提示框系统
 */

class InlineToast {
  constructor() {
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
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        document.body.appendChild(this.container);
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
   */
  success(message, options = {}) {
    return this.show({ ...options, type: 'success', message });
  }

  /**
   * 快捷方法：警告提示
   */
  warning(message, options = {}) {
    return this.show({ ...options, type: 'warning', message });
  }

  /**
   * 快捷方法：错误提示
   */
  error(message, options = {}) {
    return this.show({ ...options, type: 'error', message });
  }

  /**
   * 快捷方法：信息提示
   */
  info(message, options = {}) {
    return this.show({ ...options, type: 'info', message });
  }
}

// 创建全局实例
window.toast = new InlineToast();