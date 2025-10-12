class randomNumberPool {
  pool = {};
  constructor(min, max) {
    this.min = min;
    this.max = max;
  }

  // @param {Array<number>} arr: 用以初始化 randomNumberPool 的数字数组
  initFromArray(arr) {
    for (let i = 0; i < arr.length; i++) {
      this.pool[arr[i]] = true;
    }
  }

  // @retrun {number}
  generate() {
    let num;
    do {
      num = random.randomInt(this.min, this.max);
    } while (pool[num]);
    this.pool[num] = true;
    return num;
  }

  // @param {number} num - The number to remove from the pool.
  // @return {boolean}
  remove(num) {
    delete this.pool[num];
    return true;
  }
}

module.exports = {
  randomNumberPool,
}
