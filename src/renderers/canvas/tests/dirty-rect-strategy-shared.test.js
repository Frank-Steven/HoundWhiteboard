import {
  createBaseDirtyRectThresholdStrategy,
  createLiveDirtyRectThresholdStrategy,
  createZoomScaledThresholdStrategy,
} from "../dirty-rect-strategy-shared.js";

describe("dirty rect strategy shared", () => {
  test("base 预设策略应返回 zoom-aware 阈值", () => {
    const resolveBaseThresholds = createBaseDirtyRectThresholdStrategy();
    const zoom1Thresholds = resolveBaseThresholds(1);
    const zoom2Thresholds = resolveBaseThresholds(2);

    expect(zoom1Thresholds.axisNearGap).toBe(6);
    expect(zoom1Thresholds.diagonalNearGap).toBe(3);
    expect(zoom1Thresholds.maxExtraArea).toBe(160);
    expect(zoom1Thresholds.maxGrowthRatio).toBe(1.2);
    expect(zoom1Thresholds.viewportCoverageRatio).toBeCloseTo(0.92);

    expect(zoom2Thresholds.axisNearGap).toBe(12);
    expect(zoom2Thresholds.diagonalNearGap).toBe(6);
    expect(zoom2Thresholds.maxExtraArea).toBe(640);
    expect(zoom2Thresholds.maxGrowthRatio).toBe(1.2);
    expect(zoom2Thresholds.viewportCoverageRatio).toBeCloseTo(0.95);
  });

  test("live 预设策略应返回 zoom-aware 阈值", () => {
    const resolveLiveThresholds = createLiveDirtyRectThresholdStrategy();
    const zoom1Thresholds = resolveLiveThresholds(1);
    const zoom2Thresholds = resolveLiveThresholds(2);

    expect(zoom1Thresholds.axisNearGap).toBe(12);
    expect(zoom1Thresholds.diagonalNearGap).toBe(6);
    expect(zoom1Thresholds.maxExtraArea).toBe(384);
    expect(zoom1Thresholds.maxGrowthRatio).toBe(1.5);
    expect(zoom1Thresholds.viewportCoverageRatio).toBeCloseTo(0.72);

    expect(zoom2Thresholds.axisNearGap).toBe(24);
    expect(zoom2Thresholds.diagonalNearGap).toBe(12);
    expect(zoom2Thresholds.maxExtraArea).toBe(1536);
    expect(zoom2Thresholds.maxGrowthRatio).toBe(1.5);
    expect(zoom2Thresholds.viewportCoverageRatio).toBeCloseTo(0.8);
  });

  test("策略工厂应支持覆盖单个阈值策略", () => {
    const resolveBaseThresholds = createBaseDirtyRectThresholdStrategy({
      axisNearGap: createZoomScaledThresholdStrategy({
        baseValue: 10,
        max: 18,
      }),
    });

    expect(resolveBaseThresholds(1).axisNearGap).toBe(10);
    expect(resolveBaseThresholds(2).axisNearGap).toBe(18);
  });
});
