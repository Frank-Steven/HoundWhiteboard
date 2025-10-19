const { math, min } = require("mathjs");
const { randomNumberPool } = require("../../../classes/algorithm");

/**
 * ink类
 * graph类
 * solid类
 * combination类
 */

/**
 * 对象类
 */
class object {
  transform = math.matrix([
    [1, 0],
    [0, 1],
  ]);

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} type
   */
  constructor(x, y, type) {
    this.position = math.matrix([x, y]);
    this.type = type;
  }

  /**
   * 根据点变换矩阵变换对象
   * @param {math.matrix} transform
   */
  transformByMatrix(transform) {
    this.transform = transform;
    for (let i = 0; i < this.innerPoints.length; i++) {
      this.innerPoints[i] = math.multiply(transform, this.innerPoints[i]);
    }
  }
}

class ink extends object {
  innerPoints = [];
  /**
   * 添加内部点
   * @param {number} x
   * @param {number} y
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
   * 从 graph 初始化 ink
   * @param {graph} obj
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

class graph extends object {
  innerPoints = [];
  /**
   * 添加内部点
   * @param {number} x
   * @param {number} y
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
   * 从 ink 初始化 graph
   * @param {ink} obj
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

class solid extends object {
  innerPoints = [];
  /**
   * 初始化矩形 solid
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
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
   * 从 graph 初始化 solid
   * @param {graph} obj
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
   * 从 ink 初始化 solid
   * @param {ink} obj
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

class combination extends object {
  children = [];
  innerPoints = [];
  /**
   * 初始化组合对象
   * @param {object} children 
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


// 页类
class page {
  idPool = new randomNumberPool(1, 1000000000000);
  objects = [];
  appendObject(obj) {
    this.objects.push(obj);
  }
  rmObject(objId) {
    const index = this.objects.indexOf(obj);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
  }
}
