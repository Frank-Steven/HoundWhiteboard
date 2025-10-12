/// Sidebar buttons

const sidebarButtons = document.querySelectorAll(".sidebar-button");
const contentScreens = document.querySelectorAll(".content-screen");

function activateScreen(screen) {
  contentScreens.forEach((scr) => {
    scr.classList.remove("content-active");
  });
  screen.classList.add("content-active");
}

function activateButton(button) {
  sidebarButtons.forEach((btn) => {
    btn.classList.remove("content-active");
  })
  button.classList.add("content-active");
}

sidebarButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const scr = document.getElementById(btn.dataset.targetScreen);
    activateScreen(scr);
    activateButton(btn);
  });
});

sidebarButtons[0].classList.add("content-active");
contentScreens[0].classList.add("content-active");

/// Start screen buttons

const startNewBtn = document.getElementById("main-menu-content-start-buttons-new");
const startOpenBtn = document.getElementById("main-menu-content-start-buttons-open");

startNewBtn.addEventListener("click", () => {
  ipc.send("open-modal-window", "MainMenu", "NewFile", "new-file.html");
});

startOpenBtn.addEventListener("click", () => {
  console.log("open.");
  ipc.send("open-hwb-file", "MainMenu");
});

ipc.on("open-hwb-file-result", (event, filePath) => {
  console.log(filePath);
  ipc.send("open-board-templated", filePath[0]);
})

/// Settings screen buttons

const themeSelect = document.getElementById("main-menu-content-settings-theme-select");
const languageSelect = document.getElementById("main-menu-content-settings-language-select");

// 遍历 theme 目录，动态生成 theme 选项
const themes = require("fs").readdirSync(`./src/data/themes`);
for (let i = 0; i < themes.length; i++) {
  const option = document.createElement("option");
  option.value = themes[i].replace(".css", "");
  option.text = themes[i].replace(".css", "");
  console.log(option.value);
  themeSelect.add(option);
}

const languages = require("fs").readdirSync(`./src/data/languages`);
for (let i = 0; i < languages.length; i++) {
  const option = document.createElement("option");
  option.value = languages[i].replace(".json", "");
  option.text = languages[i].replace(".json", "");
  console.log(option.value);
  languageSelect.add(option);
}

function resetSelects() {
  // 根据当前 theme 选择项，初始化 select 项
  for (let i = 0; i < themeSelect.options.length; i++) {
    if (themeSelect.options[i].value === window.settings.theme) {
      themeSelect.selectedIndex = i;
      break;
    }
  }

  // 根据当前 language 选择项，初始化 select 项
  for (let i = 0; i < languageSelect.options.length; i++) {
    if (languageSelect.options[i].value === window.settings.language) {
      languageSelect.selectedIndex = i;
      break;
    }
  }
}

const saveBtn = document.getElementById("main-menu-content-settings-buttons-save");
const cancelBtn = document.getElementById("main-menu-content-settings-buttons-cancel");

saveBtn.addEventListener("click", () => {
  console.log(themeSelect.value);
  console.log(languageSelect.value);
  window.settings.theme = themeSelect.value;
  window.settings.language = languageSelect.value;
  ipc.send("settings-changed", window.settings);
});


ipc.on("settings-loaded", (event, settings) => {
  window.settings.theme = settings.theme;
  window.settings.language = settings.language;
});

cancelBtn.addEventListener("click", () => {
  resetSelects();
});
