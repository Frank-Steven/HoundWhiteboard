/**
 * @file full-screen.js
 */

const RenderManager = require("../js/full-screen-utils/render-manager.js");

let testRenderManager = new RenderManager(document.getElementById('canvas'));

let test = {
  type: "solidPolygon",
  position: { x: 100, y: 100 },
  transform: [[1, 0], [0, 1]],
  data: {
    solidPolygon: {
      points: [[0, 0], [100, 100], [0, 100]]
    }
  }
};

testRenderManager.renderDirect(test);