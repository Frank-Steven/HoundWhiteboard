/**
 * @file 白板对象定义
 * @description
 * @author Zhou Chenyu
 */

const math = require("mathjs");

/**
 * 二维点
 * @author Zhou Chenyu
 */
class Point {
  /**
   * 点的横坐标
   * @type {number}
   */
  x;

  /**
   * 点的纵坐标
   * @type {number}
   */
  y;

  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * 将此对象序列化
   * @returns {{x: number, y: number}}
   */
  serialize() {
    return {x: this.x, y: this.y};
  }

  /**
   * 将序列化的 Point 转化为 Point 对象
   * @param {Object} point
   * @param {number} point.x
   * @param {number} point.y
   */
  static parse(point) {
    return new Point(point.x, point.y);
  }

  /**
   * 应用变换矩阵（破坏性操作）
   * @param {math.Matrix} trans - 变换矩阵
   * @returns {Point} - 返回自己以链式调用
   */
  applyTransform(trans) {
    let p = Point.multiplyMatrix(trans, this);
    this.x = p.x;
    this.y = p.y;
    return this;
  }

  static multiplyMatrix(m, p) {
    return new Point(m.get([0, 0]) * p.x + m.get([0, 1]) * p.y, m.get([1, 0]) * p.x + m.get([1, 1]) * p.y);
  }
}

/**
 * 最底层的类，直接与 canvas 交互
 * @class
 * @abstract
 * @author Zhou Chenyu
 */
class Quark {
  /**
   * 变换矩阵
   * @type {math.Matrix}
   * @default math.identity(2)
   */
  transform = math.identity(2);

  /**
   * 位置向量
   * @type {Point}
   */
  position;

  /**
   * 混合模式
   * @type {string}
   * @default "source-over"
   */
  mixture = "source-over";

  /**
   * @param {Point} p - 坐标
   * @constructor
   */
  constructor(p) {
    this.transform = math.identity(2);
    this.position = p;
  }

  /**
   * 将此对象序列化
   * @returns {Object} - 被序列化后的 Quark 对象
   * @virtual
   */
  serialize() {
    throw Error("Error: not implemented");
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @static
   * @virtual
   * @returns {Quark}
   */
  static parse(quark) {
    throw Error("Error: not implemented");
  }
}

/**
 * 渲染多边形的 Quark
 * @class
 * @extends Quark
 * @author Zhou Chenyu
 */
class PolygonQuark extends Quark {
  /**
   * 多边形的外点集
   * @type {number[][]}
   */
  outerPoints = [];

  /**
   * @param {Point} p - 坐标
   * @constructor
   */
  constructor(p) {
    super(p);
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @param {string} quark.type - 类型 (应为 "PolygonQuark")
   * @param {Object} quark.position - 坐标
   * @param {number} quark.position.x - 横坐标
   * @param {number} quark.position.y - 纵坐标
   * @param {number[][]} quark.transform - 二维变换矩阵
   * @param {string} quark.mixture - 混合模式
   * @param {Object} quark.data - 数据
   * @param {Object} quark.data.solidPolygon - solidPolygon 数据
   * @param {number[][]} quark.data.solidPolygon.points - 外点数据 (应为二维数组的数组)
   * @static
   * @returns {PolygonQuark}
   * @example
   * const triangle = PolygonQuark.parse({
   *   type: "solidPolygon",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   mixture: "source-over",
   *   data: {
   *     solidPolygon: {
   *       points: [[0, 0], [100, 100], [0, 100]]
   *     }
   *   }
   * });
   * @throws {Error} 当传入的序列化的 Quark 对象不是一个多边形时
   */
  static parse(quark) {
    if (quark.type !== "solidPolygon") throw Error("Error: incorrect type");
    let q = new PolygonQuark(Point.parse(quark.position));
    q.transform = math.matrix(quark.transform);
    q.mixture = quark.mixture;
    q.outerPoints = quark.data.solidPolygon.points;
    return q;
  }

  /**
   * 将此对象序列化
   * @returns {{type: string, position: {x: number, y: number}, transform: number[][], mixture: string, data: {solidPolygon: {points: number[][]}}}} 被序列化后的 PolygonQuark 对象
   */
  serialize() {
    return {
      type: "solidPolygon",
      position: this.position.serialize(),
      transform: this.transform.toJSON().data,
      mixture: this.mixture,
      data: {
        solidPolygon: {
          points: this.outerPoints
        }
      }
    };
  }
}

/**
 * 渲染文字的 Quark
 * @class
 * @extends Quark
 * @author Zhou Chenyu
 */
class TextQuark extends Quark {
  /**
   * 文字
   * @type {string}
   * @default ""
   */
  text = "";

  /**
   * 字号
   * @type {number}
   * @default 24
   */
  size = 24;

  /**
   * 颜色
   * @type {string}
   * @default "#000000";
   */
  color = "#000000";

  /**
   * 字体
   * @type {string}
   * @default "Noto Sans CJK SC"
   */
  font = "Noto Sans CJK SC";

  /**
   * @param {Point} p - 坐标
   * @constructor
   */
  constructor(p) {
    super(p);
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @param {string} quark.type - 类型 (应为 "text")
   * @param {Object} quark.position - 坐标
   * @param {number} quark.position.x - 横坐标
   * @param {number} quark.position.y - 纵坐标
   * @param {number[2][2]} quark.transform - 二维变换矩阵
   * @param {string} quark.mixture - 混合模式
   * @param {Object} quark.data - 数据
   * @param {Object} quark.data.text - text 数据
   * @param {string} quark.data.text.text - 文字
   * @param {string} quark.data.text.font - 字体
   * @param {number} quark.data.text.size - 字号
   * @param {string} quark.data.text.color - 字色
   * @static
   * @returns {TextQuark}
   * @example
   * const exampleText = TextQuark.parse({
   *   type: "text",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   mixture: "source-over",
   *   data: {
   *     text: {
   *       text: "This is an example text.",
   *       font: "Noto Sans CJK SC",
   *       size: 24,
   *       color: "#000000"
   *     }
   *   }
   * });
   * @throws {Error} 当传入的序列化的 Quark 对象不是一个多边形时
   */
  static parse(quark) {
    if (quark.type !== "text") throw Error("Error: incorrect type");
    let q = new TextQuark(Point.parse(quark.position));
    q.transform = quark.transform;
    q.mixture = quark.mixture;
    q.text = quark.data.text.text;
    q.font = quark.data.text.font;
    q.size = quark.data.text.size;
    q.color = quark.data.text.color;
    return q;
  }

  /**
   * 将此对象序列化
   * @returns {{type: string, position: {x: number, y: number}, transform: number[][], mixture: string, data: {text: {text: string, font: string, size: number, color: string}}}} 被序列化后的 TextQuark 对象
   */
  serialize() {
    return {
      type: "text",
      position: this.position.serialize(),
      transform: this.transform.toJSON().data,
      mixture: this.mixture,
      data: {
        text: {
          text: this.text,
          font: this.font,
          size: this.size,
          color: this.color
        }
      }
    };
  }
}

/**
 * 渲染图片的 Quark
 * @class
 * @extends Quark
 * @author Zhou Chenyu
 */
class ImageQuark extends Quark {
  /**
   * 图片路径
   * @type {string}
   */
  src = "";

  /**
   * 图片宽度
   * @type {number}
   */
  width = 0;

  /**
   * 图片高度
   * @type {number}
   */
  height = 0;

  /**
   * @param {Point} p - 坐标
   * @constructor
   */
  constructor(p) {
    super(p);
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @param {string} quark.type - 类型 (应为 "img")
   * @param {Object} quark.position - 坐标
   * @param {number} quark.position.x - 横坐标
   * @param {number} quark.position.y - 纵坐标
   * @param {number[2][2]} quark.transform -
   * @param {string} quark.mixture - 混合模式
   * @param {Object} quark.data - 数据
   * @param {Object} quark.data.img - image 数据
   * @param {string} quark.data.img.src - 图像路径
   * @param {number} quark.data.img.width - 图像宽度
   * @param {number} quark.data.img.height - 图像高度
   * @static
   * @returns {ImageQuark}
   * @example
   * const archbtw = ImageQuark.parse({
   *   type: "img",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   mixture: "source-over",
   *   data: {
   *     img: {
   *       src: "/home/zhouc_yu/Pictures/Wallpapers/archbtw.png",
   *       width: 1920,
   *       height: 1200
   *     }
   *   }
   * });
   * @throws {Error} 当传入的序列化的 Quark 对象不是一个图片时
   */
  static parse(quark) {
    if (quark.type !== "img") throw Error("Error: incorrect type");
    let q = new ImageQuark(Point.parse(quark.position));
    q.transform = quark.transform;
    q.mixture = quark.mixture;
    q.src = quark.data.img.src;
    q.width = quark.data.img.width;
    q.height = quark.data.img.height;
    return q;
  }

  /**
   * 将此对象序列化
   * @returns {{type: string, position: {x: number, y: number}, transform: number[2][2], mixture: string, data: {img: {src: string, width: number, height: number}}}} 被序列化后的 ImageQuark 对象
   */
  serialize() {
    return {
      type: "img",
      position: this.position.serialize(),
      transform: this.transform.toJSON().data,
      mixture: this.mixture,
      data: {
        img: {
          src: this.src,
          width: this.width,
          height: this.height
        }
      }
    };
  }
}

/**
 * 所有对象的基类
 * @class
 * @abstract
 * @author Zhou Chenyu
 */
class BasicObject {
  /**
   * 位置
   * @type {Point}
   */
  position;

  /**
   * 变换矩阵
   * @type {math.Matrix}
   * @default math.identity(2)
   */
  transform = math.identity(2);

  /**
   * 对象的矩形范围
   * @type {math.Matrix}
   * @private
   */
  _rectangle;

  set rectangle(rect) {
    this._rectangle = rect;
    this._center =
      new Point((rect.get([0, 0]) + rect.get([1, 0])) / 2, (rect.get([0, 1]) + rect.get([1, 1])) / 2).applyTransform(math.inv(this.transform));
  }

  get rectangle() {
    return this._rectangle;
  }

  /**
   * 对象的凸包
   * @type {number[][]}
   */
  convexHull;

  /**
   * 在经矩阵变换前的几何中心
   * @private
   * @type {Point}
   */
  _center;

  /**
   * 对象的旋转中心
   * @private
   * @type {Point}
   */
  _rotateCenter;

  get rotateCenter() {
    if (this.isDirected) return this._rotateCenter;
    return this._center.applyTransform(math.inv(this.transform));
  }

  set rotateCenter(rotateCenter) {
    if (this._isDirected) this._rotateCenter = rotateCenter;
    else throw Error("Error: the object is not directed so that it's rotate center can not be moved");
  }

  /**
   * 是否是有向对象
   * @private
   * @type {boolean}
   * @default false
   */
  _isDirected = false;

  get isDirected() { return this._isDirected; }

  /**
   * 创建新对象
   * @constructor
   * @param {Point} p - 对象的初位置
   */
  constructor(p) {
    this.position = p;
  }

  /**
   * 应用变换矩阵
   * @param {math.Matrix} trans - 要应用的变换矩阵
   */
  applyTransform(trans) {
    this.transform = math.multiply(this.transform, trans);
  }

  /**
   * 获取该对象的 Quark
   * @returns {Quark}
   * @virtual
   */
  getQuarks() {
    throw new Error("Error: not implemented");
  }
}

/**
 * 零维对象基类
 * @class
 * @abstract
 * @author Zhou Chenyu
 */
class ZeroDimensionObject extends BasicObject {
}

/**
 * 一维对象基类
 * @class
 * @abstract
 * @author Zhou Chenyu
 */
class OneDimensionObject extends BasicObject {
  /**
   * 该一维对象的主轴是否是 x 轴
   * @type {boolean}
   * @private
   */
  _isMainAxisX = true;

  get isMainAxisX() { return this._isMainAxisX; }
}

/**
 * 二维对象基类
 * @class
 * @abstract
 * @author Zhou Chenyu
 */
class TwoDimensionObject extends BasicObject {
}

/**
 * 对象容器类
 * @class
 * @description
 * 对象容器是使一维对象和二维对象零维化的媒介。它将使所有被白板直接管理的对象是零维的，也使用户操作更为直观。
 *
 * 对象容器有以下几种模式:
 * - 普通模式:
 * - 拉伸模式:
 * - 窗口模式:
 *
 * 用户应通过“进入”来修改子对象的内容。
 * @author Zhou Chenyu
 */
class Container extends ZeroDimensionObject {
  /**
   * 容器中存的子对象
   * @type {OneDimensionObject|TwoDimensionObject}
   */
  child;

  /**
   *
   * @param {Point} p - 该容器的位置
   * @param {OneDimensionObject|TwoDimensionObject} child - 该容器的子对象
   */
  constructor(p, child) {
    super(p);
    this.child = child;
  }

  getQuarks() {
    return this.child.getQuarks();
  }
}

class LineObject extends ZeroDimensionObject {
}

class PenObject extends ZeroDimensionObject {
}

module.exports = {
  Point,
  Quark,
  PolygonQuark,
  TextQuark,
  ImageQuark,
  BasicObject,
  ZeroDimensionObject,
  OneDimensionObject,
  TwoDimensionObject,
  Container,
  LineObject,
  PenObject,
}
