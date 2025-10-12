const { app } = require("electron");

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
let backgroundImageFile;

// 初始化
previewScreenFlush()

function previewScreenFlush() {
  // 检查当前选项是否为图片
  if (imageOpt.checked) {
    previewScreen.style.background = `url("${backgroundImage.replace(/\\/g, "\\\\")}") no-repeat center center/cover`;
    result.backgroundImage = backgroundImage;
  } else if (solidOpt.checked) {
    previewScreen.style.background = color.value;
    result.backgroundColor = color.value;
  }
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

cancelBtn.addEventListener("click", () => {
  ipc.send("close-window", "NewTemplate");
});

confirmBtn.addEventListener("click", () => {
  console.log("confirm");
  result.texture = chooseTextureBtn.value;
  if (nameInput.value === "") { 
    nameInput.focus();
    return;
  }
  result.name = nameInput.value;
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
  imagePath.innerHTML = result[0];
  backgroundImage = result[0];
  if (!imageOpt.checked) {
    imageOpt.checked = true;
  }
  previewScreenFlush();
});

