const path = require("path");
const fs = require("fs");
const { getStroke } = require("perfect-freehand");
const { fileNameRandomPool } = require("../../utils/IOManager");
const boardManager = require("../../utils/boardManager");

let currentPageIndex = 0;
let pagesInfos = [];

let pagePool, templatePool;

// 每一页的 info - 包含所有绘画相关功能
class pageClass {
  constructor(templateID, pageID) {
    this.templateID = templateID;
    this.pageID = pageID;
    this.strokes = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, "pages", this.pageID, "page.json")
      )
    ).strokes;

    // 绘画相关属性
    this.currentPoints = [];
    this.isDrawing = false;
    this.floatingCanvas = null;
    this.storingCanvas = null;
    this.ctxFloat = null;
    this.ctxStore = null;

    // 事件监听器引用
    this.eventListeners = {
      pointerdown: null,
      pointermove: null,
      pointerup: null,
      pointercancel: null
    };

    // prefect-freehand 参数
    this.strokeOption = {
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

    console.log("open page: %s", this.pageID);
  }

  // 初始化绘图功能
  setupDrawing(floatingCanvas, storingCanvas) {
    this.floatingCanvas = floatingCanvas;
    this.storingCanvas = storingCanvas;
    this.ctxFloat = floatingCanvas.getContext("2d");
    this.ctxStore = storingCanvas.getContext("2d");

    // 设置画布尺寸
    this.floatingCanvas.width = window.innerWidth;
    this.floatingCanvas.height = window.innerHeight;
    this.storingCanvas.width = window.innerWidth;
    this.storingCanvas.height = window.innerHeight;

    // 绘制已保存的笔画
    this.drawStoringStrokes();

    // 绑定事件监听器
    this.bindEventListeners();
  }

  // 绑定事件监听器
  bindEventListeners() {
    this.eventListeners.pointerdown = (event) => {
      event.preventDefault();
      this.isDrawing = true;
      this.currentPoints = [[event.clientX, event.clientY, event.pressure ?? 0.5]];
      this.redrawFloat();
    };

    this.eventListeners.pointermove = (event) => {
      if (!this.isDrawing) return;
      event.preventDefault();
      this.currentPoints.push([event.clientX, event.clientY, event.pressure ?? 0.5]);
      this.redrawFloat();
    };

    this.eventListeners.pointerup = (event) => {
      event.preventDefault();
      this.isDrawing = false;
      this.applyFloat();
    };

    this.eventListeners.pointercancel = (event) => {
      event.preventDefault();
      this.isDrawing = false;
      this.applyFloat();
    };

    this.floatingCanvas.addEventListener("pointerdown", this.eventListeners.pointerdown);
    this.floatingCanvas.addEventListener("pointermove", this.eventListeners.pointermove);
    this.floatingCanvas.addEventListener("pointerup", this.eventListeners.pointerup);
    this.floatingCanvas.addEventListener("pointercancel", this.eventListeners.pointercancel);
  }

  // 移除事件监听器
  removeEventListeners() {
    if (this.floatingCanvas) {
      this.floatingCanvas.removeEventListener("pointerdown", this.eventListeners.pointerdown);
      this.floatingCanvas.removeEventListener("pointermove", this.eventListeners.pointermove);
      this.floatingCanvas.removeEventListener("pointerup", this.eventListeners.pointerup);
      this.floatingCanvas.removeEventListener("pointercancel", this.eventListeners.pointercancel);
    }
  }

  // 将当前 floating canvas 里的一笔添加到 storing canvas 里
  applyFloat() {
    this.ctxFloat.clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height);

    if (this.currentPoints.length > 1) {
      const currentStroke = getStroke(this.currentPoints, this.strokeOption);
      this.drawStroke(this.ctxStore, currentStroke);
      this.strokes.push(currentStroke);
    }

    // 重置当前点
    this.currentPoints = [];
  }

  // 重绘 floating canvas
  redrawFloat() {
    this.ctxFloat.clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height);

    if (this.currentPoints.length > 1) {
      const currentStroke = getStroke(this.currentPoints, this.strokeOption);
      this.drawStroke(this.ctxFloat, currentStroke);
    }
  }

  // 绘制单个笔画
  drawStroke(ctx, points) {
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

  // 绘制所有已保存的笔画
  drawStoringStrokes() {
    this.strokes.forEach((stroke) => {
      this.drawStroke(this.ctxStore, stroke);
    });
  }

  // 清空画布
  clearCanvas() {
    if (this.ctxFloat) {
      this.ctxFloat.clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height);
    }
    if (this.ctxStore) {
      this.ctxStore.clearRect(0, 0, this.storingCanvas.width, this.storingCanvas.height);
    }
  }

  // 撤销最后一笔
  undo() {
    if (this.strokes.length > 0) {
      this.strokes.pop();
      this.ctxStore.clearRect(0, 0, this.storingCanvas.width, this.storingCanvas.height);
      this.drawStoringStrokes();
    }
  }

  // 保存到文件
  saveToFile() {
    fs.writeFileSync(
      path.join(tempDir, "pages", this.pageID, "page.json"),
      JSON.stringify({
        "strokes": this.strokes,
        "assets": []
      }, null, 2)
    );
  }

  // 激活此页面
  activate(floatingCanvas, storingCanvas) {
    // 显示并绑定事件
    this.setupDrawing(floatingCanvas, storingCanvas);
  }

  // 停用此页面
  deactivate() {
    // 移除事件监听器
    this.removeEventListeners();
  }
}

let tempDir;
let pages;

ipc.on("board-opened", (event, dir) => {
  init(dir);
  loadPage(0);
  setupPageControls();
});

// 监听窗口关闭事件
window.addEventListener('beforeunload', (event) => {
  // 停用当前页面并保存所有页面数据
  if (pagesInfos[currentPageIndex]) {
    pagesInfos[currentPageIndex].deactivate();
  }

  pagesInfos.forEach(info => {
    info.saveToFile();
  });

  // 发送 IPC 消息到主进程
  ipc.send("save-board-templated", tempDir);
});

// 初始化页面数据
function init(dir) {
  console.log("init: %s", dir)
  tempDir = dir;
  pagePool = new fileNameRandomPool(path.join(tempDir, "pages"), (_) => true);
  templatePool = new fileNameRandomPool(path.join(tempDir, "templates"), (_) => true);
  pages = JSON.parse(fs.readFileSync(path.join(tempDir, "pages.json")));
  pagesInfos = [];
  pages.forEach((pge) => {
    // 在 pages.json 中定义每一个页面用什么 template
    pagesInfos.push(new pageClass(pge.templateID, pge.pageID));
  });
}

// 加载指定页面
function loadPage(pageNo) {
  if (pageNo < 0 || pageNo >= pagesInfos.length) {
    console.error("Invalid page number: %d", pageNo);
    return;
  }

  // 停用当前页面
  if (pagesInfos[currentPageIndex]) {
    pagesInfos[currentPageIndex].deactivate();
  }

  // 更新当前页面索引
  currentPageIndex = pageNo;

  let info = pagesInfos[pageNo];
  let backgroundImg = document.getElementById("app-background-layer");

  // 加载模板信息
  let templateInfo = JSON.parse(
    fs.readFileSync(
      path.join(tempDir, "templates", info.templateID, "template.json")
    )
  );

  // 设置背景
  if (templateInfo.backgroundType === "solid") {
    backgroundImg.style.background = templateInfo.background;
    console.log(templateInfo.background);
  } else {
    backgroundImg.src = path.join(
      tempDir,
      "templates",
      info.templateID,
      "backgroundImage." + templateInfo.background
    );
    console.log(backgroundImg.src);
  }

  // 激活新页面的绘图功能
  const floatingCanvas = document.getElementById("floating-canvas");
  const storingCanvas = document.getElementById("storing-canvas");
  if (floatingCanvas && storingCanvas) {
    info.activate(floatingCanvas, storingCanvas);
  }

  // 更新页码显示
  updatePageNumber();
}

function addPage(templateID) {
  const newPage = boardManager.addPage(pagePool, templateID);
  pagePool = newPage.pool;
  pagesInfos.push(new pageClass(templateID, newPage.pageID));
  switchPage(pagesInfos.length - 1);
}

// 切换到指定页面
function switchPage(newPageIndex) {
  if (newPageIndex < 0 || newPageIndex >= pagesInfos.length) {
    console.warn("Cannot switch to page:", newPageIndex);
    return;
  }

  loadPage(newPageIndex);
}

// 更新页码显示
function updatePageNumber() {
  const leftPageNumber = document.getElementById('app-controls-side-controls-left-page-number');
  const rightPageNumber = document.getElementById('app-controls-side-controls-right-page-number');

  const pageText = `${currentPageIndex + 1}/${pagesInfos.length}`;

  if (leftPageNumber) {
    leftPageNumber.textContent = pageText;
  }
  if (rightPageNumber) {
    rightPageNumber.textContent = pageText;
  }
}

// 绑定翻页按钮事件
function setupPageControls() {
  // 左侧控制
  const leftPrev = document.getElementById('app-controls-side-controls-left-previous');
  const leftNext = document.getElementById('app-controls-side-controls-left-next');

  // 右侧控制
  const rightPrev = document.getElementById('app-controls-side-controls-right-previous');
  const rightNext = document.getElementById('app-controls-side-controls-right-next');

  const gotoPrevPage = () => {
    if (currentPageIndex > 0) {
      switchPage(currentPageIndex - 1);
    }
    console.log("Previous page");
  }

  const gotoNextPage = () => {
    if (currentPageIndex < pagesInfos.length - 1) {
      switchPage(currentPageIndex + 1);
    } else if (currentPageIndex == pagesInfos.length - 1) {
      addPage(pagesInfos[currentPageIndex].templateID);
      console.log("Add page");
    }
    console.log("Next page")
  }

  leftPrev.addEventListener("click", gotoPrevPage);
  leftNext.addEventListener('click', gotoNextPage);
  rightPrev.addEventListener("click", gotoPrevPage);
  rightNext.addEventListener('click', gotoNextPage);
}
