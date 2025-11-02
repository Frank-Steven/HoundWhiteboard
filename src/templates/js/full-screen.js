/**
 * @file full-screen.js
 */

const RenderManager = require("../js/full-screen-utils/render-manager.js");

let testRenderManager = new RenderManager(document.getElementById('canvas'));

let test = {
  type: "solidPolygon",
  position: { x: 0, y: 0 },
  transform: [[1, 0], [0, 1]],
  data: {
    solidPolygon: {
      points: [[0, 0], [100, 100], [0, 100]]
    }
  }
};

testRenderManager.renderDirect(test);

testRenderManager.renderDirect({
  type: "text",
    position: { x: 100, y: 100 },
    transform: [[1, 0], [0, 1]],
    data: {
      text: {
        text: "This is an example text.",
        font: "Noto Sans CJK SC",
        size: 24,
        color: "#000000"
      }
    }
});
