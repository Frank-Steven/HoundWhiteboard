/**
 * @file Board classes module defining core objects for board manipulation
 * @module BoardClasses
 * @description Contains classes for different board objects:
 * - Base object class
 * - Ink objects (freehand drawing)
 * - Graph objects (vector graphics) 
 * - Solid objects (filled shapes)
 * - Combination objects (grouped elements)
 * - Page class (manages collections of objects)
 */

const { math, min } = require("mathjs");
const { randomNumberPool } = require("../../../classes/algorithm");

/**
 * Base class for all board objects providing common properties and methods
 * @class
 * @abstract
 * @property {math.matrix} transform - 2D transformation matrix for the object
 * @property {math.matrix} position - Current position of the object [x,y]
 * @property {string} type - Type of the object ('ink', 'graph', 'solid', 'combination')
 */
class object {
  /**
   * Default 2D transformation matrix (identity matrix)
   * @type {math.matrix}
   */
  transform = math.matrix([
    [1, 0],
    [0, 1]
  ]);

  /**
   * Creates a new board object
   * @constructor
   * @param {number} x - Initial x coordinate
   * @param {number} y - Initial y coordinate
   * @param {string} type - Type of the object
   * @throws {TypeError} If coordinates are not numbers
   */
  constructor(x, y, type) {
    this.position = math.matrix([x, y]);
    this.type = type;
  }

  /**
   * Applies transformation matrix to the object
   * @method
   * @param {math.matrix} transform - 2D transformation matrix to apply
   * @returns {void}
   * @throws {TypeError} If transform is not a valid 2D matrix
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
 * Ink class representing freehand drawing objects
 * @class
 * @extends object
 * @property {math.matrix[]} innerPoints - Array of points relative to object position
 */
class ink extends object {
  /**
   * Array of inner points relative to object position
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * Adds a new point to the ink object
   * @method
   * @param {number} x - X coordinate of the point
   * @param {number} y - Y coordinate of the point
   * @returns {void}
   * @throws {TypeError} If coordinates are not numbers
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
   * Initializes ink object from a graph object
   * @method
   * @param {graph} obj - Source graph object to initialize from
   * @returns {void}
   * @throws {TypeError} If obj is not a valid graph object
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
 * Graph class representing vector graphic objects
 * @class
 * @extends object
 * @property {math.matrix[]} innerPoints - Array of points defining the vector shape
 */
class graph extends object {
  /**
   * Array of points defining the vector shape
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * Adds a new point to the vector graphic
   * @method
   * @param {number} x - X coordinate of the point
   * @param {number} y - Y coordinate of the point
   * @returns {void}
   * @throws {TypeError} If coordinates are not numbers
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
   * Initializes graph object from an ink object
   * @method
   * @param {ink} obj - Source ink object to initialize from
   * @returns {void}
   * @throws {TypeError} If obj is not a valid ink object
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
 * Solid class representing filled shape objects
 * @class
 * @extends object
 * @property {math.matrix[]} innerPoints - Array of points defining the shape boundaries
 */
class solid extends object {
  /**
   * Array of points defining the shape boundaries
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * Initializes a rectangular solid shape
   * @method
   * @param {number} x - Top-left x coordinate
   * @param {number} y - Top-left y coordinate
   * @param {number} width - Width of the rectangle
   * @param {number} height - Height of the rectangle
   * @returns {void}
   * @throws {TypeError} If any parameter is not a number
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
   * Initializes solid object from a graph object
   * @method
   * @param {graph} obj - Source graph object to initialize from
   * @returns {void}
   * @throws {TypeError} If obj is not a valid graph object
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
   * Initializes solid object from an ink object
   * @method
   * @param {ink} obj - Source ink object to initialize from
   * @returns {void}
   * @throws {TypeError} If obj is not a valid ink object
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
 * Combination class representing grouped board objects
 * @class
 * @extends object
 * @property {object[]} children - Array of child objects in this combination
 * @property {math.matrix[]} innerPoints - Array of points representing child positions
 */
class combination extends object {
  /**
   * Array of child objects in this combination
   * @type {object[]}
   */
  children = [];

  /**
   * Array of points representing child positions
   * @type {math.matrix[]}
   */
  innerPoints = [];

  /**
   * Creates a new combination of board objects
   * @constructor
   * @param {object[]} children - Array of board objects to combine
   * @throws {TypeError} If children is not an array of valid board objects
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
 * Page class representing a collection of board objects
 * @class
 * @property {randomNumberPool} idPool - ID generator for objects
 * @property {object[]} objects - Array of objects on this page
 */
class page {
  /**
   * ID generator for objects
   * @type {randomNumberPool}
   */
  idPool = new randomNumberPool(1, 1000000000000);

  /**
   * Array of objects on this page
   * @type {object[]}
   */
  objects = [];

  /**
   * Adds an object to the page
   * @method
   * @param {object} obj - Board object to add
   * @returns {void}
   * @throws {TypeError} If obj is not a valid board object
   */
  appendObject(obj) {
    this.objects.push(obj);
  }

  /**
   * Removes an object from the page
   * @method
   * @param {object} obj - Board object to remove
   * @returns {void}
   * @throws {Error} If object is not found on the page
   */
  rmObject(obj) {
    const index = this.objects.indexOf(obj);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
  }
}
