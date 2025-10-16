const chooseTextureBtn = document.getElementById("new-template-foreground-import");

const solidOpt = document.getElementById("new-template-background-options-solid");
const imageOpt = document.getElementById("new-template-background-options-image");
const imagePath = document.getElementById("new-template-background-options-image-text");
const color = document.getElementById("new-template-background-options-color");

const nameInput = document.getElementById("new-template-name-template-input");

const previewScreen = document.getElementById("new-template-preview-screen");

const imageChooseBtn = document.getElementById("new-template-background-options-image-upload");

const confirmBtn = document.getElementById("yes-or-no-button-yes");
const cancelBtn = document.getElementById("yes-or-no-button-no");

let result = {
  texture: null,
  backgroundColor: null,
  backgroundImage: null,
  name: null,
};

let backgroundImage = "";

/** 这个模版创建后，欲删除的另一个模版，为 null 则不删除 */
let deleteID = null;

// 初始化
previewScreenFlush()

function previewScreenFlush() {
  // 检查当前选项是否为图片
  if (imageOpt.checked) {
    previewScreen.style.background =
      `url("${backgroundImage.replace(/\\/g, "\\\\")}") no-repeat center center/cover`;
    result.backgroundImage = backgroundImage;
  } else if (solidOpt.checked) {
    previewScreen.style.background = color.value;
    result.backgroundColor = color.value;
  }
}

function blink(element) {
  element.classList.add('blinking');
  setTimeout(() => element.classList.remove('blinking'), 500);
}

// 当option发生变化时，刷新预览屏幕
solidOpt.addEventListener("change", () => {
  previewScreenFlush();
});

imageOpt.addEventListener("change", () => {
  previewScreenFlush();
});

imageChooseBtn.addEventListener("click", () => {
  console.log("image choose");
  ipc.send("open-img-file", "NewTemplate");
});

chooseTextureBtn.addEventListener("click", () => {
  ipc.send("open-hmq-file", "NewTemplate");
})

color.addEventListener("change", () => {
  if (solidOpt.checked) {
    previewScreenFlush();
  }
});

// 取消（不创建）
cancelBtn.addEventListener("click", () => {
  ipc.send("close-window", "NewTemplate");
});

// 确认创建
confirmBtn.addEventListener("click", () => {
  console.log("confirm");
  result.texture = chooseTextureBtn.value;
  if (nameInput.value === "") { 
    nameInput.focus();
    blink(nameInput);
    toast.warning("请输入样式名");
    return;
  }
  result.name = nameInput.value;
  if (deleteID) {
    ipc.send("template-remove", deleteID, "NewFile");
  }
  ipc.send("new-template-result", result);
  ipc.send("close-window", "NewTemplate");
});

ipc.on("open-img-file-result", (event, result) => {
  imagePath.innerHTML = result[0];
  backgroundImage = result[0];
  if (!imageOpt.checked) {
    imageOpt.checked = true;
  }
  previewScreenFlush();
});

ipc.on("open-hmq-file-result", (event, result) => {
  // TODO: 在此处实现纹理系统
  previewScreenFlush();
});

// 这个 ipc 可以用来实现模版的复制和更改
// TODO: 实现纹理
ipc.on("init-new-template-from-other-template", (event, templateInfo, pathStr, prevID) => {
  // name background backgroundType
  console.log("init new template from other template.")
  console.log(templateInfo);
  console.log("path: ", pathStr);
  result.name = templateInfo.name;
  if (templateInfo.backgroundType === "solid") {
    solidOpt.checked = true;
    color.value = templateInfo.background;
  } else {
    imageOpt.checked = true;
    backgroundImage = require("../../classes/io")
      .directory
      .parse(pathStr)
      .peek("backgroundImage", templateInfo.background)
      .getPath();
    console.log("imagePath: ", backgroundImage);
  }
  deleteID = prevID;
  previewScreenFlush();
});
