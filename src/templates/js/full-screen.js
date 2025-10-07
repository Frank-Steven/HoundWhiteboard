const path = require("path");
const fs = require("fs");
const { getStroke } = require("perfect-freehand");

function setupDrawing(canvas) {
  const ctx = canvas.getContext("2d");
  let currentPoints = [];
  let isDrawing = false;
  let allStrokes = []; // 用于存储所有已完成的笔画

  canvas.addEventListener("pointerdown", (event) => {
    isDrawing = true;
    currentPoints = [[event.clientX, event.clientY, event.pressure ?? 0.5]];
    // 每次开始新笔画时重绘所有笔画
    redrawAllStrokes();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!isDrawing) return;
    currentPoints.push([event.clientX, event.clientY, event.pressure ?? 0.5]);
    // 每次移动时重绘所有笔画
    redrawAllStrokes();
  });

  canvas.addEventListener("pointerup", () => {
    isDrawing = false;
    if (currentPoints.length > 1) {
      const stroke = getStroke(currentPoints, {
        size: 16,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        easing: (t) => t,
        simulatePressure: true,
        last: true,
        start: {
          cap: true,
          taper: 0,
          easing: (t) => t,
        },
        end: {
          cap: true,
          taper: 0,
          easing: (t) => t,
        },
      });
      // 将完成的笔画添加到列表中
      allStrokes.push(stroke);
    }
    // 清空当前笔画点
    currentPoints = [];
    // 确保所有笔画都已绘制
    redrawAllStrokes();
  });

  function redrawAllStrokes() {
    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制所有已完成的笔画
    allStrokes.forEach((stroke) => {
      drawStroke(stroke);
    });

    // 绘制当前正在进行的笔画
    if (currentPoints.length > 1) {
      const currentStroke = getStroke(currentPoints, {
        size: 16,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });
      drawStroke(currentStroke);
    }
  }

  function drawStroke(strokePoints) {
    if (strokePoints.length === 0) return;

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);
    for (let i = 1; i < strokePoints.length; i++) {
      ctx.lineTo(strokePoints[i][0], strokePoints[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// 每一页的 info
class pageInfo {
  constructor(templateID, pageID) {
    this.templateID = templateID;
    this.pageID = pageID;
  }
}

let tempDir;
let pages;
let pagesInfos;

ipc.on("board-opened", (event, dir) => {
  console.log(dir);
  tempDir = dir;
  init();
  load();
});

function init() {
  // init from tempDir.
  pages = JSON.parse(fs.readFileSync(path.join(tempDir, "pages.json")));
  pagesInfos = new Array(0);
  pages.forEach((pge) => {
    pagesInfos.push(new pageInfo(pge.templateID, pge.pageID));
  });
}

// 加载第一页
// NOTE: 现在只有一页
function load() {
  const pageNo = 0;
  let info = pagesInfos[pageNo];
  let backgroundImg = document.getElementById("app-background-layer");

  let templateInfo = JSON.parse(
    fs.readFileSync(
      path.join(tempDir, "templates", info.templateID, "template.json")
    )
  );
  if (templateInfo.backgroundType === "solid") {
    // 加载背景色
    backgroundImg.style.background = templateInfo.background;
    console.log(templateInfo.background);
  } else {
    // 加载图片
    backgroundImg.src = path.join(
      tempDir,
      "templates",
      info.templateID,
      "backgroundImage." + templateInfo.background
    );
    console.log(backgroundImg.src);
  }

  // 初始化绘图功能
  const drawingCanvas = document.getElementById("drawing-canvas");
  if (drawingCanvas) {
    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight;
    setupDrawing(drawingCanvas);
  }
}
