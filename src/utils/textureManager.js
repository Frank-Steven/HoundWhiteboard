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
  width: 200,
  height: 200,
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
  thickness: 0.7,
  color: "#ff0000",
  width: 200,
  height: 200,
}

class texture {
  constructor(config) {
    this.type = config.type;
    this.svg = config.svg;
    this.thickness = config.thickness;
    this.color = config.color;
    this.height = config.height;
    this.width = config.width;
  }

  generatePath() {
    // 创建 SVG 元素
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    // 设置路径数据
    path.setAttribute("d", this.svg);

    if (this.type === "line") {
      // 线条模式：设置描边粗细，无填充
      path.setAttribute("stroke", this.color);
      path.setAttribute("stroke-width", this.thickness);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    } else if (this.type === "fill") {
      // 填充模式：放大路径并填充
      path.setAttribute("fill", this.color);
      path.setAttribute("stroke", "none");
    }

    // 将路径添加到 SVG 元素（需要先添加才能获取 bbox）
    svg.appendChild(path);

    // 设置 SVG 的 viewBox 以适应内容
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", this.width);
    svg.setAttribute("height", this.height);

    // 对于填充模式，需要在 DOM 中才能获取 bbox
    if (this.type === "fill") {
      // 临时添加到 DOM 以获取边界框
      document.body.appendChild(svg);
      
      // 获取路径的边界框
      const bbox = path.getBBox();
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;
      const scale = this.thickness;
      
      // 使用 transform 以中心点进行缩放
      path.setAttribute("transform",
        `translate(${centerX}, ${centerY}) scale(${scale}) translate(${-centerX}, ${-centerY})`
      );
      
      // 从 DOM 中移除
      document.body.removeChild(svg);
    }

    return svg;
  }
};

module.exports = {
  texture
};