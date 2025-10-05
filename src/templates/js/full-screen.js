const path = require("path");
const fs = require("fs");

// 每一页的 info.
class pageInfo {
  constructor(templateID, pageID){
    this.templateID = templateID;
    this.pageID = pageID;
  }
};

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
  pages.forEach(pge => {
    pagesInfos.push(new pageInfo(pge.templateID, pge.pageID))
  });
}

// 加载第一页
// NOTE: 现在只有一页
function load() {
  const pageNo = 0;
  let info = pagesInfos[pageNo];
  let backgroundImg = document.getElementById("app-background-layer");

  let templateInfo = JSON.parse(fs.readFileSync(path.join(tempDir, "templates", info.templateID, "template.json")));
  if (templateInfo.backgroundType === "solid") {
    // 加载背景色
    backgroundImg.style.background = templateInfo.background;
    console.log(templateInfo.background)
  } else {
    // 加载图片
    backgroundImg.src = path.join(tempDir, "templates", info.templateID, "backgroundImage." + templateInfo.background);
    console.log(backgroundImg.src)
  }
}