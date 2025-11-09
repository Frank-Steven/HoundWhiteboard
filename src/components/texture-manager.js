/**
 * @file 纹理管理模块
 * @module texture-manager
 * @description 功能:
 * - SVG 纹理生成
 * - 瓦片纹理创建
 */

// 线条模式配置示例
const lineConfig = {
  svg:
    "M 0,50\
     l 100,0\
     M 50,0\
     l 0,100",
  type: "line",
  thickness: 5,
  color: "#ff0000",
  size: 0.6,
  width: 50,
  height: 50,
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
  size: 0.8,
  width: 100,
  height: 100,
  offset_x: 0,
  offset_y: 0,
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
    path.setAttribute("stroke-width", config.thickness / config.size);
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

  if (transfrom.length !== 0) {
    path.setAttribute("transform", transfrom.join(' '));
  }

  return svg;
}

/**
 * 创建平铺纹理容器,将纹理单元铺满整个容器,并在各方向额外平铺2个单元,整体居中显示
 *
 * @param {JSON} config - 纹理配置
 * @param {number} containerWidth - 容器宽度
 * @param {number} containerHeight - 容器高度
 * @returns {HTMLDivElement}
 */
function createTiledTexture(config, containerWidth, containerHeight) {
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = `${containerWidth}px`;
  container.style.height = `${containerHeight}px`;
  container.style.overflow = "hidden";
  container.style.border = "2px solid #333";

  // 计算单个纹理单元的实际尺寸
  let unitWidth = config.width;
  let unitHeight = config.height;

  if (config.type === "line") {
    unitWidth *= config.size;
    unitHeight *= config.size;
  } else if (config.type === "fill") {
    // 填充模式需要考虑 margin
    const marginX = unitWidth * (config.size - 1);
    const marginY = unitHeight * (config.size - 1);
    unitWidth += marginX * 2;
    unitHeight += marginY * 2;
  }

  // 计算需要多少行和列来填满容器
  const baseCols = Math.ceil(containerWidth / unitWidth);
  const baseRows = Math.ceil(containerHeight / unitHeight);

  // 在各方向额外增加2个单元
  const extraUnits = 2;
  const cols = baseCols + extraUnits * 2;
  const rows = baseRows + extraUnits * 2;

  // 计算整个平铺图案的总尺寸
  const totalWidth = cols * unitWidth;
  const totalHeight = rows * unitHeight;

  // 计算居中偏移量
  let offsetX = (containerWidth - totalWidth) / 2;
  let offsetY = (containerHeight - totalHeight) / 2;

  // 添加配置中的偏移量（将百分比转换为像素）
  offsetX += (config.offset_x / 100) * unitWidth;
  offsetY += (config.offset_y / 100) * unitHeight;

  // 创建平铺的纹理单元
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const svg = generateSVG(config);
      svg.style.position = "absolute";
      svg.style.left = `${offsetX + col * unitWidth}px`;
      svg.style.top = `${offsetY + row * unitHeight}px`;
      container.appendChild(svg);
    }
  }

  return container;
}

module.exports = {
  generateSVG,
  createTiledTexture,
};
