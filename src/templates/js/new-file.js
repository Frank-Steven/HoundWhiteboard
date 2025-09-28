// const { ipcRenderer } = require("electron")
// const ipc = ipcRenderer
// ipc has been decleared in global.js

const newThemeBtn = document.getElementById("new-file-theme-select-new-theme");

const input = document.getElementById("new-file-form-input");
const inputConfirmBtn = document.getElementById("new-file-form-submit");

const filePathSpan = document.getElementById("new-file-path");
const choosePathBtn = document.getElementById("new-file-choosepath");

let filePath = "";

// 输入框
input.onkeydown = () => {
  setTimeout(() => {
    if (filePath === "") {
      filePathSpan.textContent =
        "Please choose a directory." + input.value + ".hwb";
    } else {
      filePathSpan.textContent = filePath + input.value + ".hwb";
    }
  }, 10);
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

  console.log(filePath);
  filePathSpan.textContent = filePath + input.value;
});

// 新建主题
newThemeBtn.onclick = () => {
  ipc.send("new-theme");
}
