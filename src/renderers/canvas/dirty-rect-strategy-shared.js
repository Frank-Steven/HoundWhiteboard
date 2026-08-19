/**
 * @file shared dirty rect 策略
 * @description 提供不依赖 chunk、DOM 和线程宿主的 dirty rect 共享策略函数。
 * @module canvas/dirty-rect-strategy-shared
 * @author Zhou Chenyu
 */

/**
 * 规整缩放因子
 * @param {number} [zoom = 1] 缩放因子
 * @returns {number}
 */
function normalizeDirtyRectZoomScale(zoom = 1) {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * 将阈值裁剪到指定范围内
 * @param {number} value - 原始值
 * @param {number} [min = -Infinity] - 最小允许值
 * @param {number} [max = Infinity] - 最大允许值
 * @returns {number}
 */
function clampDirtyRectThresholdValue(value, min = -Infinity, max = Infinity) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 创建缩放指数型阈值函数
 * @description value = baseValue * zoomScale ** exponent。
 * @param {Object} [options = {}] - 阈值配置
 * @param {number} [options.baseValue = 0] - 基准值
 * @param {number} [options.exponent = 1] - 缩放指数
 * @param {number} [options.min = -Infinity] - 最小允许值
 * @param {number} [options.max = Infinity] - 最大允许值
 * @returns {(zoom?: number) => number}
 */
function createZoomScaledThresholdStrategy({
  baseValue = 0,
  exponent = 1,
  min = -Infinity,
  max = Infinity,
} = {}) {
  return function resolveZoomScaledThreshold(zoom = 1) {
    const zoomScale = normalizeDirtyRectZoomScale(zoom);

    return clampDirtyRectThresholdValue(
      baseValue * zoomScale ** exponent,
      min,
      max,
    );
  };
}

/**
 * 创建缩放偏移型阈值函数
 * @description value = baseValue + (zoomScale - 1) * zoomStep。
 * @param {Object} [options = {}] - 阈值配置
 * @param {number} [options.baseValue = 0] - 基准值
 * @param {number} [options.zoomStep = 0] - 每一级缩放步长的增量
 * @param {number} [options.min = -Infinity] - 最小允许值
 * @param {number} [options.max = Infinity] - 最大允许值
 * @returns {(zoom?: number) => number}
 */
function createZoomOffsetThresholdStrategy({
  baseValue = 0,
  zoomStep = 0,
  min = -Infinity,
  max = Infinity,
} = {}) {
  return function resolveZoomOffsetThreshold(zoom = 1) {
    const zoomScale = normalizeDirtyRectZoomScale(zoom);

    return clampDirtyRectThresholdValue(
      baseValue + (zoomScale - 1) * zoomStep,
      min,
      max,
    );
  };
}

/**
 * 解析阈值策略值，支持函数式惰性求值
 * @param {number | Function} strategyValue - 静态值或 (zoom) => number 的回调
 * @param {number} [zoom = 1] - 当前缩放因子
 * @returns {number | undefined}
 */
function resolveThresholdStrategyValue(strategyValue, zoom = 1) {
  return typeof strategyValue === "function"
    ? strategyValue(zoom)
    : strategyValue;
}

/**
 * 创建 dirty rect 阈值解析函数
 * @description 返回的函数按当前 zoom 解析出一组完整的合并阈值。
 * @param {Object} [thresholds = {}] - 阈值配置，每项可为静态值或 zoom-aware 函数
 * @returns {(zoom?: number) => Record<string, number | undefined>}
 */
function createDirtyRectThresholdStrategy(thresholds = {}) {
  return function resolveDirtyRectThresholds(zoom = 1) {
    const zoomScale = normalizeDirtyRectZoomScale(zoom);

    return {
      axisNearGap: resolveThresholdStrategyValue(
        thresholds.axisNearGap,
        zoomScale,
      ),
      diagonalNearGap: resolveThresholdStrategyValue(
        thresholds.diagonalNearGap,
        zoomScale,
      ),
      maxExtraArea: resolveThresholdStrategyValue(
        thresholds.maxExtraArea,
        zoomScale,
      ),
      maxGrowthRatio: resolveThresholdStrategyValue(
        thresholds.maxGrowthRatio,
        zoomScale,
      ),
      viewportCoverageRatio: resolveThresholdStrategyValue(
        thresholds.viewportCoverageRatio,
        zoomScale,
      ),
    };
  };
}

/**
 * 创建 base 层默认阈值策略
 * @param {Object} [overrides = {}] - 覆盖项
 * @returns {(zoom?: number) => Record<string, number | undefined>}
 */
function createBaseDirtyRectThresholdStrategy(overrides = {}) {
  return createDirtyRectThresholdStrategy({
    axisNearGap: createZoomScaledThresholdStrategy({ baseValue: 6 }),
    diagonalNearGap: createZoomScaledThresholdStrategy({ baseValue: 3 }),
    maxExtraArea: createZoomScaledThresholdStrategy({
      baseValue: 160,
      exponent: 2,
    }),
    maxGrowthRatio: 1.2,
    viewportCoverageRatio: createZoomOffsetThresholdStrategy({
      baseValue: 0.92,
      zoomStep: 0.03,
      max: 0.98,
    }),
    ...overrides,
  });
}

/**
 * 创建 live 层默认阈值策略
 * @param {Object} [overrides = {}] - 覆盖项
 * @returns {(zoom?: number) => Record<string, number | undefined>}
 */
function createLiveDirtyRectThresholdStrategy(overrides = {}) {
  return createDirtyRectThresholdStrategy({
    axisNearGap: createZoomScaledThresholdStrategy({ baseValue: 12 }),
    diagonalNearGap: createZoomScaledThresholdStrategy({ baseValue: 6 }),
    maxExtraArea: createZoomScaledThresholdStrategy({
      baseValue: 384,
      exponent: 2,
    }),
    maxGrowthRatio: 1.5,
    viewportCoverageRatio: createZoomOffsetThresholdStrategy({
      baseValue: 0.72,
      zoomStep: 0.08,
      max: 0.92,
    }),
    ...overrides,
  });
}

export {
  createBaseDirtyRectThresholdStrategy,
  createDirtyRectThresholdStrategy,
  createLiveDirtyRectThresholdStrategy,
  createZoomOffsetThresholdStrategy,
  createZoomScaledThresholdStrategy,
  normalizeDirtyRectZoomScale,
};
