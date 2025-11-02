/**
 * 伪窗口工具模块 - 面向对象重构版
 * 
 * @file 基于严格面向对象设计的轻量级窗口管理系统
 * @module fake-window
 * @version 2.0.0
 * 
 * @description
 * 采用完整的面向对象架构，遵循 SOLID 原则：
 * - 单一职责原则：每个类专注于特定功能
 * - 开闭原则：通过继承和组合扩展功能
 * - 里氏替换原则：子类可以替换父类
 * - 接口隔离原则：精简的接口设计
 * - 依赖倒置原则：依赖抽象而非具体实现
 * 
 * @example
 * // 基础用法
 * const window = new FakeWindow(element, { mode: 'centered' });
 * window.show();
 * 
 * @example
 * // 使用工厂模式
 * const dialog = WindowFactory.createDialog(element);
 * dialog.show();
 * 
 * @example
 * // 事件监听
 * window.on('show', () => console.log('窗口已显示'));
 * window.on('hide', () => console.log('窗口已隐藏'));
 */

// ============================================================================
// 样式注入 - 单例模式
// ============================================================================

/**
 * 样式内容 - 仅处理外层容器的基础定位
 * @private
 * @constant {string}
 */
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

/**
 * 样式注入器 - 单例模式
 * 确保样式只被注入一次
 * 
 * @class StyleInjector
 * @private
 */
class StyleInjector {
  /** @type {StyleInjector|null} 单例实例 */
  static #instance = null;
  
  /** @type {boolean} 是否已注入 */
  #injected = false;

  /**
   * 私有构造函数
   * @private
   */
  constructor() {
    if (StyleInjector.#instance) {
      return StyleInjector.#instance;
    }
    StyleInjector.#instance = this;
  }

  /**
   * 获取单例实例
   * @returns {StyleInjector}
   */
  static getInstance() {
    if (!StyleInjector.#instance) {
      StyleInjector.#instance = new StyleInjector();
    }
    return StyleInjector.#instance;
  }

  /**
   * 注入样式到文档
   * @returns {void}
   */
  inject() {
    if (this.#injected || typeof document === 'undefined') {
      return;
    }

    // 检查样式是否已经存在
    if (document.getElementById('fake-window-styles')) {
      this.#injected = true;
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = 'fake-window-styles';
    styleElement.textContent = CSS_CONTENT;
    document.head.appendChild(styleElement);
    this.#injected = true;
  }

  /**
   * 检查是否已注入
   * @returns {boolean}
   */
  isInjected() {
    return this.#injected;
  }
}

// 自动注入样式
if (typeof document !== 'undefined') {
  StyleInjector.getInstance().inject();
}

// ============================================================================
// 事件发射器基类 - 观察者模式
// ============================================================================

/**
 * 事件发射器基类
 * 实现观察者模式，提供完整的事件发布订阅机制
 * 
 * @class EventEmitter
 * @abstract
 */
class EventEmitter {
  /** @type {Map<string, Set<Function>>} 事件监听器映射 */
  #listeners = new Map();

  /**
   * 注册事件监听器
   * 
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @returns {this} 返回实例以支持链式调用
   * @throws {TypeError} 如果 handler 不是函数
   * 
   * @example
   * window.on('show', () => console.log('显示'));
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function');
    }

    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(handler);
    return this;
  }

  /**
   * 移除事件监听器
   * 
   * @param {string} event - 事件名称
   * @param {Function} [handler] - 事件处理函数，不传则移除该事件的所有监听器
   * @returns {this} 返回实例以支持链式调用
   * 
   * @example
   * window.off('show', handler);
   * window.off('show'); // 移除所有 show 事件监听器
   */
  off(event, handler) {
    if (!this.#listeners.has(event)) {
      return this;
    }

    if (handler) {
      this.#listeners.get(event).delete(handler);
    } else {
      this.#listeners.delete(event);
    }
    return this;
  }

  /**
   * 触发事件
   * 
   * @protected
   * @param {string} event - 事件名称
   * @param {...*} args - 传递给监听器的参数
   * @returns {this} 返回实例以支持链式调用
   * 
   * @example
   * this.emit('show', element);
   */
  emit(event, ...args) {
    if (!this.#listeners.has(event)) {
      return this;
    }

    this.#listeners.get(event).forEach(handler => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    });
    return this;
  }

  /**
   * 注册一次性事件监听器
   * 
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @returns {this} 返回实例以支持链式调用
   * 
   * @example
   * window.once('show', () => console.log('只触发一次'));
   */
  once(event, handler) {
    const onceHandler = (...args) => {
      handler(...args);
      this.off(event, onceHandler);
    };
    return this.on(event, onceHandler);
  }

  /**
   * 移除所有事件监听器
   * 
   * @protected
   * @returns {void}
   */
  removeAllListeners() {
    this.#listeners.clear();
  }

  /**
   * 获取事件监听器数量
   * 
   * @param {string} [event] - 事件名称，不传则返回所有事件的监听器总数
   * @returns {number}
   */
  listenerCount(event) {
    if (event) {
      return this.#listeners.has(event) ? this.#listeners.get(event).size : 0;
    }
    let count = 0;
    this.#listeners.forEach(handlers => count += handlers.size);
    return count;
  }
}

// ============================================================================
// Z-Index 管理器 - 单例模式
// ============================================================================

/**
 * Z-Index 管理器
 * 管理全局窗口层级
 * 
 * @class ZIndexManager
 * @private
 */
class ZIndexManager {
  /** @type {ZIndexManager|null} */
  static #instance = null;
  
  /** @type {number} */
  #maxZIndex = 10000;

  /**
   * 获取单例实例
   * @returns {ZIndexManager}
   */
  static getInstance() {
    if (!ZIndexManager.#instance) {
      ZIndexManager.#instance = new ZIndexManager();
    }
    return ZIndexManager.#instance;
  }

  /**
   * 获取下一个 z-index
   * @returns {number}
   */
  getNext() {
    return ++this.#maxZIndex;
  }

  /**
   * 获取当前最大 z-index
   * @returns {number}
   */
  getCurrent() {
    return this.#maxZIndex;
  }

  /**
   * 重置 z-index
   * @param {number} [value=10000] - 重置值
   * @returns {void}
   */
  reset(value = 10000) {
    this.#maxZIndex = value;
  }
}

// ============================================================================
// 窗口配置类
// ============================================================================

/**
 * 窗口配置类
 * 封装窗口配置选项，提供验证和默认值
 * 
 * @class WindowConfig
 * @private
 */
class WindowConfig {
  /** @type {Object} 默认配置 */
  static #defaults = {
    mode: 'centered',
    modal: true,
    backdropClose: true,
    quadrantMode: false,
    primaryQuadrant: 4,
    minMargin: 10,
    zIndex: null,
    x: 0,
    y: 0
  };

  /** @type {Object} 配置对象 */
  #config;

  /**
   * 创建配置实例
   * @param {Object} [options={}] - 配置选项
   */
  constructor(options = {}) {
    this.#config = { ...WindowConfig.#defaults, ...options };
    this.#validate();
  }

  /**
   * 验证配置
   * @private
   * @throws {Error} 配置无效时抛出错误
   */
  #validate() {
    const { mode, primaryQuadrant, minMargin } = this.#config;

    if (!['centered', 'positioned'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be 'centered' or 'positioned'`);
    }

    if (primaryQuadrant < 1 || primaryQuadrant > 4) {
      throw new Error(`Invalid primaryQuadrant: ${primaryQuadrant}. Must be 1-4`);
    }

    if (minMargin < 0) {
      throw new Error(`Invalid minMargin: ${minMargin}. Must be >= 0`);
    }
  }

  /**
   * 获取配置值
   * @param {string} key - 配置键
   * @returns {*}
   */
  get(key) {
    return this.#config[key];
  }

  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {*} value - 配置值
   * @returns {void}
   */
  set(key, value) {
    this.#config[key] = value;
    this.#validate();
  }

  /**
   * 批量更新配置
   * @param {Object} options - 配置选项
   * @returns {void}
   */
  update(options) {
    Object.assign(this.#config, options);
    this.#validate();
  }

  /**
   * 获取所有配置
   * @returns {Object}
   */
  getAll() {
    return { ...this.#config };
  }
}

// ============================================================================
// 主窗口类
// ============================================================================

/**
 * 伪窗口类
 * 
 * 核心窗口管理类，提供完整的窗口显示、隐藏、定位功能
 * 采用严格的面向对象设计，遵循 SOLID 原则
 * 
 * @class FakeWindow
 * @extends EventEmitter
 * 
 * @fires FakeWindow#beforeShow - 显示前触发
 * @fires FakeWindow#show - 显示后触发
 * @fires FakeWindow#beforeHide - 隐藏前触发
 * @fires FakeWindow#hide - 隐藏后触发
 * 
 * @example
 * // 创建居中窗口
 * const window = new FakeWindow(element, {
 *   mode: 'centered',
 *   modal: true
 * });
 * window.show();
 * 
 * @example
 * // 创建定位窗口
 * const menu = new FakeWindow(element, {
 *   mode: 'positioned',
 *   quadrantMode: true
 * });
 * menu.showAt(100, 200);
 */
class FakeWindow extends EventEmitter {
  // ========== 私有字段 ==========
  
  /** @type {HTMLElement} 窗口元素 */
  #element;
  
  /** @type {WindowConfig} 窗口配置 */
  #config;
  
  /** @type {boolean} 可见状态 */
  #visible = false;
  
  /** @type {Object} DOM 事件处理器 */
  #domHandlers = {};
  
  /** @type {boolean} 是否已销毁 */
  #destroyed = false;

  // ========== 构造函数 ==========

  /**
   * 创建伪窗口实例
   * 
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 配置选项
   * @param {string} [options.mode='centered'] - 显示模式：'centered' 或 'positioned'
   * @param {boolean} [options.modal=true] - 是否为模态窗口
   * @param {boolean} [options.backdropClose=true] - 点击背景/外部是否关闭
   * @param {boolean} [options.quadrantMode=false] - 是否启用象限模式（仅positioned模式）
   * @param {number} [options.primaryQuadrant=4] - 主象限 (1-4)
   * @param {number} [options.minMargin=10] - 最小边距
   * @param {number} [options.zIndex] - 自定义 z-index
   * 
   * @throws {Error} 如果 element 无效
   * 
   * @example
   * const window = new FakeWindow(document.getElementById('my-window'), {
   *   mode: 'centered',
   *   modal: true,
   *   backdropClose: true
   * });
   */
  constructor(element, options = {}) {
    super();
    
    // 验证元素
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error('FakeWindow: element must be a valid HTMLElement');
    }

    this.#element = element;
    this.#config = new WindowConfig(options);
    
    // 初始化
    this.#initialize();
  }

  /**
   * 初始化窗口
   * @private
   */
  #initialize() {
    // 添加基础类
    this.#element.classList.add('fake-window-wrapper');
    
    // 设置初始状态
    this.#visible = this.#element.classList.contains('show');
  }

  // ========== Getter/Setter ==========

  /**
   * 获取窗口元素
   * @type {HTMLElement}
   * @readonly
   */
  get element() {
    return this.#element;
  }

  /**
   * 获取可见状态
   * @type {boolean}
   * @readonly
   */
  get visible() {
    return this.#visible;
  }

  /**
   * 获取显示模式
   * @type {string}
   */
  get mode() {
    return this.#config.get('mode');
  }

  /**
   * 设置显示模式
   * @param {string} value - 'centered' 或 'positioned'
   */
  set mode(value) {
    this.#config.set('mode', value);
  }

  /**
   * 获取模态状态
   * @type {boolean}
   */
  get modal() {
    return this.#config.get('modal');
  }

  /**
   * 设置模态状态
   * @param {boolean} value
   */
  set modal(value) {
    this.#config.set('modal', value);
  }

  /**
   * 获取配置对象（只读副本）
   * @type {Object}
   * @readonly
   */
  get config() {
    return this.#config.getAll();
  }

  /**
   * 检查是否已销毁
   * @type {boolean}
   * @readonly
   */
  get destroyed() {
    return this.#destroyed;
  }

  // ========== 公共方法 ==========

  /**
   * 显示窗口（居中模式）
   * 
   * @returns {this} 返回实例以支持链式调用
   * @throws {Error} 如果窗口已销毁
   * 
   * @example
   * window.showCentered();
   */
  showCentered() {
    this.#config.set('mode', 'centered');
    return this.show();
  }

  /**
   * 在指定位置显示窗口
   * 
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @param {Object} [options={}] - 可选的配置覆盖
   * @returns {this} 返回实例以支持链式调用
   * @throws {Error} 如果窗口已销毁
   * 
   * @example
   * window.showAt(100, 200);
   * window.showAt(e.clientX, e.clientY, { quadrantMode: true });
   */
  showAt(x, y, options = {}) {
    this.#config.update({ ...options, mode: 'positioned', x, y });
    return this.show();
  }

  /**
   * 显示窗口（通用方法）
   * 
   * @returns {this} 返回实例以支持链式调用
   * @throws {Error} 如果窗口已销毁
   * 
   * @fires FakeWindow#beforeShow
   * @fires FakeWindow#show
   * 
   * @example
   * window.show();
   */
  show() {
    this.#checkDestroyed();

    if (this.#visible) {
      return this;
    }

    // 触发 beforeShow 事件
    this.emit('beforeShow', this.#element);

    // 清理旧的事件处理器
    this.#removeEventListeners();

    // 应用显示逻辑
    this.#applyDisplay();

    // 设置可见状态
    this.#visible = true;

    // 触发 show 事件
    this.emit('show', this.#element);

    return this;
  }

  /**
   * 隐藏窗口
   * 
   * @returns {this} 返回实例以支持链式调用
   * @throws {Error} 如果窗口已销毁
   * 
   * @fires FakeWindow#beforeHide
   * @fires FakeWindow#hide
   * 
   * @example
   * window.hide();
   */
  hide() {
    this.#checkDestroyed();

    if (!this.#visible) {
      return this;
    }

    // 触发 beforeHide 事件
    this.emit('beforeHide', this.#element);

    // 移除显示类
    this.#element.classList.remove('show');
    this.#visible = false;

    // 清理事件监听器
    this.#removeEventListeners();

    // 触发 hide 事件
    this.emit('hide', this.#element);

    return this;
  }

  /**
   * 切换显示/隐藏
   * 
   * @returns {this} 返回实例以支持链式调用
   * 
   * @example
   * window.toggle();
   */
  toggle() {
    return this.#visible ? this.hide() : this.show();
  }

  /**
   * 将窗口置于最前
   * 
   * @returns {this} 返回实例以支持链式调用
   * 
   * @example
   * window.bringToFront();
   */
  bringToFront() {
    this.#checkDestroyed();
    this.#element.style.zIndex = ZIndexManager.getInstance().getNext();
    return this;
  }

  /**
   * 更新配置
   * 
   * @param {Object} options - 新的配置选项
   * @returns {this} 返回实例以支持链式调用
   * 
   * @example
   * window.updateConfig({ modal: false });
   */
  updateConfig(options) {
    this.#checkDestroyed();
    this.#config.update(options);
    return this;
  }

  /**
   * 销毁窗口
   * 清理所有资源和事件监听器
   * 
   * @returns {void}
   * 
   * @example
   * window.destroy();
   */
  destroy() {
    if (this.#destroyed) {
      return;
    }

    // 隐藏窗口
    if (this.#visible) {
      this.hide();
    }

    // 移除所有事件监听器
    this.#removeEventListeners();
    this.removeAllListeners();

    // 移除类名
    this.#element.classList.remove('fake-window-wrapper', 'show', 'centered', 'positioned', 'modal');

    // 标记为已销毁
    this.#destroyed = true;

    // 清空引用
    this.#element = null;
    this.#config = null;
  }

  // ========== 私有方法 ==========

  /**
   * 检查是否已销毁
   * @private
   * @throws {Error} 如果已销毁
   */
  #checkDestroyed() {
    if (this.#destroyed) {
      throw new Error('FakeWindow: Cannot operate on destroyed window');
    }
  }

  /**
   * 应用显示逻辑
   * @private
   */
  #applyDisplay() {
    const mode = this.#config.get('mode');

    // 设置模式类
    if (mode === 'centered') {
      this.#element.classList.add('centered');
      this.#element.classList.remove('positioned');
    } else {
      this.#element.classList.add('positioned');
      this.#element.classList.remove('centered');
    }

    // 设置模态
    if (this.#config.get('modal')) {
      this.#element.classList.add('modal');
    } else {
      this.#element.classList.remove('modal');
    }

    // 设置 z-index
    const customZIndex = this.#config.get('zIndex');
    if (customZIndex) {
      this.#element.style.zIndex = customZIndex;
    } else {
      this.#element.style.zIndex = ZIndexManager.getInstance().getNext();
    }

    // 显示窗口
    this.#element.classList.add('show');

    // 处理定位模式
    if (mode === 'positioned') {
      this.#applyPositioning();
    }

    // 设置事件监听器
    this.#setupEventListeners();
  }

  /**
   * 应用定位
   * @private
   */
  #applyPositioning() {
    const contentElement = this.#element.firstElementChild;
    if (!contentElement) {
      return;
    }

    const x = this.#config.get('x');
    const y = this.#config.get('y');

    if (this.#config.get('quadrantMode')) {
      this.#positionByQuadrant(contentElement, x, y);
    } else {
      contentElement.style.left = `${x}px`;
      contentElement.style.top = `${y}px`;
    }
  }

  /**
   * 象限模式定位 - 策略模式
   * @private
   * @param {HTMLElement} element - 内容元素
   * @param {number} originX - 原点 X 坐标
   * @param {number} originY - 原点 Y 坐标
   */
  #positionByQuadrant(element, originX, originY) {
    // 初始定位
    element.style.left = `${originX}px`;
    element.style.top = `${originY}px`;

    // 使用 requestAnimationFrame 确保元素已渲染
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const minMargin = this.#config.get('minMargin');

      // 计算可用空间
      const hasRightSpace = (originX + rect.width + minMargin) <= viewportWidth;
      const hasLeftSpace = (originX - rect.width - minMargin) >= 0;
      const hasBottomSpace = (originY + rect.height + minMargin) <= viewportHeight;
      const hasTopSpace = (originY - rect.height - minMargin) >= 0;

      // 根据主象限和可用空间计算最终位置
      const position = this.#calculateQuadrantPosition(
        originX, originY, rect.width, rect.height,
        hasRightSpace, hasLeftSpace, hasBottomSpace, hasTopSpace
      );

      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
    });
  }

  /**
   * 计算象限位置
   * @private
   * @param {number} originX - 原点 X
   * @param {number} originY - 原点 Y
   * @param {number} width - 元素宽度
   * @param {number} height - 元素高度
   * @param {boolean} hasRight - 右侧有空间
   * @param {boolean} hasLeft - 左侧有空间
   * @param {boolean} hasBottom - 下方有空间
   * @param {boolean} hasTop - 上方有空间
   * @returns {{x: number, y: number}}
   */
  #calculateQuadrantPosition(originX, originY, width, height, hasRight, hasLeft, hasBottom, hasTop) {
    const primaryQuadrant = this.#config.get('primaryQuadrant');
    let finalX, finalY;

    switch (primaryQuadrant) {
      case 4: // 主象限：右下
        if (hasRight && hasBottom) {
          finalX = originX;
          finalY = originY;
        } else if (!hasRight && hasBottom) {
          finalX = originX - width;
          finalY = originY;
        } else if (hasRight && !hasBottom) {
          finalX = originX;
          finalY = originY - height;
        } else {
          finalX = originX - width;
          finalY = originY - height;
        }
        break;

      case 1: // 主象限：右上
        if (hasRight && hasTop) {
          finalX = originX;
          finalY = originY - height;
        } else if (!hasRight && hasTop) {
          finalX = originX - width;
          finalY = originY - height;
        } else if (hasRight && !hasTop) {
          finalX = originX;
          finalY = originY;
        } else {
          finalX = originX - width;
          finalY = originY;
        }
        break;

      case 2: // 主象限：左上
        if (hasLeft && hasTop) {
          finalX = originX - width;
          finalY = originY - height;
        } else if (hasLeft && !hasTop) {
          finalX = originX - width;
          finalY = originY;
        } else if (!hasLeft && hasTop) {
          finalX = originX;
          finalY = originY - height;
        } else {
          finalX = originX;
          finalY = originY;
        }
        break;

      case 3: // 主象限：左下
        if (hasLeft && hasBottom) {
          finalX = originX - width;
          finalY = originY;
        } else if (!hasLeft && hasBottom) {
          finalX = originX;
          finalY = originY;
        } else if (hasLeft && !hasBottom) {
          finalX = originX - width;
          finalY = originY - height;
        } else {
          finalX = originX;
          finalY = originY - height;
        }
        break;

      default:
        finalX = originX;
        finalY = originY;
    }

    return { x: finalX, y: finalY };
  }

  /**
   * 设置事件监听器
   * @private
   */
  #setupEventListeners() {
    if (this.#config.get('backdropClose')) {
      if (this.#config.get('mode') === 'centered') {
        this.#setupBackdropClose();
      } else {
        this.#setupOutsideClick();
      }
    }

    this.#setupEscClose();
  }

  /**
   * 设置背景点击关闭（居中模式）
   * @private
   */
  #setupBackdropClose() {
    const handler = (e) => {
      if (e.target === this.#element && this.#visible) {
        this.hide();
      }
    };

    this.#element.addEventListener('click', handler);
    this.#domHandlers.backdropClickHandler = handler;
  }

  /**
   * 设置点击外部关闭（自定义位置模式）
   * @private
   */
  #setupOutsideClick() {
    const handler = (e) => {
      const contentElement = this.#element.firstElementChild;
      if (contentElement && !contentElement.contains(e.target) && this.#visible) {
        this.hide();
      }
    };

    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handler);
      this.#domHandlers.outsideClickHandler = handler;
    }, 0);
  }

  /**
   * 设置 ESC 键关闭
   * @private
   */
  #setupEscClose() {
    const handler = (e) => {
      if (e.key === 'Escape' && this.#visible) {
        this.hide();
      }
    };

    document.addEventListener('keydown', handler);
    this.#domHandlers.escKeyHandler = handler;
  }

  /**
   * 移除事件监听器
   * @private
   */
  #removeEventListeners() {
    // 移除背景点击监听器
    if (this.#domHandlers.backdropClickHandler) {
      this.#element.removeEventListener('click', this.#domHandlers.backdropClickHandler);
      delete this.#domHandlers.backdropClickHandler;
    }

    // 移除外部点击监听器
    if (this.#domHandlers.outsideClickHandler) {
      document.removeEventListener('click', this.#domHandlers.outsideClickHandler);
      delete this.#domHandlers.outsideClickHandler;
    }

    // 移除 ESC 键监听器
    if (this.#domHandlers.escKeyHandler) {
      document.removeEventListener('keydown', this.#domHandlers.escKeyHandler);
      delete this.#domHandlers.escKeyHandler;
    }
  }
}

// ============================================================================
// 窗口工厂 - 工厂模式
// ============================================================================

/**
 * 窗口工厂类
 * 
 * 提供便捷的窗口创建方法和预设配置模板
 * 实现工厂模式，简化窗口实例的创建
 * 
 * @class WindowFactory
 * 
 * @example
 * // 创建对话框
 * const dialog = WindowFactory.createDialog(element);
 * 
 * @example
 * // 创建右键菜单
 * const menu = WindowFactory.createContextMenu(element);
 */
class WindowFactory {
  /**
   * 预设配置模板
   * @private
   * @static
   */
  static #presets = {
    dialog: {
      mode: 'centered',
      modal: true,
      backdropClose: false
    },
    alert: {
      mode: 'centered',
      modal: true,
      backdropClose: true
    },
    contextMenu: {
      mode: 'positioned',
      modal: false,
      backdropClose: true,
      quadrantMode: true,
      primaryQuadrant: 4,
      minMargin: 10
    },
    tooltip: {
      mode: 'positioned',
      modal: false,
      backdropClose: false,
      quadrantMode: true,
      primaryQuadrant: 1,
      minMargin: 8
    },
    dropdown: {
      mode: 'positioned',
      modal: false,
      backdropClose: true,
      quadrantMode: true,
      primaryQuadrant: 4,
      minMargin: 5
    },
    modal: {
      mode: 'centered',
      modal: true,
      backdropClose: true
    }
  };

  /**
   * 创建窗口实例
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {string} preset - 预设名称
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const window = WindowFactory.create(element, 'dialog');
   */
  static create(element, preset, options = {}) {
    const presetConfig = WindowFactory.#presets[preset] || {};
    const config = { ...presetConfig, ...options };
    return new FakeWindow(element, config);
  }

  /**
   * 创建对话框窗口
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const dialog = WindowFactory.createDialog(element);
   */
  static createDialog(element, options = {}) {
    return WindowFactory.create(element, 'dialog', options);
  }

  /**
   * 创建提示窗口
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const alert = WindowFactory.createAlert(element);
   */
  static createAlert(element, options = {}) {
    return WindowFactory.create(element, 'alert', options);
  }

  /**
   * 创建右键菜单窗口
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const menu = WindowFactory.createContextMenu(element);
   */
  static createContextMenu(element, options = {}) {
    return WindowFactory.create(element, 'contextMenu', options);
  }

  /**
   * 创建工具提示窗口
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const tooltip = WindowFactory.createTooltip(element);
   */
  static createTooltip(element, options = {}) {
    return WindowFactory.create(element, 'tooltip', options);
  }

  /**
   * 创建下拉菜单窗口
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const dropdown = WindowFactory.createDropdown(element);
   */
  static createDropdown(element, options = {}) {
    return WindowFactory.create(element, 'dropdown', options);
  }

  /**
   * 创建模态窗口
   * 
   * @static
   * @param {HTMLElement} element - 窗口元素
   * @param {Object} [options={}] - 额外配置选项
   * @returns {FakeWindow}
   * 
   * @example
   * const modal = WindowFactory.createModal(element);
   */
  static createModal(element, options = {}) {
    return WindowFactory.create(element, 'modal', options);
  }

  /**
   * 注册自定义预设
   * 
   * @static
   * @param {string} name - 预设名称
   * @param {Object} config - 预设配置
   * @returns {void}
   * 
   * @example
   * WindowFactory.registerPreset('myPreset', {
   *   mode: 'centered',
   *   modal: true
   * });
   */
  static registerPreset(name, config) {
    WindowFactory.#presets[name] = config;
  }

  /**
   * 获取预设配置
   * 
   * @static
   * @param {string} name - 预设名称
   * @returns {Object|null}
   * 
   * @example
   * const config = WindowFactory.getPreset('dialog');
   */
  static getPreset(name) {
    return WindowFactory.#presets[name] || null;
  }

  /**
   * 获取所有预设名称
   * 
   * @static
   * @returns {string[]}
   * 
   * @example
   * const presets = WindowFactory.getPresetNames();
   */
  static getPresetNames() {
    return Object.keys(WindowFactory.#presets);
  }
}

// ============================================================================
// 导出
// ============================================================================

// 主要导出
module.exports = FakeWindow;

// 附加导出
module.exports.FakeWindow = FakeWindow;
module.exports.WindowFactory = WindowFactory;
module.exports.EventEmitter = EventEmitter;

// 版本信息
module.exports.VERSION = '2.0.0';
