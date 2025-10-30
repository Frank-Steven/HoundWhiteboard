/**
 * @file full-screen-utils/render-manager.js
 * @module render-manager.js
 */

class RenderManager {
  constructor(canvas) {
    this.canvas = canvas;
  }
  /***************************************************/
  /* Define Direct                                   */
  /* {                                               */
  /*   "type": "solidPolygon"/"img"/"text",          */
  /*   "position": { "x", "y" },                     */
  /*   "transform": [[a, c]], [b, d]],               */
  /*   "data": {                                     */
  /*     "solidPolygon": {                           */
  /*       "points": [[x1, y1], [x2, y2], ...]       */
  /*     },                                          */
  /*     "img": {                                    */
  /*       "src": "path/to/img.png",                 */
  /*       "width": w, "height": h                   */
  /*     },                                          */
  /*     "text": {                                   */
  /*       "text": "Example text.",                  */
  /*       "font": "Arial",                          */
  /*       "size": 16,                               */
  /*       "color": "black" }                        */
  /*     }                                           */
  /*   }                                             */
  /*                                                 */
  /* }                                               */
  /***************************************************/

  /**
   * @example
   * renderDirect({
   * type: "solidPolygon",
   *   position: { x: 100, y: 100 },
   *   transform: [[1, 0], [0, 1]],
   *   data: {
   *     solidPolygon: {
   *     points: [[0, 0], [100, 100], [0, 100]]
   *     }
   *   }
   * })
   */
  renderDirect(direct) {
    const ctx = this.canvas.getContext("2d");
    ctx.save();
    const { type, position, transform, data } = direct;
    ctx.setTransform(
      transform[0][0],
      transform[1][0],
      transform[0][1],
      transform[1][1],
      position.x,
      position.y
    );
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
