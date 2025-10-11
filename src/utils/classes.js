const fs = require("fs");

class directory {
  address = "";
  name = "";
  getPath() {
    return path.join(this.address, this.name);
  }
}

class file {
  address = "";
  name = "";
  extension = "";
  getPath() {
    return path.join(this.address, this.name + "." + this.extension);
  }
}

class randomNumberPool {
  pool = {};
  constructor(min, max) {
    this.min = min;
    this.max = max;
  }

  initFromArray(arr) {
    arr.foreach(t => {
      this.pool[t] = true;
    });
  }
  
  generate() {
    let num;
    do {
      num = random.randomInt(this.min, this.max);
    } while (pool[num]);
    this.pool[num] = true;
    return num;
  }

  remove(num) {
    delete this.pool[num];
    return true;
  }
}

class fileNameRandomPool {
  
}

class fsplus {
  // 创建目录
  // directory dir: 要创建的目录
  mkdir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  directory,
  file,
  randomNumberPool
}