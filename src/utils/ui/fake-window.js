/**
 * 伪窗口工具模块
 * 提供灵活的窗口显示和定位功能
 * 
 * @module fake-window
 * @description 轻量级窗口管理工具，支持居中和自定义位置两种显示模式
 * @example
 * const FakeWindow = require('./utils/ui/fake-window');
 * 
 * // 居中显示
 * FakeWindow.showCentered('my-window', { modal: true });
 * 
 * // 自定义位置显示
 * FakeWindow.showAt('my-window', 100, 200);
 * 
 * // 隐藏窗口
 * FakeWindow.hide('my-window');
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

/**
 * 伪窗口管理对象
 */
const FakeWindow = {
  /**
   * 活动窗口列表
   * @private
   */
  _activeWindows: new Set(),

  /**
   * 窗口配置缓存
   * @private
   */
  _windowConfigs: new Map(),

  /**
   * 事件处理器缓存
   * @private
   */
  _eventHandlers: new Map(),

  /**
   * 当前最大 z-index
   * @private
   */
  _maxZIndex: 10000,

  /**
   * 居中显示窗口
   * @param {string} elementId - 窗口元素的 ID
   * @param {Object} options - 配置选项
   * @param {boolean} [options.modal=true] - 是否为模态窗口（阻止背景交互）
   * @param {boolean} [options.backdropClose=true] - 点击背景是否关闭窗口
   * @param {number} [options.zIndex] - 自定义 z-index
   * @param {Function} [options.onShow] - 显示时的回调函数
   * @param {Function} [options.onHide] - 隐藏时的回调函数
   * @returns {boolean} 是否成功显示
   */
  showCentered(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`FakeWindow: Element with id "${elementId}" not found`);
      return false;
    }

    // 合并默认配置
    const config = {
      modal: true,
      backdropClose: true,
      zIndex: null,
      onShow: null,
      onHide: null,
      ...options,
      mode: 'centered'
    };

    // 保存配置
    this._windowConfigs.set(elementId, config);

    // 添加基础类
    element.classList.add('fake-window-wrapper');
    element.classList.add('centered');
    
    // 设置模态
    if (config.modal) {
      element.classList.add('modal');
    } else {
      element.classList.remove('modal');
    }

    // 设置 z-index
    if (config.zIndex) {
      element.style.zIndex = config.zIndex;
    } else {
      element.style.zIndex = ++this._maxZIndex;
    }

    // 显示窗口
    element.classList.add('show');

    // 添加到活动窗口列表
    this._activeWindows.add(elementId);

    // 清理旧的事件处理器
    this._removeEventListeners(elementId);

    // 设置背景点击关闭
    if (config.modal && config.backdropClose) {
      this._setupBackdropClose(element, elementId);
    }

    // 设置 ESC 键关闭
    this._setupEscClose(elementId);

    // 执行显示回调
    if (config.onShow) {
      config.onShow(element);
    }

    return true;
  },

  /**
   * 在指定位置显示窗口
   * @param {string} elementId - 窗口元素的 ID
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @param {Object} options - 配置选项
   * @param {boolean} [options.modal=false] - 是否为模态窗口
   * @param {boolean} [options.backdropClose=false] - 点击外部是否关闭窗口
   * @param {boolean} [options.adjustPosition=true] - 是否自动调整位置以适应视口
   * @param {boolean} [options.quadrantMode=false] - 是否启用象限模式
   * @param {number} [options.primaryQuadrant=4] - 主象限 (1=右上, 2=左上, 3=左下, 4=右下)
   * @param {number} [options.minMargin=10] - 最小边距（像素）
   * @param {number} [options.zIndex] - 自定义 z-index
   * @param {Function} [options.onShow] - 显示时的回调函数
   * @param {Function} [options.onHide] - 隐藏时的回调函数
   * @returns {boolean} 是否成功显示
   */
  showAt(elementId, x, y, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`FakeWindow: Element with id "${elementId}" not found`);
      return false;
    }

    // 合并默认配置
    const config = {
      modal: false,
      backdropClose: false,
      adjustPosition: true,
      quadrantMode: false,
      primaryQuadrant: 4,
      minMargin: 10,
      zIndex: null,
      onShow: null,
      onHide: null,
      ...options,
      mode: 'positioned',
      x,
      y
    };

    // 保存配置
    this._windowConfigs.set(elementId, config);

    // 添加基础类
    element.classList.add('fake-window-wrapper');
    element.classList.add('positioned');
    element.classList.remove('centered');

    // 设置模态
    if (config.modal) {
      element.classList.add('modal');
    } else {
      element.classList.remove('modal');
    }

    // 设置 z-index
    if (config.zIndex) {
      element.style.zIndex = config.zIndex;
    } else {
      element.style.zIndex = ++this._maxZIndex;
    }

    // 显示窗口（先显示以获取尺寸）
    element.classList.add('show');

    // 设置位置
    const contentElement = element.firstElementChild;
    if (contentElement) {
      if (config.quadrantMode) {
        // 象限模式定位
        this._positionByQuadrant(contentElement, x, y, config);
      } else {
        // 普通模式定位
        contentElement.style.left = `${x}px`;
        contentElement.style.top = `${y}px`;

        // 调整位置以适应视口
        if (config.adjustPosition) {
          this._adjustPositionToViewport(contentElement);
        }
      }
    }

    // 添加到活动窗口列表
    this._activeWindows.add(elementId);

    // 清理旧的事件处理器
    this._removeEventListeners(elementId);

    // 设置点击外部关闭
    if (config.backdropClose) {
      this._setupOutsideClick(element, elementId);
    }

    // 设置 ESC 键关闭
    this._setupEscClose(elementId);

    // 执行显示回调
    if (config.onShow) {
      config.onShow(element);
    }

    return true;
  },

  /**
   * 隐藏窗口
   * @param {string} elementId - 窗口元素的 ID
   * @returns {boolean} 是否成功隐藏
   */
  hide(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`FakeWindow: Element with id "${elementId}" not found`);
      return false;
    }

    // 移除显示类
    element.classList.remove('show');

    // 从活动窗口列表移除
    this._activeWindows.delete(elementId);

    // 获取配置并执行隐藏回调
    const config = this._windowConfigs.get(elementId);
    if (config && config.onHide) {
      config.onHide(element);
    }

    // 移除事件监听器
    this._removeEventListeners(elementId);

    return true;
  },

  /**
   * 检查窗口是否可见
   * @param {string} elementId - 窗口元素的 ID
   * @returns {boolean} 是否可见
   */
  isVisible(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      return false;
    }
    return element.classList.contains('show');
  },

  /**
   * 将窗口置于最前
   * @param {string} elementId - 窗口元素的 ID
   * @returns {boolean} 是否成功
   */
  bringToFront(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`FakeWindow: Element with id "${elementId}" not found`);
      return false;
    }

    element.style.zIndex = ++this._maxZIndex;
    return true;
  },

  /**
   * 隐藏所有窗口
   */
  hideAll() {
    this._activeWindows.forEach(elementId => {
      this.hide(elementId);
    });
  },

  /**
   * 设置背景点击关闭（居中模式）
   * @private
   */
  _setupBackdropClose(element, elementId) {
    const handler = (e) => {
      // 只有点击背景容器本身时才关闭
      if (e.target === element && this.isVisible(elementId)) {
        this.hide(elementId);
      }
    };

    element.addEventListener('click', handler);
    
    if (!this._eventHandlers.has(elementId)) {
      this._eventHandlers.set(elementId, {});
    }
    this._eventHandlers.get(elementId).backdropClickHandler = handler;
  },

  /**
   * 设置点击外部关闭（自定义位置模式）
   * @private
   */
  _setupOutsideClick(element, elementId) {
    const handler = (e) => {
      const contentElement = element.firstElementChild;
      if (contentElement && !contentElement.contains(e.target) && this.isVisible(elementId)) {
        this.hide(elementId);
      }
    };

    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handler);
      
      if (!this._eventHandlers.has(elementId)) {
        this._eventHandlers.set(elementId, {});
      }
      this._eventHandlers.get(elementId).outsideClickHandler = handler;
    }, 0);
  },

  /**
   * 设置 ESC 键关闭
   * @private
   */
  _setupEscClose(elementId) {
    const handler = (e) => {
      if (e.key === 'Escape' && this.isVisible(elementId)) {
        this.hide(elementId);
      }
    };

    document.addEventListener('keydown', handler);
    
    if (!this._eventHandlers.has(elementId)) {
      this._eventHandlers.set(elementId, {});
    }
    this._eventHandlers.get(elementId).escKeyHandler = handler;
  },

  /**
   * 移除事件监听器
   * @private
   */
  _removeEventListeners(elementId) {
    const element = document.getElementById(elementId);
    const handlers = this._eventHandlers.get(elementId);
    
    if (handlers) {
      // 移除背景点击监听器
      if (handlers.backdropClickHandler && element) {
        element.removeEventListener('click', handlers.backdropClickHandler);
      }

      // 移除外部点击监听器
      if (handlers.outsideClickHandler) {
        document.removeEventListener('click', handlers.outsideClickHandler);
      }

      // 移除 ESC 键监听器
      if (handlers.escKeyHandler) {
        document.removeEventListener('keydown', handlers.escKeyHandler);
      }

      this._eventHandlers.delete(elementId);
    }
  },

  /**
   * 象限模式定位
   * @private
   * @param {HTMLElement} element - 内容元素
   * @param {number} originX - 原点X坐标
   * @param {number} originY - 原点Y坐标
   * @param {Object} config - 配置选项
   */
  _positionByQuadrant(element, originX, originY, config) {
    // 先设置初始位置以获取元素尺寸
    element.style.left = `${originX}px`;
    element.style.top = `${originY}px`;
    
    // 等待下一帧以确保元素已渲染
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const minMargin = config.minMargin;
      
      // 检测各个方向是否有足够空间
      const hasRightSpace = (originX + rect.width + minMargin) <= viewportWidth;
      const hasLeftSpace = (originX - rect.width - minMargin) >= 0;
      const hasBottomSpace = (originY + rect.height + minMargin) <= viewportHeight;
      const hasTopSpace = (originY - rect.height - minMargin) >= 0;
      
      let finalX, finalY;
      
      // 根据主象限和空间情况决定最终象限
      switch (config.primaryQuadrant) {
        case 4: // 主象限：右下（第四象限）
          if (hasRightSpace && hasBottomSpace) {
            // 第四象限：右下
            finalX = originX;
            finalY = originY;
          } else if (!hasRightSpace && hasBottomSpace) {
            // 第三象限：左下
            finalX = originX - rect.width;
            finalY = originY;
          } else if (hasRightSpace && !hasBottomSpace) {
            // 第一象限：右上
            finalX = originX;
            finalY = originY - rect.height;
          } else {
            // 第二象限：左上
            finalX = originX - rect.width;
            finalY = originY - rect.height;
          }
          break;
          
        case 1: // 主象限：右上（第一象限）
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
          
        case 2: // 主象限：左上（第二象限）
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
          
        case 3: // 主象限：左下（第三象限）
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
      
      // 应用最终位置
      element.style.left = `${finalX}px`;
      element.style.top = `${finalY}px`;
      
      // 存储象限信息（可用于调试或其他用途）
      element.dataset.quadrant = config.primaryQuadrant;
    });
  },

  /**
   * 调整位置以适应视口
   * @private
   */
  _adjustPositionToViewport(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = parseInt(element.style.left) || 0;
    let top = parseInt(element.style.top) || 0;

    // 右边界检测
    if (rect.right > viewportWidth) {
      left = viewportWidth - rect.width - 10;
    }

    // 左边界检测
    if (left < 10) {
      left = 10;
    }

    // 下边界检测
    if (rect.bottom > viewportHeight) {
      top = viewportHeight - rect.height - 10;
    }

    // 上边界检测
    if (top < 10) {
      top = 10;
    }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }
};

// 导出模块
module.exports = FakeWindow;