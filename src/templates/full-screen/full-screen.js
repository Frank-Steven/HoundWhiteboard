/**
 * @file full-screen.js
 */

const RenderManager = require("./render-manager.js");

const canvas = document.getElementById('canvas');

// 设置 canvas 的内部分辨率，使其与 CSS 尺寸匹配
// 这样可以避免内容被拉伸
canvas.width = 800;
canvas.height = 600;

let testRenderManager = new RenderManager(canvas);

testRenderManager.renderDirect({
  type: "solidPolygon",
  position: { x: 0, y: 0 },
  transform: [[1, 0], [0, 1]],
  data: {
    solidPolygon: {
      points: [[0, 0], [100, 100], [0, 100]]
    }
  }
});

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
