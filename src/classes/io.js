const fs = require("fs");
const path = require("path");
const hidefile = require("hidefile");
const AdmZip = require("adm-zip");

class directory {
  address = "";
  name = "";

  constructor (address, name) {
    this.address = address;
    this.name = name;
  }

  // @return {string}
  getPath() {
    return path.join(this.address, this.name);
  }

  // goto dir
  // @param {string} pathStr
  // @return {directory}
  cd(pathStr) {
    return new directory(this.getPath(), pathStr);
  }

  // goto father
  // @return {directory}
  father() {
    return new directory(path.dirname(this.address), path.basename(this.address));
  }

  // goto file
  // @param {string} fileName
  // @param {string} fileExt
  // @return {file}
  peek(fileName, fileExt) {
    return new file(this.getPath(), fileName, fileExt)
  }

  // 判断目录是否在该目录中
  // @param {file/directory} dirName
  // @return {bool}
  existDir(dirName) {
    return fp.exist(this.cd(dirName));
  }

  // 判断文件是否在该目录中
  // @param {string} fileName
  // @param {string} fileExt
  // @return {string}
  existFile(fileName, fileExt) {
    return fp.exist(this.peek(fileName, fileExt));
  }

  // 判断目录是否存在
  // @return {bool}
  exist() {
    return fp.exist(this);
  }

  // 创建该目录
  // @return {directory}
  make() {
    fp.mkdir(this);
    return this;
  }

  // 若该目录不存在则创建
  // @return {directory}
  existOrMake() {
    if (!this.exist()) this.make();
    return this;
  }

  cp(dest) {
    let ret;
    if (dest.exist()) {
      ret = dest.cd(this.name);
    } else {
      ret = dest;
    }
    fp.cpDir(this, ret);
    return ret;
  }

  // 删除该目录
  rm() {
    fp.rmDir(this);
    return this;
  }

  rmWhenExist() {
    if (this.exist()) this.rm();
    return this;
  }

  // @return {array<directory/file>}
  ls() {
    return fp.ls(this);
  }

  // @return {array<directory>}
  lsDir() {
    return fp.lsDir(this);
  }

  // @return {array<file>}
  lsFile() {
    return fp.lsFile(this);
  }

  hide() {
    const tempDir = directory.parse(hidefile.hideSync(this.getPath()));
    this.address = tempDir.address;
    this.name = tempDir.name;
    return this;
  }

  unhide() {
    const tempDir = directory.parse(hidefile.revealSync(this.getPath()));
    this.address = tempDir.address;
    this.name = tempDir.name;
    return this;
  }

  compress(file, remove = false) {
    fp.compressFile(this, file, remove);
    return file;
  }

  static getHideResult(dir) {
    return new directory(dir.address, "." + dir.name);
  }

  static getUnHideResult(dir) {
    return new directory(dir.address, dir.name.substring(1));
  }

  static parse(pathStr) {
    return new directory(path.dirname(pathStr), path.basename(pathStr));
  }
}

class file {
  address = "";
  name = "";
  extension = "";

  constructor (address, name, extension = "") {
    this.address = address;
    this.name = name;
    this.extension = extension;
  }

  // @return {string}
  getPath() {
    if (this.extension === "") return path.join(this.address, this.name);
    return path.join(this.address, this.name + "." + this.extension);
  }

  // @return {string}
  unPeek() {
    return new directory(path.dirname(this.address), path.basename(this.address));
  }

  // @return {string}
  cat() {
    return fp.readFile(this);
  }

  // @return {JSON}
  catJSON() {
    return JSON.parse(this.cat());
  }

  // 写入字符串
  // @param {string} content: 要写入的内容
  // @return {file}
  write(content) {
    fp.writeFile(this, content);
    return this;
  }

  // 写入 JSON
  // @param {JSON} content: 要写入的内容
  // @return {file}
  writeJSON(content) {
    this.write(JSON.stringify(content, null, 2));
    return this;
  }

  // 判断该文件是否存在
  // @return {bool}
  exist() {
    return fp.exist(this);
  }

  // 将该文件置空
  // @return {file}
  init() {
    fp.touch(this);
    return this;
  }

  // 若该文件不存在则创建并将该文件置空
  // @return {file}
  existOrInit() {
    if (!this.exist()) this.init();
    return this;
  }

  // 若该文件不存在则创建并写入内容
  // @param {string} content: 要写入的内容
  // @return {file}
  existOrWrite(content) {
    if(!this.exist()) this.write(content);
    return this;
  }

  // 若该文件不存在则创建并写入 JSON
  // @param {JSON} content: 要写入的内容
  // @return {file}
  existOrWriteJSON(content) {
    if(!this.exist()) this.writeJSON(content);
    return this;
  }

  // 转换为 Url
  // @return {string}
  toUrl() {
    return previewScreen.style.background = `url("${this.getPath().replace(/\\/g, "\\\\")}")`;
  }

  // @param {file/directory} dest
  // @return {file}
  cp(dest) {
    let ret;
    if (dest instanceof file) {
      ret = dest;
    } else {
      ret = dest.peek(this.name, this.extension);
    }
    fp.cp(this, ret);
    return ret;
  }

  // @param {file/directory} dest
  // @return {file}
  mv(dest) {
    this.cp(dest);
    this.rm();
    return dest;
  }

  // 删除该文件
  rm() {
    fp.rm(this);
    return this;
  }

  // 当该文件存在时删除该文件
  rmWhenExist() {
    if (this.exist()) this.rm();
    return this;
  }

  hide() {
    const tempFile = file.parse(hidefile.hideSync(this.getPath()));
    this.address = tempFile.address;
    this.extension = tempFile.extension;
    this.name = tempFile.name;
    return this;
  }

  unhide() {
    const tempFile = file.parse(hidefile.revealSync(this.getPath()));
    this.address = tempFile.address;
    this.extension = tempFile.extension;
    this.name = tempFile.name;
    return this;
  }

  extract(dir) {
    fp.extractFile(this, dir);
    return dir;
  }

  static getHideResult(f) {
    return new file(f.address, "." + f.name, f.extension);
  }

  static getUnHideResult(f) {
    return new file(f.address, f.name.substring(1), f.extension);
  }

  static parse(pathStr) {
    const pathRes = path.parse(pathStr);
    return new file(pathRes.dir, pathRes.name, pathRes.ext.substring(1));
  }
}

class fpClass {
  // 创建目录
  // @param {directory} dir: 要创建的目录
  mkdir(dir) {
    fs.mkdirSync(dir.getPath(), { recursive: true });
  }

  // 读取目录中的文件夹
  // @param {directory} dir: 要读取的目录
  // @return {Array<directory>}
  lsDir(dir) {
    return fs.readdirSync(dir.getPath())
             .filter(name => fs.statSync(dir.cd(name).getPath()).isDirectory())
             .map(name => dir.cd(name));
  }

  // 读取目录中的文件
  // @param {directory} dir: 要读取的目录
  // @return {Array<file>}
  lsFile(dir) {
    return fs.readdirSync(dir.getPath())
             .filter(name => fs.statSync(dir.cd(name).getPath()).isFile())
             .map(name => {
                const nameWithoutExt = name.split(".").slice(0, -1).join(".");
                const ext = name.split(".").pop();
                return new file(dir.getPath(), nameWithoutExt, ext);
              })
  }

  // 读取目录中的内容
  // @param {directory} dir: 要读取的目录
  // @return {Array<string>}
  ls(dir) {
    return fs.readdirSync(dir.getPath());
  }

  // 判断文件是否存在
  // @param {file/directory} file: 要判断的文件
  // @return {bool}
  exist(file) {
    return fs.existsSync(file.getPath());
  }

  // 读取文件内容
  // @param {file} file: 要读取的文件
  // @return {string}
  readFile(file) {
    return fs.readFileSync(file.getPath(), "utf8");
  }

  // 写入文件内容
  // @param {file} file: 要写入的文件
  // @param {string} content: 要写入的内容
  writeFile(file, content) {
    fs.writeFileSync(file.getPath(), content, "utf8");
  }

  // 创建文件
  // @param {file} file: 要创建的文件
  touch(file) {
    this.writeFile(file, "");
  }

  // 删除文件
  // @param {file} file: 要删除的文件
  rm(file) {
    fs.unlinkSync(file.getPath());
  }

  // 删除目录
  // @param {directory} dir: 要删除的目录
  rmDir(dir) {
    fs.rmSync(dir.getPath(), { recursive: true, force: true});
  }

  // 复制文件
  // @param {file} source: 要复制的文件
  // @param {file} dest: 复制到的文件
  cp(source, dest) {
    fs.copyFileSync(source.getPath(), dest.getPath());
  }

  // 复制目录
  // @param {file} source: 要复制的目录
  // @param {file} dest: 复制到的目录
  cpDir(source, dest) {
    fs.cpSync(source.getPath(), dest.getPath(), { recursive: true });
  }

  // 移动文件
  // @param {file} source: 要移动的文件
  // @param {file} dest: 移动到的文件
  mv(source, dest) {
    fs.renameSync(source.getPath(), dest.getPath());
  }

  // 解压文件
  // @param {file} source: 要解压的文件路径
  // @param {directory} dest: 解压到的目录路径
  extractFile(source, dest) {
    const zip = new AdmZip(source.getPath());
    zip.extractAllTo(dest.getPath(), true);
  }

  // 压缩文件
  // @param {directory} source: 要压缩的文件夹路径
  // @param {file} dest: 压缩后的文件路径
  // @param {boolean} remove: 是否删除原文件
  compressFile(source, dest, remove = false) {
    const zip = new AdmZip();
    zip.addLocalFolder(source.getPath());
    zip.writeZip(dest.getPath());
    if (remove) {
      fs.rm(source.getPath(), { recursive: true, force: true }, (err) => {
        if (err) throw err;
        console.log("Directory deleted");
      });
    }
  }
}

const fp = new fpClass();

const { randomNumberPool } = require("./algorithm");

class fileNameRandomPool {
  // @param {directory} dir: 要创建随机池的目录
  constructor(dir, type = "directory") {
    this.dir = dir;
    this.type = type;
    const min = 1, max = 1145141919810; // Homo Manager
    this.pool = new randomNumberPool(min, max);
    const numbers = fp.lsDir(dir)
                      .map(parseInt)
                      .filter(t => min <= t && t <= max);
    this.pool.initFromArray(numbers);
  }

  // 创建随机文件
  // @return {directory/file}
  generate() {
    const name = this.pool.generate().toString();
    if (this.type === "directory") {
      const newDir = new directory(this.dir.getPath(), name);
      fp.mkdir(newDir);
      return newDir;
    } else {
      const newFile = new file(this.dir.getPath(), name, this.type);
      fp.touch(newFile);
      return newFile;
    }
  }

  // 删除文件
  // @param {string} ID: 文件ID
  remove(ID) {
    if (this.type === "directory") {
      this.dir.cd(ID).rm();
    } else {
      this.dir.peek(ID, type).rm();
    }
    this.pool.remove(parseInt(ID));
  }
}

module.exports = {
  directory,
  file,
  fileNameRandomPool,
  fp,
};
