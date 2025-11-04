/**
 * @file 渲染模块
 * @module render-manager
 * @description 功能:
 * - 将 Direct 转为 ctx 操作
 * - 处理多边形渲染
 * - 处理图像渲染
 * - 处理文字渲染
 */

class RenderManager {
  constructor(canvas) {
    this.canvas = canvas;
  }

  /**
   * @param {Object} direct - 被序列化后的 direct
   * @param {string} direct.type - "solidPolygon" 或 "img" 或 "text"
   * @param {Object} direct.position
   * @param {number} direct.position.x
   * @param {number} direct.position.y
   * @param {number[2][2]} direct.transform - transform 矩阵
   * @param {string} direct.mixture - 混合模式
   * @param {Object} direct.data - direct 的内联数据
   * @param {Object} direct.data.solidPolygon - 当 type 为 "solidPolygon" 时所用的数据
   * @param {number[][2]} direct.data.solidPolygon.points - solidPolygon 的点集
   * @param {Object} direct.data.img - 当 type 为 "img" 时所用的数据
   * @param {string} direct.data.img.src - img 的路径
   * @param {number} direct.data.img.width - img 的宽度
   * @param {number} direct.data.img.height - img 的高度
   * @param {Object} direct.data.text - 当 type 为 "text" 时所用的数据
   * @param {string} direct.data.text.text - text 的文本
   * @param {string} direct.data.text.font - text 的字体
   * @param {number} direct.data.text.size - text 的字号
   * @param {string} direct.data.text.color - text 的颜色
   * @example
   * // 欲渲染多边形
   * renderDirect({
   *   type: "solidPolygon",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   mixture: "source-over",
   *   data: {
   *     solidPolygon: {
   *       points: [[0, 0], [100, 100], [0, 100]]
   *     }
   *   }
   * });
   *
   * @example
   * // 欲渲染图片
   * renderDirect({
   *   type: "img",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   mixture: "source-over",
   *   data: {
   *     img: {
   *       src: "/home/zhouc_yu/Pictures/Wallpapers/archbtw.png",
   *       width: 1920,
   *       height: 1200
   *     }
   *   }
   * });
   *
   * @example
   * // 欲渲染文字
   * renderDirect({
   *   type: "text",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   mixture: "source-over",
   *   data: {
   *     text: {
   *       text: "This is an example text.",
   *       font: "Noto Sans CJK SC",
   *       size: 24,
   *       color: "#000000"
   *     }
   *   }
   * });
   */
  renderDirect(direct) {
    const ctx = this.canvas.getContext("2d");
    ctx.save();
    const { type, position, transform, mixture, data } = direct;
    ctx.setTransform(
      transform[0][0],
      transform[1][0],
      transform[0][1],
      transform[1][1],
      position.x,
      position.y
    );
    ctx.globalCompositeOperation = mixture;
    switch (type) {
      case "solidPolygon":
        const { points } = data.solidPolygon;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case "img":
        const { src, width, height } = data.img;
        const img = new Image();
        img.src = src;
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
        };
        break;
      case "text":
        const { text, font, size, color } = data.text;
        ctx.font = `${size}px ${font}`;
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        break;
      default:
        break;
    }
    ctx.restore();
  }
}

module.exports = RenderManager;
