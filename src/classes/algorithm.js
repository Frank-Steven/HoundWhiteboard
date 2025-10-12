class randomNumberPool {
  pool = {};
  constructor(min, max) {
    this.min = min;
    this.max = max;
  }

  // @param {Array} arr - An array of numbers to initialize the pool with.
  initFromArray(arr) {
    arr.foreach(t => {
      this.pool[t] = true;
    });
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