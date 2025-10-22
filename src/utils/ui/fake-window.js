/**
 * 伪窗口工具模块
 * 提供灵活的窗口显示和定位功能
 * 
 * @module fake-window
 * @description 轻量级窗口管理工具，支持居中和自定义位置两种显示模式
 * @example
 * const FakeWindow = require('./utils/ui/fake-window');
 * const myWindow = new FakeWindow(document.getElementById('my-window'), {
 *   mode: 'centered',
 *   modal: true
 * });
 * myWindow.show();
 */

// 内联样式内容 - 仅处理外层容器的基础定位
const CSS_CONTENT = `
/* 伪窗口外层容器 - 基础定位样式 */
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

/* 显示状态 */
.fake-window-wrapper.show {
  display: block;
}

/* 模态模式 - 阻止背景交互 */
.fake-window-wrapper.modal {
  pointer-events: auto;
}

/* 居中模式 */
.fake-window-wrapper.show.centered {
  display: flex !important;
  align-items: center;
  justify-content: center;
}

/* 自定义位置模式的内容容器 */
.fake-window-wrapper.positioned > * {
  position: fixed;
}
`;

// 自动注入样式表
(function injectStyles() {
  // 检查样式是否已经注入
  if (document.getElementById('fake-window-styles')) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'fake-window-styles';
  styleElement.textContent = CSS_CONTENT;
  document.head.appendChild(styleElement);
})();

// 全局 z-index 管理器
let globalMaxZIndex = 10000;

/**
 * 伪窗口类
 */
class FakeWindow {
  /**
   * 创建伪窗口实例
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} options - 配置选项
   * @param {string} [options.mode='centered'] - 显示模式：'centered' 或 'positioned'
   * @param {boolean} [options.modal=true] - 是否为模态窗口
   * @param {boolean} [options.backdropClose=true] - 点击背景/外部是否关闭
   * @param {boolean} [options.quadrantMode=false] - 是否启用象限模式（仅positioned模式）
   * @param {number} [options.primaryQuadrant=4] - 主象限 (1-4)
   * @param {number} [options.minMargin=10] - 最小边距
   * @param {number} [options.zIndex] - 自定义 z-index
   * @param {Function} [options.onShow] - 显示回调
   * @param {Function} [options.onHide] - 隐藏回调
   */
  constructor(element, options = {}) {
    if (!element) {
      throw new Error('FakeWindow: element is required');
    }

    this.element = element;
    this.config = {
      mode: 'centered',
      modal: true,
      backdropClose: true,
      quadrantMode: false,
      primaryQuadrant: 4,
      minMargin: 10,
      zIndex: null,
      onShow: null,
      onHide: null,
      ...options
    };

    this.eventHandlers = {};
    this.isVisible = false;

    // 添加基础类
    this.element.classList.add('fake-window-wrapper');
  }

  /**
   * 显示窗口（居中模式）
   * @returns {FakeWindow} 返回实例以支持链式调用
   */
  showCentered() {
    this.config.mode = 'centered';
    return this._show();
  }

  /**
   * 在指定位置显示窗口
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @param {Object} options - 可选的配置覆盖
   * @returns {FakeWindow} 返回实例以支持链式调用
   */
  showAt(x, y, options = {}) {
    this.config = { ...this.config, ...options, mode: 'positioned', x, y };
    return this._show();
  }

  /**
   * 显示窗口（通用方法）
   * @private
   */
  _show() {
    // 清理旧的事件处理器
    this._removeEventListeners();

    // 设置模式类
    if (this.config.mode === 'centered') {
      this.element.classList.add('centered');
      this.element.classList.remove('positioned');
    } else {
      this.element.classList.add('positioned');
      this.element.classList.remove('centered');
    }

    // 设置模态
    if (this.config.modal) {
      this.element.classList.add('modal');
    } else {
      this.element.classList.remove('modal');
    }

    // 设置 z-index
    if (this.config.zIndex) {
      this.element.style.zIndex = this.config.zIndex;
    } else {
      this.element.style.zIndex = ++globalMaxZIndex;
    }

    // 显示窗口
    this.element.classList.add('show');
    this.isVisible = true;

    // 处理定位模式
    if (this.config.mode === 'positioned') {
      const contentElement = this.element.firstElementChild;
      if (contentElement) {
        if (this.config.quadrantMode) {
          this._positionByQuadrant(contentElement, this.config.x, this.config.y);
        } else {
          contentElement.style.left = `${this.config.x}px`;
          contentElement.style.top = `${this.config.y}px`;
        }
      }
    }

    // 设置事件监听器
    if (this.config.backdropClose) {
      if (this.config.mode === 'centered') {
        this._setupBackdropClose();
      } else {
        this._setupOutsideClick();
      }
    }

    this._setupEscClose();

    // 执行显示回调
    if (this.config.onShow) {
      this.config.onShow(this.element);
    }

    return this;
  }

  /**
   * 隐藏窗口
   * @returns {FakeWindow} 返回实例以支持链式调用
   */
  hide() {
    this.element.classList.remove('show');
    this.isVisible = false;

    // 清理事件监听器
    this._removeEventListeners();

    // 执行隐藏回调
    if (this.config.onHide) {
      this.config.onHide(this.element);
    }

    return this;
  }

  /**
   * 切换显示/隐藏
   * @returns {FakeWindow}
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this._show();
    }
    return this;
  }

  /**
   * 将窗口置于最前
   * @returns {FakeWindow}
   */
  bringToFront() {
    this.element.style.zIndex = ++globalMaxZIndex;
    return this;
  }

  /**
   * 设置背景点击关闭（居中模式）
   * @private
   */
  _setupBackdropClose() {
    const handler = (e) => {
      if (e.target === this.element && this.isVisible) {
        this.hide();
      }
    };

    this.element.addEventListener('click', handler);
    this.eventHandlers.backdropClickHandler = handler;
  }

  /**
   * 设置点击外部关闭（自定义位置模式）
   * @private
   */
  _setupOutsideClick() {
    const handler = (e) => {
      const contentElement = this.element.firstElementChild;
      if (contentElement && !contentElement.contains(e.target) && this.isVisible) {
        this.hide();
      }
    };

    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handler);
      this.eventHandlers.outsideClickHandler = handler;
    }, 0);
  }

  /**
   * 设置 ESC 键关闭
   * @private
   */
  _setupEscClose() {
    const handler = (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    };

    document.addEventListener('keydown', handler);
    this.eventHandlers.escKeyHandler = handler;
  }

  /**
   * 移除事件监听器
   * @private
   */
  _removeEventListeners() {
    // 移除背景点击监听器
    if (this.eventHandlers.backdropClickHandler) {
      this.element.removeEventListener('click', this.eventHandlers.backdropClickHandler);
      delete this.eventHandlers.backdropClickHandler;
    }

    // 移除外部点击监听器
    if (this.eventHandlers.outsideClickHandler) {
      document.removeEventListener('click', this.eventHandlers.outsideClickHandler);
      delete this.eventHandlers.outsideClickHandler;
    }

    // 移除 ESC 键监听器
    if (this.eventHandlers.escKeyHandler) {
      document.removeEventListener('keydown', this.eventHandlers.escKeyHandler);
      delete this.eventHandlers.escKeyHandler;
    }
  }

  /**
   * 象限模式定位
   * @private
   */
  _positionByQuadrant(element, originX, originY) {
    element.style.left = `${originX}px`;
    element.style.top = `${originY}px`;
    
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const minMargin = this.config.minMargin;
      
      const hasRightSpace = (originX + rect.width + minMargin) <= viewportWidth;
      const hasLeftSpace = (originX - rect.width - minMargin) >= 0;
      const hasBottomSpace = (originY + rect.height + minMargin) <= viewportHeight;
      const hasTopSpace = (originY - rect.height - minMargin) >= 0;
      
      let finalX, finalY;
      
      switch (this.config.primaryQuadrant) {
        case 4: // 主象限：右下
          if (hasRightSpace && hasBottomSpace) {
            finalX = originX;
            finalY = originY;
          } else if (!hasRightSpace && hasBottomSpace) {
            finalX = originX - rect.width;
            finalY = originY;
          } else if (hasRightSpace && !hasBottomSpace) {
            finalX = originX;
            finalY = originY - rect.height;
          } else {
            finalX = originX - rect.width;
            finalY = originY - rect.height;
          }
          break;
          
        case 1: // 主象限：右上
          if (hasRightSpace && hasTopSpace) {
            finalX = originX;
            finalY = originY - rect.height;
          } else if (!hasRightSpace && hasTopSpace) {
            finalX = originX - rect.width;
            finalY = originY - rect.height;
          } else if (hasRightSpace && !hasTopSpace) {
            finalX = originX;
            finalY = originY;
          } else {
            finalX = originX - rect.width;
            finalY = originY;
          }
          break;
          
        case 2: // 主象限：左上
          if (hasLeftSpace && hasTopSpace) {
            finalX = originX - rect.width;
            finalY = originY - rect.height;
          } else if (hasLeftSpace && !hasTopSpace) {
            finalX = originX - rect.width;
            finalY = originY;
          } else if (!hasLeftSpace && hasTopSpace) {
            finalX = originX;
            finalY = originY - rect.height;
          } else {
            finalX = originX;
            finalY = originY;
          }
          break;
          
        case 3: // 主象限：左下
          if (hasLeftSpace && hasBottomSpace) {
            finalX = originX - rect.width;
            finalY = originY;
          } else if (!hasLeftSpace && hasBottomSpace) {
            finalX = originX;
            finalY = originY;
          } else if (hasLeftSpace && !hasBottomSpace) {
            finalX = originX - rect.width;
            finalY = originY - rect.height;
          } else {
            finalX = originX;
            finalY = originY - rect.height;
          }
          break;
      }
      
      element.style.left = `${finalX}px`;
      element.style.top = `${finalY}px`;
    });
  }
}

// 导出类
module.exports = FakeWindow;