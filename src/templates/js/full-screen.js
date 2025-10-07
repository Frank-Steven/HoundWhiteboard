const path = require("path");
const fs = require("fs");
const { getStroke } = require("perfect-freehand");
const { info } = require("console");

let currentPoints = [];
let storingStrokes = [];

function setupDrawing(floatingCanvas, storingCanvas) {
  // init
  const ctxFloat = floatingCanvas.getContext("2d");
  const ctxStore = storingCanvas.getContext("2d");
  let isDrawing = false;
  drawStoringStroks();

  // prefect-freehandwrite 参数
  const strokeOption = {
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
  };

  floatingCanvas.addEventListener("pointerdown", (event) => {
    // 阻止默认行为
    event.preventDefault();

    isDrawing = true;
    currentPoints = [[event.clientX, event.clientY, event.pressure ?? 0.5]];
    redrawFloat();
  });

  floatingCanvas.addEventListener("pointermove", (event) => {
    if (!isDrawing) return;
    // 阻止默认行为
    event.preventDefault();

    currentPoints.push([event.clientX, event.clientY, event.pressure ?? 0.5]);
    redrawFloat();
  });

  floatingCanvas.addEventListener("pointerup", (event) => {
    // 阻止默认行为
    event.preventDefault();

    isDrawing = false;
    applyFloat();
  });

  // 触摸被取消（如系统手势、来电等）
  floatingCanvas.addEventListener("pointercancel", (event) => {
    // 阻止默认行为
    event.preventDefault();

    isDrawing = false;
    applyFloat();
  });

  // 将当前 floating canvas 里的一笔添加到 storing canvas 里
  function applyFloat() {
    ctxFloat.clearRect(0, 0, floatingCanvas.width, floatingCanvas.height);

    if (currentPoints.length > 1) {
      const currentStroke = getStroke(currentPoints, strokeOption);
      drawStroke(ctxStore, currentStroke);
      storingStrokes.push(currentStroke);
      // console.log("apply");
      // console.log(currentStroke);
      // console.log(storingStrokes);
    }

    // 重置当前点
    currentPoints = [];
  }

  // 重绘 floating canvas
  function redrawFloat() {
    ctxFloat.clearRect(0, 0, floatingCanvas.width, floatingCanvas.height);

    if (currentPoints.length > 1) {
      const currentStroke = getStroke(currentPoints, strokeOption);
      drawStroke(ctxFloat, currentStroke);
    }
  }

  function drawStroke(ctx, points) {
    if (points.length === 0) return;

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawStoringStroks() {
    storingStrokes.forEach((stroke) => {
      drawStroke(ctxStore, stroke);
    })
  }
}

// 每一页的 info
class pageInfo {
  constructor(templateID, pageID) {
    this.templateID = templateID;
    this.pageID = pageID;
    this.strokes = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, "pages", this.pageID, "page.json")
      )
    ).strokes;
    console.log(path.join(tempDir, "pages", this.pageID, "page.json"));
  }

  saveToFile() {
    fs.writeFileSync(
      path.join(tempDir, "pages", this.pageID, "page.json"),
      JSON.stringify({
        "strokes": this.strokes,
        "assets": []
      }, null, 2)
    );
  }

  saveToInfo(strokes) {
    this.strokes = strokes;
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

// 监听窗口关闭事件
window.addEventListener('beforeunload', (event) => {
  // 保存当前笔画数据到文件
  pagesInfos[0].saveToInfo(storingStrokes);
  pagesInfos.forEach(info => {
    info.saveToFile();
  });
  
  // 发送 IPC 消息到主进程
  ipc.send("save-board-templated", tempDir);
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
  let pageNo = 0;
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
  storingStrokes = info.strokes
  const floatingCanvas = document.getElementById("floating-canvas");
  const storingCanvas = document.getElementById("storing-canvas");
  if (floatingCanvas) {
    floatingCanvas.width = window.innerWidth;
    floatingCanvas.height = window.innerHeight;
    storingCanvas.width = window.innerWidth;
    storingCanvas.height = window.innerHeight;
    setupDrawing(floatingCanvas, storingCanvas);
  }
}
