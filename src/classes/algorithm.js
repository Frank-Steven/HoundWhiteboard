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
 * @param {number} x1 原始点一的横坐标
 * @param {number} y1 原始点一的纵坐标
 * @param {number} x2 原始点二的横坐标
 * @param {number} y2 原始点二的纵坐标
 * @param {number} x1q 变换后的点一的横坐标
 * @param {number} y1q 变换后的点一的纵坐标
 * @param {number} x2q 变换后的点二的横坐标
 * @param {number} y2q 变换后的点二的纵坐标
 * @param {number} aq 原矩阵的 a
 * @param {number} bq 原矩阵的 b
 * @param {number} cq 原矩阵的 c
 * @param {number} dq 原矩阵的 d
 * @returns {Object} a, b, c, d, e, f, 为 ctx.transform() 的参数
 */
function getDualFingerResult(x1, y1, x2, y2, x1q, y1q, x2q, y2q, aq, bq, cq, dq) {
  let a = (x1 - x2) * (x1q - x2q) + (y1 - y2) * (y1q - y2q); // a 的分子
  let b = (x1 - x2) * (x1  - x2 ) + (y1 - y2) * (y1  - y2 ); // 分母
  let c = (x1 - x2) * (y1q - y2q) - (y1 - y2) * (x1q - x2q); // c 的分子
  a /= b; // get a = a 的分子 / 分母
  c /= b; // get c = c 的分子 / 分母
  let d = a; // get d = a
  b = -c; // get b = -c
  let dx = x1q - a * x1 - b * y1;
  let dy = y1q - c * x1 - d * y1;
  let e = (dq * dx - bq * dy) / (dq * aq - bq * cq);
  let f = (cq * dx - aq * dy) / (cq * bq - aq * dq);
  return {
    "a": a,
    "b": b,
    "c": c,
    "d": d,
    "e": e,
    "f": f,
  };
}

/**
 * 获取三指操作的变换矩阵
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
 * @param {number} aq 原矩阵的 a
 * @param {number} bq 原矩阵的 b
 * @param {number} cq 原矩阵的 c
 * @param {number} dq 原矩阵的 d
 * @returns {Object} a, b, c, d, e, f, 为 ctx.transform() 的参数
 */
function getTriFingerResult(x1, y1, x2, y2, x3, y3, x1q, y1q, x2q, y2q, x3q, y3q, aq, bq) {
  let delta = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
  let a = (x1q * (y2 - y3) + x2q * (y3 - y1) + x3q * (y1 - y2));
  let b = (x1q * (x2 - x3) + x2q * (x3 - x1) + x3q * (x1 - x2));
  let c = (y1q * (y2 - y3) + y2q * (y3 - y1) + y3q * (y1 - y2));
  let d = (y1q * (x2 - x3) + y2q * (x3 - x1) + y3q * (x1 - x2));
  a /= delta;
  b /= delta;
  c /= delta;
  d /= -delta
  let dx = x1q - a * x1 - b * y1;
  let dy = y1q - c * x1 - d * y1;
  let e = (dq * dx - bq * dy) / (dq * aq - bq * cq);
  let f = (cq * dx - aq * dy) / (cq * bq - aq * dq);
  return {
    "a": a,
    "b": b,
    "c": c,
    "d": d,
    "e": e,
    "f": f,
  };
}

module.exports = {
  generateRndInt,
  getDualFingerResult,
  getTriFingerResult,
  randomNumberPool,
}
