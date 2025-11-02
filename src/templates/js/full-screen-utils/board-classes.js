/**
 * @file 定义白板操作核心对象的模块
 * @module board-classes
 * @description 包含不同白板对象的类:
 * - 基础对象类
 * - 墨迹对象(自由手绘)
 * - 图形对象(矢量图形)
 * - 实体对象(填充形状)
 * - 组合对象(分组元素)
 * - 页面类(管理对象集合)
 */

const { math, min } = require("mathjs");
const { randomNumberPool } = require("../../../classes/algorithm");

/**
 * 所有白板对象的基类，提供通用属性和方法
 * @class
 * @abstract
 * @property {math.matrix} transform - 对象的二维变换矩阵
 * @property {math.matrix} position - 对象的当前位置 [x, y]
 * @property {string} type - 对象类型 ('ink', 'graph', 'solid', 'combination')
 */
class object {
  /**
   * 默认二维变换矩阵 (单位矩阵)
   * @type {math.matrix}
   */
  transform = math.matrix([
    [1, 0],
    [0, 1]
  ]);

  /**
   * 创建新的白板对象
   * @constructor
   * @param {number} x - 初始 x 坐标
   * @param {number} y - 初始 y 坐标
   * @param {string} type - 对象类型
   * @throws {TypeError} 如果坐标不是数字
   */
  constructor(x, y, type) {
    this.position = math.matrix([x, y]);
    this.type = type;
  }

  /**
   * 对对象应用变换矩阵
   * @method
   * @param {math.matrix} transform - 要应用的二维变换矩阵
   * @returns {void}
   * @throws {TypeError} 当 transform 不是有效的二维矩阵
   * @example
   * const obj = new object(10, 20, 'graph');
   * const matrix = math.matrix([[1,0],[0,1]]);
   * obj.transformByMatrix(matrix);
   */
  transformByMatrix(transform) {
    this.transform = transform;
    for (let i = 0; i < this.innerPoints.length; i++) {
      this.innerPoints[i] = math.multiply(transform, this.innerPoints[i]);
    }
  }
}

/**
 * 墨迹类，表示自由手绘对象
 * @class
 * @extends object
 * @property {math.matrix[]} innerPoints - 相对于对象位置的点数组
 */
class ink extends object {
  /**
   * 相对于对象位置的内点数组
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * 向墨迹对象添加新点
   * @method
   * @param {number} x - 点的 x 坐标
   * @param {number} y - 点的 y 坐标
   * @returns {void}
   * @throws {TypeError} 当坐标不是数字
   * @example
   * const inkObj = new ink(0, 0, 'ink');
   * inkObj.addInnerPoint(10, 20);
   */
  addInnerPoint(x, y) {
    if (this.position == undefined) {
      super(x, y, "ink");
    }
    this.innerPoints.push(
      math.matrix([x - this.position[0], y - this.position[1]])
    );
  }

  /**
   * 从图形对象初始化墨迹对象
   * @method
   * @param {graph} obj - 用于初始化的源图形对象
   * @returns {void}
   * @throws {TypeError} 当 obj 不是有效的图形对象
   */
  initFromGraph(obj) {
    if (this.position == undefined) {
      super(obj.position[0], obj.position[1], "ink");
    }
    for (let i = 0; i < obj.innerPoints.length; i++) {
      this.innerPoints.push(
        math.multiply(obj.transform, obj.innerPoints[i])
      );
    }
  }
}

/**
 * 图形类，表示矢量图形对象
 * @class
 * @extends object
 * @property {math.matrix[]} innerPoints - 定义矢量形状的点数组
 */
class graph extends object {
  /**
   * 定义矢量形状的点数组
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * 向矢量图形添加新点
   * @method
   * @param {number} x - 点的 x 坐标
   * @param {number} y - 点的 y 坐标
   * @returns {void}
   * @throws {TypeError} 如果坐标不是数字
   * @example
   * const graphObj = new graph(0, 0, 'graph');
   * graphObj.addInnerPoint(10, 10);
   * graphObj.addInnerPoint(20, 20);
   */
  addInnerPoint(x, y) {
    if (this.position == undefined) {
      super(x, y, "graph");
    }
    this.innerPoints.push(
      math.matrix([x - this.position[0], y - this.position[1]])
    );
  }

  /**
   * 从墨迹对象初始化图形对象
   * @method
   * @param {ink} obj - 用于初始化的源墨迹对象
   * @returns {void}
   * @throws {TypeError} 当 obj 不是有效的墨迹对象
   */
  initFromInk(obj) {
    if (this.position == undefined) {
      super(obj.position[0], obj.position[1], "graph");
    }
    for (let i = 0; i < obj.innerPoints.length; i++) {
      this.innerPoints.push(
        math.multiply(obj.transform, obj.innerPoints[i])
      );
    }
  }
  
}

/**
 * 实体类，表示填充形状对象
 * @class
 * @extends object
 * @property {math.matrix[]} innerPoints - 定义形状边界的点数组
 */
class solid extends object {
  /**
   * 定义形状边界的点数组
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * 初始化矩形实体形状
   * @method
   * @param {number} x - 左上角 x 坐标
   * @param {number} y - 左上角 y 坐标
   * @param {number} width - 矩形宽度
   * @param {number} height - 矩形高度
   * @returns {void}
   * @throws {TypeError} 如果任何参数不是数字
   * @example
   * const rect = new solid(0, 0, 'solid');
   * rect.initRect(10, 10, 100, 50);
   */
  initRect(x, y, width, height) {
    if (this.position == undefined) {
      super(x, y, "solid");
    }
    this.innerPoints.push(
      math.matrix([x - this.position[0], y - this.position[1]])
    );
    this.innerPoints.push(
      math.matrix([x + width - this.position[0], y - this.position[1]])
    );
    this.innerPoints.push(
      math.matrix([x + width - this.position[0], y + height - this.position[1]])
    );
    this.innerPoints.push(
      math.matrix([x - this.position[0], y + height - this.position[1]])
    );
  }

  /**
   * 从图形对象初始化实体对象
   * @method
   * @param {graph} obj - 用于初始化的源图形对象
   * @returns {void}
   * @throws {TypeError} 当 obj 不是有效的图形对象
   */
  initFromGraph(obj) {
    if (this.position == undefined) {
      super(obj.position[0], obj.position[1], "solid");
    }
    for (let i = 0; i < obj.innerPoints.length; i++) {
      this.innerPoints.push(
        math.multiply(obj.transform, obj.innerPoints[i])
      );
    }
  }

  /**
   * 从墨迹对象初始化实体对象
   * @method
   * @param {ink} obj - 用于初始化的源墨迹对象
   * @returns {void}
   * @throws {TypeError} 当 obj 不是有效的墨迹对象
   */
  initFromInk(obj) {
    if (this.position == undefined) {
      super(obj.position[0], obj.position[1], "solid");
    }
    for (let i = 0; i < obj.innerPoints.length; i++) {
      this.innerPoints.push(
        math.multiply(obj.transform, obj.innerPoints[i])
      );
    }
  }
  
}

/**
 * 组合类，表示分组的白板对象
 * @class
 * @extends object
 * @property {object[]} children - 此组合中的子对象数组
 * @property {math.matrix[]} innerPoints - 表示子对象位置的点数组
 */
class combination extends object {
  /**
   * 此组合中的子对象数组
   * @type {object[]}
   */
  children = [];

  /**
   * 表示子对象位置的点数组
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * 创建新的白板对象组合
   * @constructor
   * @param {object[]} children - 要组合的白板对象数组
   * @throws {TypeError} 当 children 不是有效的白板对象数组
   * @example
   * const circle = new graph(10, 10, 'graph');
   * const square = new solid(20, 20, 'solid');
   * const combo = new combination([circle, square]);
   */
  constructor(children) {
    children.forEach(element => {
      this.x = min(this.x, element.x);
      this.y = min(this.y, element.y);
    });
    super(this.x, this.y, "combination");
    children.forEach(element => {
      element.x -= this.x;
      element.y -= this.y;
      this.children.push(element);
      this.innerPoints.push(math.matrix([element.x, element.y]));
    });
  }
  
}


/**
 * 页面类，表示白板对象的集合
 * @class
 * @property {randomNumberPool} idPool - 对象 ID 生成器
 * @property {object[]} objects - 此页面上的对象数组
 */
class page {
  /**
   * 对象 ID 生成器
   * @type {randomNumberPool}
   */
  idPool = new randomNumberPool(1, 1000000000000);

  /**
   * 此页面上的对象数组
   * @type {object[]}
   */
  objects = [];

  /**
   * 向页面添加对象
   * @method
   * @param {object} obj - 要添加的白板对象
   * @returns {void}
   * @throws {TypeError} 当 obj 不是有效的白板对象
   */
  appendObject(obj) {
    this.objects.push(obj);
  }

  /**
   * 从页面移除对象
   * @method
   * @param {object} obj - 要移除的白板对象
   * @returns {void}
   * @throws {Error} 当页面上没有这个对象
   */
  rmObject(obj) {
    const index = this.objects.indexOf(obj);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
  }
}

