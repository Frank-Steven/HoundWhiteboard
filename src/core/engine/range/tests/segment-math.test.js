import { Vector } from "../../utils/math.js";
import {
  pointToPolylineDistance,
  pointToSegmentDistance,
  segmentSegmentDistance,
} from "../segment-math.js";

describe("pointToSegmentDistance", () => {
  test("点在线段上时距离为零", () => {
    expect(
      pointToSegmentDistance(new Vector(1, 0), new Vector(0, 0), new Vector(2, 0)),
    ).toBeCloseTo(0);
  });

  test("投影落在线段内时返回垂距", () => {
    expect(
      pointToSegmentDistance(new Vector(1, 3), new Vector(0, 0), new Vector(2, 0)),
    ).toBeCloseTo(3);
  });

  test("投影落在线段外时返回到最近端点的距离", () => {
    expect(
      pointToSegmentDistance(new Vector(5, 4), new Vector(0, 0), new Vector(2, 0)),
    ).toBeCloseTo(5);
    expect(
      pointToSegmentDistance(new Vector(-3, -4), new Vector(0, 0), new Vector(2, 0)),
    ).toBeCloseTo(5);
  });

  test("零长线段退化为点到点距离", () => {
    expect(
      pointToSegmentDistance(new Vector(3, 4), new Vector(0, 0), new Vector(0, 0)),
    ).toBeCloseTo(5);
  });
});

describe("segmentSegmentDistance", () => {
  test("相交线段距离为零", () => {
    expect(
      segmentSegmentDistance(
        new Vector(0, 0),
        new Vector(2, 2),
        new Vector(0, 2),
        new Vector(2, 0),
      ),
    ).toBe(0);
  });

  test("端点接触的线段距离为零", () => {
    expect(
      segmentSegmentDistance(
        new Vector(0, 0),
        new Vector(1, 0),
        new Vector(1, 0),
        new Vector(2, 1),
      ),
    ).toBe(0);
  });

  test("平行线段返回垂距", () => {
    expect(
      segmentSegmentDistance(
        new Vector(0, 0),
        new Vector(2, 0),
        new Vector(0, 3),
        new Vector(2, 3),
      ),
    ).toBeCloseTo(3);
  });

  test("错位线段返回最近点对的距离", () => {
    // 线段1: (0,0)-(3,0)，线段2: (6,4)-(10,4)，最近点对 (3,0)-(6,4) 距离为 5
    expect(
      segmentSegmentDistance(
        new Vector(0, 0),
        new Vector(3, 0),
        new Vector(6, 4),
        new Vector(10, 4),
      ),
    ).toBeCloseTo(5);
  });

  test("一条线段退化时退化为点到线段距离", () => {
    expect(
      segmentSegmentDistance(
        new Vector(0, 0),
        new Vector(2, 0),
        new Vector(1, 4),
        new Vector(1, 4),
      ),
    ).toBeCloseTo(4);
  });
});

describe("pointToPolylineDistance", () => {
  test("空点列返回 Infinity", () => {
    expect(pointToPolylineDistance(new Vector(0, 0), [])).toBe(Infinity);
  });

  test("单点折线退化为点到点距离", () => {
    expect(pointToPolylineDistance(new Vector(3, 4), [new Vector(0, 0)])).toBeCloseTo(5);
  });

  test("多段折线取各段距离的最小值", () => {
    const polyline = [new Vector(0, 0), new Vector(4, 0), new Vector(4, 4)];

    expect(pointToPolylineDistance(new Vector(2, 1), polyline)).toBeCloseTo(1);
    expect(pointToPolylineDistance(new Vector(5, 2), polyline)).toBeCloseTo(1);
  });
});
