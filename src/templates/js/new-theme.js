const { app } = require("electron");

document.addEventListener('DOMContentLoaded', function() {
  const bgSolid = document.getElementById('new-theme-background-options-solid');
  const bgImage = document.getElementById('new-theme-background-options-image');
  const bgColor = document.getElementById('new-theme-background-options-color');

  // function updateColorVisibility() {
  //   if (bgSolid.checked) {
  //     bgColor.style.display = 'block';
  //   } else {
  //     bgColor.style.display = 'none';
  //   }
  // }

  // bgSolid.addEventListener('change', updateColorVisibility);
  // bgImage.addEventListener('change', updateColorVisibility);
  // updateColorVisibility();
});
