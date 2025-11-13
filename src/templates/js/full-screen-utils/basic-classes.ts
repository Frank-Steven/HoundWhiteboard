/**
 * @file 基本对象定义
 * @description
 * 定义白板系统中使用的所有基础类，包括
 * - 点
 * - 对象范围
 */

import * as math from "mathjs";

/**
 * 二维点类
 * @class
 * @description 表示二维平面上的一个点，包含 x 和 y 坐标，支持矩阵变换
 * @author Zhou Chenyu
 */
class Point {
  /**
   * 点的横坐标
   * @type {number}
   */
  x: number;

  /**
   * 点的纵坐标
   * @type {number}
   */
  y: number;

  /**
   * 创建一个新的二维点
   * @param {number} x - 横坐标
   * @param {number} y - 纵坐标
   * @constructor
   */
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * 将此对象序列化为普通 JSON 对象
   * @returns {{x: number, y: number}} 包含 x 和 y 坐标的对象
   * @example
   * const point = new Point(10, 20);
   * const serialized = point.serialize(); // { x: 10, y: 20 }
   */
  serialize(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * 将序列化的对象转化为 Point 实例
   * @param {{x: number, y: number}} point - 包含 x 和 y 坐标的对象
   * @returns {Point} Point 实例
   * @static
   * @example
   * const point = Point.parse({ x: 10, y: 20 });
   */
  static parse(point: { x: number; y: number }): Point {
    return new Point(point.x, point.y);
  }

  /**
   * 应用变换矩阵
   * @description 此方法为破坏性操作，会直接修改当前点的坐标
   * @param {math.Matrix} trans - 2x2 变换矩阵
   * @returns {Point} 返回自己以支持链式调用
   * @example
   * const point = new Point(1, 0);
   * const rotationMatrix = math.matrix([[0, -1], [1, 0]]); // 90度旋转
   * point.applyTransform(rotationMatrix); // point 现在是 (0, 1)
   */
  applyTransform(trans: math.Matrix): Point {
    const p = Point.multiplyMatrix(trans, this);
    this.x = p.x;
    this.y = p.y;
    return this;
  }

  /**
   * 将矩阵与点相乘
   * @description 执行矩阵-向量乘法，返回新的点而不修改原点
   * @param {math.Matrix} m - 2x2 变换矩阵
   * @param {Point} p - 要变换的点
   * @returns {Point} 变换后的新点
   * @static
   */
  static multiplyMatrix(m: math.Matrix, p: Point): Point {
    return new Point(
      m.get([0, 0]) * p.x + m.get([0, 1]) * p.y,
      m.get([1, 0]) * p.x + m.get([1, 1]) * p.y
    );
  }
}

/**
 * 范围类
 * @abstract
 * @class
 * @author Zhou Chenyu
 */
abstract class Range {
  /**
   * 判断一点是否在该范围内
   * @abstract
   * @param {Point} point - 要判断的点
   * @returns {boolean} 是否在范围内
   */
  abstract inRange(point: Point): boolean;

  constructor() {};
}

/**
 * 矩形范围类
 * @class
 * @extends Range
 * @author Zhou Chenyu
 */
class RectangleRange extends Range {
  /**
   * 矩形范围左上角点
   * @type {Point}
   */
  position: Point;

  /**
   * 矩形范围的高
   * @type {number}
   */
  height: number;

  /**
   * 矩形范围的宽
   * @type {number}
   */
  width: number;

  /**
   * 创建一个新的矩形范围
   * @param {Point} point - 矩形范围的左上角
   * @param {number} height - 矩形范围的高
   * @param {number} width - 矩形范围的宽
   * @constructor
   */
  constructor(point: Point, height: number, width: number) {
    super();
    this.position = point;
    this.height = height;
    this.width = width;
  }

  inRange(point: Point): boolean {
    return this.position.x <= point.x && point.x <= this.position.x + this.width
        && this.position.y <= point.y && point.y <= this.position.y + this.height;
  }
}

/**
 * 圆范围类
 * @class
 * @extends Range
 * @author Zhou Chenyu
 */
class CircleRange extends Range {
  /**
   * 圆范围的圆心
   * @type {Point}
   */
  position: Point;

  /**
   * 圆范围的半径
   * @type {number}
   */
  radius: number;

  /**
   * 创建一个新的圆范围
   * @param {Point} point - 圆范围的圆心
   * @param {number} radius - 圆范围的半径
   * @constructor
   */
  constructor(point: Point, radius: number) {
    super();
    this.position = point;
    this.radius = radius;
  }

  inRange(point: Point): boolean {
    return point.x <= this.radius * this.radius;
  }
}

/**
 * 多边形范围类
 * @class
 * @extends Range
 * @author Zhou Chenyu
 */
class PolygonRange extends Range {
  /**
   * 多边形范围的边界点集
   * @type {Point[]}
   */
  points: Point[];

  /**
   * 创建一个新的多边形范围
   * @param {Point[]} points - 多边形范围的边界点集
   * @constructor
   */
  constructor(points: Point[]) {
    super();
    this.points = points;
  }

  inRange(point: Point): boolean {
    throw new Error("Method not implemented.")
  }
}

export {
	Point,
  Range,
  PolygonRange,
  RectangleRange,
  CircleRange,
};
