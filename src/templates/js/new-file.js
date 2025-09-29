// const { ipcRenderer } = require("electron")
// const ipc = ipcRenderer
// ipc has been decleared in global.js

const newThemeBtn = document.getElementById("new-file-theme-select-new-theme");

const input = document.getElementById("new-file-save-form-input");
const inputSubmit = document.getElementById("new-file-save-form-submit");

const filePathSpan = document.getElementById("new-file-save-path");
const choosePathBtn = document.getElementById("new-file-save-choosepath");

let filePath = "";

// 输入框
input.onkeydown = () => {
  setTimeout(() => {
    if (filePath === "") {
      alert("请选择文件路径");
      input.value = "";
    } else {
      console.log("File Name:" + input.value);
      filePathSpan.textContent =
        filePath + (input.value === "" ? "" : input.value + ".hwb");
    }
  }, 2);
};

// 选择保存文件夹
choosePathBtn.onclick = () => {
  ipc.send("path-choose");
};

ipc.on("path-choose-result", (event, result) => {
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
newThemeBtn.onclick = () => {
  ipc.send("new-theme");
};
