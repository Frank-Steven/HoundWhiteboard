// const { ipcRenderer } = require("electron")
// const ipc = ipcRenderer
// ipc has been decleared in global.js

const newTemplateBtn = document.getElementById("new-file-template-select-new-template");

const input = document.getElementById("new-file-save-form-input");
const inputSubmit = document.getElementById("new-file-save-form-submit");

const filePathSpan = document.getElementById("new-file-save-path");
const choosePathBtn = document.getElementById("new-file-save-choosepath");

const confirmBtn = document.getElementById("yes-or-no-button-yes");
const cancelBtn = document.getElementById("yes-or-no-button-no");

const buttonList = document.getElementById("new-file-template-select-buttons")

let filePath = "";

// 输入框
input.onkeydown = () => {
  const clearInput = () => {
    if (filePath === "") {
      input.value = "";
    } else {
      console.log("File Name:" + input.value);
      filePathSpan.textContent =
        filePath + (input.value === "" ? "" : input.value + ".hwb");
    }
  }

  setTimeout(clearInput, 2);
  setTimeout(clearInput, 10);
};

// 选择保存文件夹
choosePathBtn.onclick = () => {
  ipc.send("path-choose");
};

ipc.on("path-choose-result", (event, result) => {
  // TODO: Use path.join
  if (process.platform === "win32") {
    filePath = result[0] + "\\";
  } else {
    filePath = result[0] + "/";
  }

  console.log("Path:" + filePath);
  filePathSpan.textContent =
    filePath + (input.value === "" ? "" : input.value + ".hwb");
});

// 新建主题
newTemplateBtn.onclick = () => {
  ipc.send("new-template");
};

// 取消
cancelBtn.addEventListener("click", () => {
  ipc.send("close-window", "NewFile");
})

// 加载按钮
ipc.send("load-buttons", "NewFile");
ipc.on("buttons-loaded", (event, result) => {
  
});