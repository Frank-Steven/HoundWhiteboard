/// Sidebar buttons

const startBtn = document.getElementById("main-menu-sidebar-start");
const helpBtn = document.getElementById("main-menu-sidebar-help");
const aboutBtn = document.getElementById("main-menu-sidebar-about");
const settingsBtn = document.getElementById("main-menu-sidebar-settings");

const startScreen = document.getElementById("main-menu-content-start");
const helpScreen = document.getElementById("main-menu-content-help");
const aboutScreen = document.getElementById("main-menu-content-about");
const settingsScreen = document.getElementById("main-menu-content-settings");

startScreen.style.display = "block";
helpScreen.style.display = "none";
aboutScreen.style.display = "none";
settingsScreen.style.display = "none";

startBtn.addEventListener("click", () => {
  startScreen.style.display = "block";
  helpScreen.style.display = "none";
  aboutScreen.style.display = "none";
  settingsScreen.style.display = "none";
});

helpBtn.addEventListener("click", () => {
  helpScreen.style.display = "block";
  startScreen.style.display = "none";
  aboutScreen.style.display = "none";
  settingsScreen.style.display = "none";
});

aboutBtn.addEventListener("click", () => {
  aboutScreen.style.display = "block";
  startScreen.style.display = "none";
  helpScreen.style.display = "none";
  settingsScreen.style.display = "none";
});

settingsBtn.addEventListener("click", () => {
  settingsScreen.style.display = "block";
  startScreen.style.display = "none";
  helpScreen.style.display = "none";
  aboutScreen.style.display = "none";
  resetSelects();
});

/// Start screen buttons

const startNewBtn = document.getElementById(
  "main-menu-content-start-buttons-new"
);

// const startNewEditBtn = document.getElementById(
//   "main-menu-content-start-buttons-new-edit"
// );

const startOpenBtn = document.getElementById(
  "main-menu-content-start-buttons-open"
);

startNewBtn.addEventListener("click", () => {
  ipc.send("new-file");
});

// startNewEditBtn.addEventListener("click", () => {
//   ipc.send("new-edit-file");
// });

startOpenBtn.addEventListener("click", () => {
  ipc.send("open-hwb-file");
});

/// Settings screen buttons

const themeSelect = document.getElementById(
  "main-menu-content-settings-theme-select"
);

const languageSelect = document.getElementById(
  "main-menu-content-settings-language-select"
);

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

//!!
function resetSelects() {
  console.log(window.settings);
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

const saveBtn = document.getElementById(
  "main-menu-content-settings-buttons-save"
);

const cancelBtn = document.getElementById(
  "main-menu-content-settings-buttons-cancel"
);

saveBtn.addEventListener("click", () => {
  console.log(themeSelect.value);
  console.log(languageSelect.value);
  window.settings.theme = themeSelect.value;
  window.settings.language = languageSelect.value;
  ipc.send("settings-changed", window.settings);
});

cancelBtn.addEventListener("click", () => {
  resetSelects();
});
