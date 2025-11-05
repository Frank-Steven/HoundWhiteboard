/**
 * @file
 * @description
 */

const math = require("mathjs");

/**
 * 最底层的类，直接与 canvas 交互
 * @class
 * @abstract
 */
class Quark {
  /**
   * 变换矩阵
   */
  transform = math.identity(2);

  /**
   * 位置向量
   */
  position = math.matrix([[0], [0]]);

  /**
   * 混合模式
   * @default "source-over"
   */
  mixture = "source-over";

  /**
   * @param {number} x 横坐标
   * @param {number} y 纵坐标
   * @constructor
   */
  constructor(x, y) {
    this.transform = math.identity(2);
    this.position = math.matrix([[x], [y]]);
  }

  /**
   * 将此对象序列化
   * @returns {Object} - 被序列化后的 Quark 对象
   * @virtual
   */
  listize() {
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
 */
class PolygonQuark extends Quark {
  /**
   * 多边形的外点集
   */
  outerPoints = []

  /**
   * @param {number} x 横坐标
   * @param {number} y 纵坐标
   * @constructor
   */
  constructor(x, y) {
    super(x, y);
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @static
   * @returns {PolygonQuark}
   * @throws {Error} 当传入的序列化的 Quark 对象不是一个多边形时
   */
  static parse(quark) {
    if (quark.type !== "solidPolygon") throw Error("Error: incorrect type");
    let q = new PolygonQuark(quark.position.x, quark.position.y);
    q.transform = quark.transform;
    q.mixture = quark.mixture;
    q.outerPoints = quark.data.solidPolygon.points;
    return q;
  }

  listize() {
    return {
      type: "solidPolygon",
      position: {x: this.position.get([0, 0]), y: this.position.get([1, 0])},
      transform: this.transform,
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
 */
class TextQuark extends Quark {
  /**
   * 文字
   * @default ""
   */
  text = "";

  /**
   * 字号
   * @default 24
   */
  size = 24;

  /**
   * 颜色
   * @default "#000000";
   */
  color = "#000000";

  /**
   * 字体
   * @default "Noto Sans CJK SC"
   */
  font = "Noto Sans CJK SC";

  /**
   * @param {number} x 横坐标
   * @param {number} y 纵坐标
   * @constructor
   */
  constructor(x, y) {
    super(x, y);
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @static
   * @returns {TextQuark}
   * @throws {Error} 当传入的序列化的 Quark 对象不是一个多边形时
   */
  static parse(quark) {
    if (quark.type !== "text") throw Error("Error: incorrect type");
    let q = new TextQuark(quark.position.x, quark.position.y);
    q.transform = quark.transform;
    q.mixture = quark.mixture;
    q.text = quark.data.text.text;
    q.font = quark.data.text.font;
    q.size = quark.data.text.size;
    q.color = quark.data.text.color;
    return q;
  }

  listize() {
    return {
      type: "text",
      position: {x: this.position.get([0, 0]), y: this.position.get([1, 0])},
      transform: this.transform,
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
 */
class ImageQuark extends Quark {
  /**
   * 图片路径
   */
  src = "";

  /**
   * 图片宽度
   */
  width = 0;

  /**
   * 图片高度
   */
  height = 0;

  /**
   * @param {number} x 横坐标
   * @param {number} y 纵坐标
   * @constructor
   */
  constructor(x, y) {
    super(x, y);
  }

  /**
   * 将序列化的 Quark 转化为 Quark 对象
   * @param {Object} quark - 被序列化的 Quark 对象
   * @static
   * @returns {ImageQuark}
   * @throws {Error} 当传入的序列化的 Quark 对象不是一个图片时
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
   */
  static parse(quark) {
    if (quark.type !== "img") throw Error("Error: incorrect type");
    let q = new ImageQuark(quark.position.x, quark.position.y);
    q.transform = quark.transform;
    q.mixture = quark.mixture;
    q.src = quark.data.img.src;
    q.width = quark.data.img.width;
    q.height = quark.data.img.height;
    return q;
  }

  listize() {
    return {
      type: "img",
      position: {x: this.position.get([0, 0]), y: this.position.get([1, 0])},
      transform: this.transform,
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
 */
class BasicObject {
  /**
   * 变换矩阵
   * @type {math.Matrix}
   * @default math.identity(2)
   */
  transform = math.identity(2);

  /**
   * 创建新对象
   * @constructor
   * @param {number} x - 初始横坐标
   * @param {number} y - 初始纵坐标
   * @param {string} type 对象类型
   */
  constructor(x, y, type) {
    this.position = math.matrix([[x], [y]]);
    this.type = type;
  }

  /**
   * 应用变换矩阵
   * @param {math.Matrix} trans - 要应用的变换矩阵
   */
  applyTransform(trans) {
    this.transform = this.transform * trans;
  }
}

class LineObject extends BasicObject {}

class PenObject extends BasicObject {}

module.exports = {
  Quark,
  PolygonQuark,
  TextQuark,
  ImageQuark,
  BasicObject,
  LineObject,
  PenObject,
}
