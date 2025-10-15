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

module.exports = {
  generateRndInt,
  randomNumberPool,
}
