const { fstat } = require("original-fs");

function extractFile(file) {
  const zip = new AdmZip(file);
  const directory = file.name.split('.')[0];
  zip.extractAllTo(directory, true);
};

function compressFile(directory) {
  const zip = new AdmZip();
  zip.addLocalFolder(directory);
  zip.writeZip(directory + '.hwb');
  fs.remove(directory);
};