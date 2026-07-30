import { Matrix, Vector } from "../../../utils/math.js";
import { StrokeObject } from "../stroke.js";

function createStroke(points, options = {}) {
  return new StrokeObject(
    options.id ?? 1,
    options.position ?? new Vector(0, 0),
    { width: 2, ...(options.property ?? {}) },
    { points },
  );
}

function horizontalStrokePoints() {
  return [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
    { x: 30, y: 0 },
    { x: 40, y: 0 },
  ];
}

describe("StrokeObject.eraseData", () => {
  test("轨迹未命中时返回 null", () => {
    const stroke = createStroke(horizontalStrokePoints());

    const result = stroke.eraseData(
      [new Vector(100, 100), new Vector(110, 100)],
      1,
    );

    expect(result).toBeNull();
  });

  test("空轨迹或空笔画返回 null", () => {
    const stroke = createStroke(horizontalStrokePoints());
    const emptyStroke = createStroke([]);

    expect(stroke.eraseData([], 1)).toBeNull();
    expect(emptyStroke.eraseData([new Vector(0, 0)], 1)).toBeNull();
  });

  test("从端点咬掉一段时返回单段剩余", () => {
    const stroke = createStroke(horizontalStrokePoints());

    // 阈值 = 1 + 2/2 = 2；轨迹在 x=5 处竖直穿越，仅擦除线段 (0,0)-(10,0)
    const result = stroke.eraseData(
      [new Vector(5, -5), new Vector(5, 5)],
      1,
    );

    expect(result).toEqual([
      [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 40, y: 0 },
      ],
    ]);
  });

  test("中间擦出一个洞时分裂为两段", () => {
    const stroke = createStroke(horizontalStrokePoints());

    // 轨迹在 x=20 处竖直穿越，擦除以 (20,0) 为端点的两条线段
    const result = stroke.eraseData(
      [new Vector(20, -5), new Vector(20, 5)],
      1,
    );

    expect(result).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 30, y: 0 },
        { x: 40, y: 0 },
      ],
    ]);
  });

  test("轨迹整笔覆盖时返回空数组", () => {
    const stroke = createStroke(horizontalStrokePoints());

    const result = stroke.eraseData(
      [new Vector(-5, 0), new Vector(45, 0)],
      1,
    );

    expect(result).toEqual([]);
  });

  test("单点笔画命中时返回空数组，未命中时返回 null", () => {
    const dot = createStroke([{ x: 10, y: 10 }]);

    expect(
      dot.eraseData([new Vector(10, 11), new Vector(20, 11)], 1),
    ).toEqual([]);
    expect(
      dot.eraseData([new Vector(10, 14), new Vector(20, 14)], 1),
    ).toBeNull();
  });

  test("单点轨迹按点擦除", () => {
    const stroke = createStroke(horizontalStrokePoints());

    const result = stroke.eraseData([new Vector(20, 1)], 1);

    expect(result).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 30, y: 0 },
        { x: 40, y: 0 },
      ],
    ]);
  });

  test("笔画宽度随 transform 缩放，擦除阈值按世界宽度折算", () => {
    // world 点列为 (0,0)-(20,0)，世界宽度 = 1 × sqrt(4) = 2，阈值 = 1 + 1 = 2
    const scaledStroke = createStroke([{ x: 0, y: 0 }, { x: 10, y: 0 }], {
      property: { width: 1 },
    });
    scaledStroke.setTransform(new Matrix(2, 0, 0, 2));

    expect(scaledStroke.eraseData([new Vector(10, 1.75)], 1)).toEqual([]);

    // 恒等变换下世界宽度 = 1，阈值 = 1.5，轨迹距离 1.75 未命中
    const identityStroke = createStroke([{ x: 0, y: 0 }, { x: 10, y: 0 }], {
      property: { width: 1 },
    });

    expect(identityStroke.eraseData([new Vector(5, 1.75)], 1)).toBeNull();
  });

  test("笔画越宽擦除范围越大", () => {
    const wideStroke = createStroke([{ x: 0, y: 0 }, { x: 20, y: 0 }], {
      property: { width: 10 },
    });
    const thinStroke = createStroke([{ x: 0, y: 0 }, { x: 20, y: 0 }], {
      property: { width: 1 },
    });

    // 轨迹距离笔画 5：宽笔阈值 = 1 + 5 = 6 命中，细笔阈值 = 1.5 未命中
    expect(wideStroke.eraseData([new Vector(10, 5)], 1)).toEqual([]);
    expect(thinStroke.eraseData([new Vector(10, 5)], 1)).toBeNull();
  });

  test("返回点段是 data.points 的局部坐标切片", () => {
    const points = horizontalStrokePoints();
    const stroke = createStroke(points, { position: new Vector(100, 50) });

    // 笔画平移到 (100,50) 后，世界轨迹需相应平移
    const result = stroke.eraseData(
      [new Vector(120, 45), new Vector(120, 55)],
      1,
    );

    expect(result).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 30, y: 0 },
        { x: 40, y: 0 },
      ],
    ]);
    expect(result[0][0]).toBe(points[0]);
  });
});
