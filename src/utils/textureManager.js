const { directory, file, fileNameRandomPool } = require("../classes/io");

// 两种，一种是“线条”，一种是“填充”

// 线条模式配置示例
const lineConfig = {
  svg:
    "M 10,30\
     A 20,20 0,0,1 50,30\
     A 20,20 0,0,1 90,30\
     Q 90,60 50,90\
     Q 10,60 10,30 z",
  type: "line",
  thickness: 3,
  color: "#ff0000",
  size: 0.6,
  width: 200,
  height: 200,
  offset_x: 0,
  offset_y: 0,
}

// 填充模式配置示例
const fillConfig = {
  svg:
    "M 10,30\
     A 20,20 0,0,1 50,30\
     A 20,20 0,0,1 90,30\
     Q 90,60 50,90\
     Q 10,60 10,30 z",
  type: "fill",
  thickness: 0.2,
  color: "#ff0000",
  size: 1.2,
  width: 200,
  height: 200,
  offset_x: 100,
  offset_y: 100,
}

/**
 * 创建最小纹理单元的 SVG 矢量图
 * 
 * @param {JSON} config - 纹理配置
 * @param {string} config.svg - 要创建的 SVG string (path.d)
 * @param {string} config.type - "fill" or "line"
 * @param {number} config.thickness - 粗细（对 fill 来说是缩放大小）
 * @param {string} config.color - 颜色
 * @param {number} config.size - 疏密（对 fill 来说是 margin 宽度；对 line 来说是 width 和 height 的乘数）
 * @param {number} config.width - 宽度（取 size = 1 时的值）
 * @param {number} config.height - 高度（取 size = 1 时的值）
 * @param {number} config.offset_x - x 偏移量
 * @param {number} config.offset_y - y 偏移量
 * @returns {SVGSVGElement}
 */
function generateSVG(config) {
  // 创建 SVG 元素
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  // 设置路径数据
  path.setAttribute("d", config.svg);

  let acturalWidth = config.width;
  let acturalHeight = config.height;

  if (config.type === "line") {
    // 线条模式：设置描边粗细
    path.setAttribute("stroke", config.color);
    path.setAttribute("stroke-width", config.thickness);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    // 线条模式：width 和 height 乘上 size
    acturalWidth *= config.size;
    acturalHeight *= config.size;
  } else if (config.type === "fill") {
    // 填充模式：填充
    path.setAttribute("fill", config.color);
    path.setAttribute("stroke", "none");
    // 填充模式：设置 margin 宽度
    svg.style.margin = `${acturalHeight * (config.size - 1)}px ${acturalWidth * (config.size - 1)}px`;
  }

  // 将路径添加到 SVG 元素
  svg.appendChild(path);

  // 设置 SVG 的 viewBox 以适应内容
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", acturalWidth);
  svg.setAttribute("height", acturalHeight);

  let transfrom = [];
  if (config.type === "fill") {
    // 使用 transform 以中心点进行缩放
    transfrom.push(`translate(50, 50) scale(${config.thickness}) translate(-50, -50)`);
  }

  transfrom.push(`translate(${config.offset_x * acturalWidth / 100}, ${config.offset_y * acturalHeight / 100})`)

  path.setAttribute("transform", transfrom.join(' '));

  return svg;
}

module.exports = {
  generatePath: generateSVG
};