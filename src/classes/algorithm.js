function generateRndInt(min, max) {
  return parseInt(Math.random() * (max - min + 1) + min, 10);
}

class randomNumberPool {
  constructor(min, max) {
    this.min = min;
    this.max = max;
    this.pool = {};
  }

  // 用数组 arr 来初始化
  // @param {Array<number>} arr: 用以初始化 randomNumberPool 的数字数组
  initFromArray(arr) {
    for (let i = 0; i < arr.length; i++) {
      this.pool[arr[i]] = true;
    }
  }

  // 生成一个随机数
  // @retrun {number}
  generate() {
    let num;
    do {
      num = generateRndInt(this.min, this.max);
    } while (this.pool[num]);
    this.pool[num] = true;
    return num;
  }

  // @param {number} num - The number to remove from the pool.
  // @return {boolean}
  remove(num) {
    if(this.pool[num]){
      delete this.pool[num];
      return true;
    }
    return false;
  }
}

module.exports = {
  generateRndInt,
  randomNumberPool,
}
