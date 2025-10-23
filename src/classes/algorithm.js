function generateRndInt(min, max) {
  return parseInt(Math.random() * (max - min + 1) + min, 10);
}

class randomNumberPool {
  /**
   * 
   * @param {number} min 随机数的最小值
   * @param {number} max 随机数的最大值
   */
  constructor(min, max) {
    this.min = min;
    this.max = max;
    this.pool = {};
  }

  /**
   * 用数组 arr 来初始化
   * @param {number[]} arr
   */
  initFromArray(arr) {
    for (let i = 0; i < arr.length; i++) {
      this.pool[arr[i]] = true;
    }
  }

  /**
   * 生成随机数
   * @returns {number} 生成的随机数
   */
  generate() {
    let num;
    do {
      num = generateRndInt(this.min, this.max);
    } while (this.pool[num]);
    this.pool[num] = true;
    return num;
  }

  /**
   * 从随机池中删除一数
   * @param {number} num
   * @returns 是否删除成功
   */
  remove(num) {
    if (this.pool[num]){
      delete this.pool[num];
      return true;
    }
    return false;
  }

  /**
   * 在池中重命名一数
   * @param {number} num 欲重命名的数
   * @returns 重命名后的数
   */
  rename(num) {
    let newNum = this.generate();
    this.remove(num);
    return newNum;
  }
}

/**
 * 获取二指操作的变换矩阵
 *
 * @todo TODO: 验证算法的正确性
 *
 * @param {number} x1 原始点一的横坐标
 * @param {number} y1 原始点一的纵坐标
 * @param {number} x2 原始点二的横坐标
 * @param {number} y2 原始点二的纵坐标
 * @param {number} x1q 变换后的点一的横坐标
 * @param {number} y1q 变换后的点一的纵坐标
 * @param {number} x2q 变换后的点二的横坐标
 * @param {number} y2q 变换后的点二的纵坐标
 * @returns {Object} a, b, c, d, dx, dy, 为 ctx.transform() 的参数
 */
function getDualFingerResult(x1, y1, x2, y2, x1q, y1q, x2q, y2q) {
  let a = (x1 - x2) * (x1q - x2q) + (y1 - y2) * (y1q - y2q); // a 的分子
  let b = (x1 - x2) * (x1  - x2 ) + (y1 - y2) * (y1  - y2 ); // 分母
  let c = (x1 - x2) * (y1q - y2q) - (y1 - y2) * (x1q - x2q); // c 的分子
  a /= b; // get a = a 的分子 / 分母
  c /= b; // get c = c 的分子 / 分母
  let d = a; // get d = a
  b = -c; // get b = -c
  let dx = x1q - a * x1 - b * y1;
  let dy = y1q - c * x1 - d * y1;
  return {
    "a": a,
    "b": b,
    "c": c,
    "d": d,
    "dx": dx,
    "dy": dy,
  }
}

/**
 * 获取三指操作的变换矩阵
 *
 * @todo TODO:
 *
 * @param {number} x1 原始点一的横坐标
 * @param {number} y1 原始点一的纵坐标
 * @param {number} x2 原始点二的横坐标
 * @param {number} y2 原始点二的纵坐标
 * @param {number} x3 原始点三的横坐标
 * @param {number} y3 原始点三的纵坐标
 * @param {number} x1q 变换后的点一的横坐标
 * @param {number} y1q 变换后的点一的纵坐标
 * @param {number} x2q 变换后的点二的横坐标
 * @param {number} y2q 变换后的点二的纵坐标
 * @param {number} x3q 变换后的点三的横坐标
 * @param {number} y3q 变换后的点三的纵坐标
 * @returns {Object} a, b, c, d, dx, dy, 为 ctx.transform() 的参数
 */
function getTriFingerResult(x1, y1, x2, y2, x3, y3, x1q, y1q, x2q, y2q, x3q, y3q) {
}

module.exports = {
  generateRndInt,
  getDualFingerResult,
  getTriFingerResult,
  randomNumberPool,
}
