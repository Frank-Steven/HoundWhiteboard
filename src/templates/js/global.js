window.onload = function () {
  window.settings = require(`../data/settings.json`);
  setTheme();
  setLanguage();
  //!! 读取文件
  // const fs = require("fs");
  // console.log(`${__dirname}/../../../../data/settings.json`);
  // fs.readFile(`${__dirname}/../../../../data/settings.json`, "utf-8", (err, data) => {
  //   if (err) throw err;
  //   window.settings = JSON.parse(data);
  //   alert(window.settings);
  //   setTheme();
  //   setLanguage();
  // });
};

function setTheme() {
  let stylesheet = document.getElementById("theme-stylesheet");
  stylesheet.href = `../data/themes/${window.settings.theme}.css`;
}

function setLanguage() {
  let language = require(`../data/languages/${window.settings.language}.json`);

  function updateTextNodes(obj, parentId = "") {
    for (const key in obj) {
      const currentId = parentId ? `${parentId}-${key}` : key;

      if (typeof obj[key] === "object") {
        updateTextNodes(obj[key], currentId);
      } else {
        const element = document.getElementById(currentId);
        if (element) {
          element.innerText = obj[key];
          // 特殊处理输入框（保留原逻辑）
          if (element.tagName === "INPUT" && element.placeholder) {
            element.placeholder = obj[key];
          }
        }
      }
    }
  }

  updateTextNodes(language.text);

  const langEvent = new CustomEvent("languageChanged", {
    detail: { lang: window.settings.language },
  });
  document.dispatchEvent(langEvent);
}

let ipc = require("electron").ipcRenderer;

ipc.on("settings-changed", () => {
  console.log("Settings changed.");
  // 将 window.settings 写入文件
  const fs = require("fs");
  fs.writeFile(
    `${__dirname}/../data/settings.json`,
    JSON.stringify(window.settings),
    (err) => {
      if (err) throw err;
      console.log("Settings saved.");
    }
  );
  setTheme();
  setLanguage();
});