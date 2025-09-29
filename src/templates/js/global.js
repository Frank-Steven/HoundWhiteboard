let ipc = require("electron").ipcRenderer;

ipc.on("settings-loaded", (event, settings) => {
  window.settings = settings;
  setTheme();
  setLanguage();
});

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

ipc.on("settings-changed", (event, settings) => {
  console.log("Settings changed.");
  window.settings = settings;
  setTheme();
  setLanguage();
});

// Init
setTheme();
setLanguage();