/**
 * @file 白板对象定义
 * @description
 * 定义白板系统中使用的所有对象类型，包括:
 * - Quark（渲染单元）
 * - 各种维度的对象
 * 注: typescript 文件的导入应该从 dist 里导入
 * @author Zhou Chenyu
 */

import * as math from "mathjs";
import { Point, Range, CircleRange } from "./basic-classes";

/**
 * Quark 抽象基类 - 最底层的渲染单元
 * @abstract
 * @class
 * @description 直接与 canvas 交互的最底层类，所有可渲染对象的基类
 * @author Zhou Chenyu
 */
abstract class Quark {
  /**
   * 变换矩阵
   * @type {math.Matrix}
   * @default math.identity(2)
   * @description 用于对象的几何变换（旋转、缩放等）
   */
  transform: math.Matrix = math.identity(2) as math.Matrix;

  /**
   * 位置向量
   * @type {Point}
   * @description 对象在画布上的位置
   */
  position: Point;

  /**
   * 混合模式
   * @type {string}
   * @default "source-over"
   * @description Canvas 2D 上下文的 globalCompositeOperation 属性值
   * @see https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
   */
  mixture: string = "source-over";

  /**
   * 创建一个新的 Quark 实例
   * @param {Point} p - 对象的初始位置坐标
   * @constructor
   */
  constructor(p: Point) {
    this.transform = math.identity(2) as math.Matrix;
    this.position = p;
  }

  /**
   * 将此对象序列化为普通 JSON 对象
   * @abstract
   * @returns {object} 序列化后的对象
   * @description 子类必须实现此方法以支持对象的持久化
   */
  abstract serialize(): object;

  /**
   * 将序列化的对象转化为 Quark 实例
   * @param {object} quark - 被序列化的 Quark 对象
   * @returns {Quark} Quark 实例
   * @static
   * @abstract
   * @throws {Error} 基类未实现此方法
   * @description 子类应该重写此方法以支持反序列化
   */
    static parse(quark: object): Quark {
    throw Error("Method not implemented.");
  }
}

/**
 * PolygonQuark 序列化数据接口
 * @interface
 * @description 定义多边形 Quark 序列化后的数据结构
 */
interface PolygonQuarkData {
  /** 类型标识，应为 "solidPolygon" */
  type: string;
  /** 位置坐标 */
  position: { x: number; y: number };
  /** 2x2 变换矩阵 */
  transform: number[][];
  /** 混合模式 */
  mixture: string;
  /** 多边形数据 */
  data: {
    solidPolygon: {
      /** 多边形的顶点坐标数组 */
      points: number[][];
    };
  };
}

/**
 * 多边形渲染 Quark
 * @class
 * @extends Quark
 * @description 用于渲染实心多边形的 Quark 类
 * @author Zhou Chenyu
 */
class PolygonQuark extends Quark {
  /**
   * 多边形的外点集
   * @type {number[][]}
   * @description 多边形顶点的坐标数组，每个元素为 [x, y] 格式
   */
  outerPoints: number[][] = [];

  /**
   * 创建一个新的多边形 Quark
   * @param {Point} p - 多边形的位置坐标
   * @constructor
   */
  constructor(p: Point) {
    super(p);
  }

  /**
   * 将序列化的对象转化为 PolygonQuark 实例
   * @param {PolygonQuarkData} quark - 被序列化的 PolygonQuark 对象
   * @returns {PolygonQuark} PolygonQuark 实例
   * @static
   * @throws {Error} 当 type 不是 "solidPolygon" 时抛出错误
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
   */
  static parse(quark: PolygonQuarkData): PolygonQuark {
    if (quark.type !== "solidPolygon") throw Error("Error: incorrect type");
    const q = new PolygonQuark(Point.parse(quark.position));
    q.transform = math.matrix(quark.transform);
    q.mixture = quark.mixture;
    q.outerPoints = quark.data.solidPolygon.points;
    return q;
  }

  /**
   * 将此对象序列化为普通 JSON 对象
   * @returns {PolygonQuarkData} 序列化后的对象
   * @description 将多边形 Quark 转换为可 JSON 序列化的格式
   */
  serialize(): PolygonQuarkData {
    return {
      type: "solidPolygon",
      position: this.position.serialize(),
      transform: this.transform.toJSON().data as number[][],
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
 * TextQuark 序列化数据接口
 * @interface
 * @description 定义文本 Quark 序列化后的数据结构
 */
interface TextQuarkData {
  /** 类型标识，应为 "text" */
  type: string;
  /** 位置坐标 */
  position: { x: number; y: number };
  /** 2x2 变换矩阵 */
  transform: number[][];
  /** 混合模式 */
  mixture: string;
  /** 文本数据 */
  data: {
    text: {
      /** 文本内容 */
      text: string;
      /** 字体名称 */
      font: string;
      /** 字号大小 */
      size: number;
      /** 文本颜色 */
      color: string;
    };
  };
}

/**
 * 文本渲染 Quark
 * @class
 * @extends Quark
 * @description 用于在画布上渲染文本的 Quark 类
 * @author Zhou Chenyu
 */
class TextQuark extends Quark {
  /**
   * 文本内容
   * @type {string}
   */
  text: string;

  /**
   * 字号大小
   * @type {number}
   */
  size: number;

  /**
   * 文本颜色
   * @type {string}
   * @description 支持任何有效的 CSS 颜色值
   */
  color: string;

  /**
   * 字体名称
   * @type {string}
   */
  font: string;

  /**
   * 创建一个新的文本 Quark
   * @param {Point} p - 文本的位置坐标
   * @constructor
   */
  constructor(p: Point, text: string, size: number, color: string, font: string) {
    super(p);
    this.text = text;
    this.size = size;
    this.color = color;
    this.font = font;
  }

  /**
   * 将序列化的对象转化为 TextQuark 实例
   * @param {TextQuarkData} quark - 被序列化的 TextQuark 对象
   * @returns {TextQuark} TextQuark 实例
   * @static
   * @throws {Error} 当 type 不是 "text" 时抛出错误
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
   */
  static parse(quark: TextQuarkData): TextQuark {
    if (quark.type !== "text") throw Error("Error: incorrect type");
    const q = new TextQuark(
      Point.parse(quark.position),
      quark.data.text.text,
      quark.data.text.size,
      quark.data.text.color,
      quark.data.text.font);
    q.transform = math.matrix(quark.transform);
    q.mixture = quark.mixture;
    return q;
  }

  /**
   * 将此对象序列化为普通 JSON 对象
   * @returns {TextQuarkData} 序列化后的对象
   * @description 将文本 Quark 转换为可 JSON 序列化的格式
   */
  serialize(): TextQuarkData {
    return {
      type: "text",
      position: this.position.serialize(),
      transform: this.transform.toJSON().data as number[][],
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
 * ImageQuark 序列化数据接口
 * @interface
 * @description 定义图片 Quark 序列化后的数据结构
 */
interface ImageQuarkData {
  /** 类型标识，应为 "img" */
  type: string;
  /** 位置坐标 */
  position: { x: number; y: number };
  /** 2x2 变换矩阵 */
  transform: number[][];
  /** 混合模式 */
  mixture: string;
  /** 图片数据 */
  data: {
    img: {
      /** 图片文件路径或 URL */
      src: string;
      /** 图片宽度（像素） */
      width: number;
      /** 图片高度（像素） */
      height: number;
    };
  };
}

/**
 * 图片渲染 Quark
 * @class
 * @extends Quark
 * @description 用于在画布上渲染图片的 Quark 类
 * @author Zhou Chenyu
 */
class ImageQuark extends Quark {
  /**
   * 图片文件路径或 URL
   * @type {string}
   */
  src: string;

  /**
   * 图片宽度（像素）
   * @type {number}
   */
  width: number;

  /**
   * 图片高度（像素）
   * @type {number}
   */
  height: number;

  /**
   * 创建一个新的图片 Quark
   * @param {Point} p - 图片的位置坐标
   * @constructor
   */
  constructor(p: Point, src: string, width: number, height: number){
    super(p);
    this.src = src;
    this.width = width;
    this.height = height;
  }

  /**
   * 将序列化的对象转化为 ImageQuark 实例
   * @param {ImageQuarkData} quark - 被序列化的 ImageQuark 对象
   * @returns {ImageQuark} ImageQuark 实例
   * @static
   * @throws {Error} 当 type 不是 "img" 时抛出错误
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
  static parse(quark: ImageQuarkData): ImageQuark {
    if (quark.type !== "img") throw Error("Error: incorrect type");
    const q = new ImageQuark(
      Point.parse(quark.position),
      quark.data.img.src,
      quark.data.img.width,
      quark.data.img.height);
    q.transform = math.matrix(quark.transform);
    q.mixture = quark.mixture;
    return q;
  }

  /**
   * 将此对象序列化为普通 JSON 对象
   * @returns {ImageQuarkData} 序列化后的对象
   * @description 将图片 Quark 转换为可 JSON 序列化的格式
   */
  serialize(): ImageQuarkData {
    return {
      type: "img",
      position: this.position.serialize(),
      transform: this.transform.toJSON().data as number[][],
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
 * 所有白板对象的抽象基类
 * @abstract
 * @class
 * @description 定义了所有白板对象的通用属性和方法，包括位置、变换、边界等
 * @author Zhou Chenyu
 */
abstract class BasicObject {
  /**
   * 对象的位置
   * @type {Point}
   * @description 对象在画布上的位置坐标
   */
  position: Point;

  /**
   * 变换矩阵
   * @type {math.Matrix}
   * @default math.identity(2)
   * @description 用于对象的几何变换（旋转、缩放等）
   */
  transform: math.Matrix = math.identity(2) as math.Matrix;

  /**
   * 对象的矩形边界范围
   * @private
   * @type {math.Matrix}
   * @description 存储对象的边界矩形，用于碰撞检测和选择
   */
  private _rectangle!: math.Matrix;

  /**
   * 设置对象的矩形边界范围
   * @param {math.Matrix} rect - 矩形边界矩阵
   * @description 设置边界时会自动计算几何中心
   */
  set rectangle(rect: math.Matrix) {
    this._rectangle = rect;
    this._center = new Point(
      (rect.get([0, 0]) + rect.get([1, 0])) / 2,
      (rect.get([0, 1]) + rect.get([1, 1])) / 2
    ).applyTransform(math.inv(this.transform) as math.Matrix);
  }

  /**
   * 获取对象的矩形边界范围
   * @returns {math.Matrix} 矩形边界矩阵
   */
  get rectangle(): math.Matrix {
    return this._rectangle;
  }

  /**
   * 对象的凸包
   * @type {number[][]}
   * @description 用于更精确的碰撞检测，存储凸包的顶点坐标
   */
  convexHull!: number[][];

  /**
   * 对象在变换前的几何中心
   * @private
   * @type {Point}
   * @description 存储对象的原始几何中心点
   */
  private _center!: Point;

  /**
   * 对象的旋转中心点
   * @private
   * @type {Point}
   * @description 对象旋转时的中心点，仅对有向对象有效
   */
  private _rotateCenter!: Point;

  /**
   * 获取对象的旋转中心
   * @returns {Point} 旋转中心点
   * @description 对于有向对象返回自定义旋转中心，否则返回几何中心
   */
  get rotateCenter(): Point {
    if (this.isDirected) return this._rotateCenter;
    return this._center.applyTransform(math.inv(this.transform) as math.Matrix);
  }

  /**
   * 设置对象的旋转中心
   * @param {Point} rotateCenter - 新的旋转中心点
   * @throws {Error} 当对象不是有向对象时抛出错误
   */
  set rotateCenter(rotateCenter: Point) {
    if (this._isDirected) this._rotateCenter = rotateCenter;
    else throw Error("Error: the object is not directed so that it's rotate center can not be moved");
  }

  /**
   * 标识对象是否是有向对象
   * @private
   * @type {boolean}
   * @default false
   * @description 有向对象可以自定义旋转中心
   */
  private _isDirected: boolean = false;

  /**
   * 获取对象是否是有向对象
   * @returns {boolean} 是否是有向对象
   */
  get isDirected(): boolean {
    return this._isDirected;
  }

  /**
   * 创建一个新的基础对象
   * @param {Point} p - 对象的初始位置
   * @constructor
   */
  constructor(p: Point) {
    this.position = p;
  }

  /**
   * 应用变换矩阵到对象
   * @param {math.Matrix} trans - 要应用的变换矩阵
   * @description 将变换矩阵与当前变换矩阵相乘
   */
  applyTransform(trans: math.Matrix): void {
    this.transform = math.multiply(this.transform, trans) as math.Matrix;
  }

  /**
   * 获取该对象的渲染 Quark
   * @abstract
   * @returns {Quark | Quark[]} 单个或多个 Quark 对象
   * @description 子类必须实现此方法以返回用于渲染的 Quark
   */
  abstract getQuarks(): Quark | Quark[];
}

/**
 * 可擦对象接口
 * @interface
 * @author Zhou Chenyu
 */
interface IEreasable {
  /**
   * @param {Range} range - 欲擦除的范围
   * @returns {boolean} 是否成功擦除
   */
  erase(range :Range): boolean;
}

/**
 * 零维对象抽象基类
 * @abstract
 * @class
 * @extends BasicObject
 * @description 表示零维对象，对象自身没有长度和宽度
 * @author Zhou Chenyu
 */
abstract class ZeroDimensionObject extends BasicObject { }

/**
 * 一维对象抽象基类
 * @abstract
 * @class
 * @extends BasicObject
 * @description 表示一维对象，对象自身只有长度没有宽度 (或只有长度没有宽度)
 * @author Zhou Chenyu
 */
abstract class OneDimensionObject extends BasicObject {
  /**
   * 标识该一维对象的主轴是否是 x 轴
   * @private
   * @type {boolean}
   * @default true
   * @description true 表示主轴是 x 轴（水平），false 表示主轴是 y 轴（垂直）
   */
  private _isMainAxisX: boolean = true;

  /**
   * 获取该一维对象的主轴是否是 x 轴
   * @returns {boolean} 主轴是否是 x 轴
   */
  get isMainAxisX(): boolean {
    return this._isMainAxisX;
  }
}

/**
 * 二维对象抽象基类
 * @abstract
 * @class
 * @extends BasicObject
 * @description 表示二维对象，自身有长度和宽度
 * @author Zhou Chenyu
 */
abstract class TwoDimensionObject extends BasicObject { }

/**
 * 对象容器类
 * @class
 * @extends ZeroDimensionObject
 * @description
 * 对象容器是使一维对象和二维对象零维化的媒介。它将使所有被白板直接管理的对象是零维的，也使用户操作更为直观。
 *
 * 对象容器有以下几种模式:
 * - 普通模式: 容器直接显示内部对象，可以认为这个容器不存在
 * - 拉伸模式: 内部对象以拉伸的方式填充容器，此模式与其它模式不一样的是，操纵杆可以直接调整其变换矩阵
 * - 窗口模式: 对二维对象，其表现与普通模式相同；对一维对象，若其非主轴被缩得过分小会被裁切
 * - 收缩模式: 不改变内部对象宽高比，而是将其收缩以适应容器
 *
 * 用户通过“进入”容器来修改内部对象的内容 (不是更改对象！)。
 * @author Zhou Chenyu
 */
class Container extends ZeroDimensionObject {
  /**
   * 容器中存储的内部对象
   * @type {OneDimensionObject | TwoDimensionObject}
   * @description 只能是一维对象或二维对象
   */
  child: OneDimensionObject | TwoDimensionObject;

  /**
   * 创建一个新的容器对象
   * @param {Point} p - 容器的位置
   * @param {OneDimensionObject | TwoDimensionObject} child - 容器的子对象
   * @constructor
   */
  constructor(p: Point, child: OneDimensionObject | TwoDimensionObject) {
    super(p);
    this.child = child;
  }

  /**
   * 获取容器的渲染 Quark
   * @returns {Quark | Quark[]} 子对象的 Quark
   * @description 容器本身不渲染，而是返回子对象的 Quark
   */
  getQuarks(): Quark | Quark[] {
    return this.child.getQuarks();
  }
}

/**
 * 线条对象类
 * @class
 * @extends ZeroDimensionObject
 * @description 表示白板上的线条对象
 * @author Zhou Chenyu
 */
class LineObject extends ZeroDimensionObject {
  /**
   * 获取线条对象的渲染 Quark
   * @returns {Quark | Quark[]} 渲染 Quark
   * @throws {Error} 方法未实现
   */
  getQuarks(): Quark | Quark[] {
    throw new Error("Method not implemented.");
  }
}

/**
 * 画笔对象类
 * @class
 * @extends ZeroDimensionObject
 * @description 表示白板上的自由绘制笔迹对象
 * @author Zhou Chenyu
 */
class PenObject extends ZeroDimensionObject {
  /**
   * 获取画笔对象的渲染 Quark
   * @returns {Quark | Quark[]} 渲染 Quark
   * @throws {Error} 方法未实现
   */
  getQuarks(): Quark | Quark[] {
    throw new Error("Method not implemented.");
  }
}

export {
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
};

export type {
  IEreasable,
};
