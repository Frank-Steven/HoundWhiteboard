/**
 * @file 渲染模块
 * @module render-manager
 * @description 功能:
 * - 将 Quark 转为 ctx 操作
 * - 处理多边形渲染
 * - 处理图像渲染
 * - 处理文字渲染
 */

class RenderManager {
  constructor(canvas) {
    this.canvas = canvas;
  }

  /**
   * @param {Object} quark - 被序列化后的 quark
   * @param {string} quark.type - "solidPolygon" 或 "img" 或 "text"
   * @param {Object} quark.position
   * @param {number} quark.position.x
   * @param {number} quark.position.y
   * @param {number[2][2]} quark.transform - transform 矩阵
   * @param {string} quark.mixture - 混合模式
   * @param {Object} quark.data - quark 的内联数据
   * @param {Object} quark.data.solidPolygon - 当 type 为 "solidPolygon" 时所用的数据
   * @param {number[][2]} quark.data.solidPolygon.points - solidPolygon 的点集
   * @param {Object} quark.data.img - 当 type 为 "img" 时所用的数据
   * @param {string} quark.data.img.src - img 的路径
   * @param {number} quark.data.img.width - img 的宽度
   * @param {number} quark.data.img.height - img 的高度
   * @param {Object} quark.data.text - 当 type 为 "text" 时所用的数据
   * @param {string} quark.data.text.text - text 的文本
   * @param {string} quark.data.text.font - text 的字体
   * @param {number} quark.data.text.size - text 的字号
   * @param {string} quark.data.text.color - text 的颜色
   * @example
   * // 欲渲染多边形
   * renderQuark({
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
   * renderQuark({
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
   * renderQuark({
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
  renderQuark(quark) {
    const ctx = this.canvas.getContext("2d");
    ctx.save();
    const { type, position, transform, mixture, data } = quark;
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
};

module.exports = RenderManager;
