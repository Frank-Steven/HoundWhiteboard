/**
 * @file
 * @description
 */

const math = require("mathjs");

/**
 * 所有对象的基类
 * @class
 * @abstract
 */
class BoardObject {
  /**
   * 变换矩阵
   * @type {math.matrix}
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
    this.potition = math.matrix([[x], [y]]);
    this.type = type;
  }

  /**
   * 应用变换矩阵
   * @param {math.matrix} trans - 要应用的变换矩阵
   */
  applyTransform(trans) {
    this.transform = this.transform * trans;
  }
}

class LineObject extends BoardObject {}

class PenObject extends BoardObject {}

module.exports = {
  BoardObject,
  LineObject,
  PenObject,
}
