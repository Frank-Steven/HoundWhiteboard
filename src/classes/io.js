const fs = require("fs");
const path = require("path");

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

  // @param {string} dir: 要 cd 到的目录
  // @return {directory}
  cd(dir) {
    return new directory(this.getPath(), dir);
  }
}

class file {
  address = "";
  name = "";
  extension = "";

  constructor (address, name, extension) {
    this.address = address;
    this.name = name;
    this.extension = extension;
  }

  // @return {string}
  getPath() {
    return path.join(this.address, this.name + "." + this.extension);
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
  lsDirs(dir) {
    return fs.readdirSync(dir.getPath())
             .map((name) => new directory(dir.getPath(), name));
  }

  // 读取目录中的文件
  // @param {directory} dir: 要读取的目录
  // @return {Array<file>}
  lsFiles(dir) {
    return fs.readdirSync(dir.getPath())
             .map((name) => {
                const nameWithoutExt = name.split(".").slice(0, -1).join(".");
                const ext = name.split(".").pop();
                return new file(dir.getPath(), nameWithoutExt, ext);
              });
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
  rmdir(dir) {
    fs.rmdirSync(dir.getPath());
  }

  // 复制文件
  // @param {file} source: 要复制的文件
  // @param {file} dest: 复制到的文件
  cp(source, dest) {
    fs.copyFileSync(source.getPath(), dest.getPath());
  }

  // 移动文件
  // @param {file} source: 要移动的文件
  // @param {file} dest: 移动到的文件
  mv(source, dest) {
    fs.renameSync(source.getPath(), dest.getPath());
  }

  // 解压文件
  // @param {directory} source: 要解压的文件路径
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
    zip.addLocalFolder(source);
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

const { randomNumberPool } = require("./algorithm").default;

class fileNameRandomPool {
  // @param {directory} dir: 要创建随机池的目录
  constructor(dir, type = "directory") {
    this.dir = dir;
    this.type = type;
    const min = 1, max = 1145141919810; // Homo Manager
    const pool = new randomNumberPool(min, max);
    const numbers = fp.lsDirs(dir)
                      .map(parseInt)
                      .filter(t => min <= t && t <= max);
    pool.initFromArray(numbers);
  }

  // 创建随机文件
  // @return {directory/file}
  generate() {
    const name = pool.generate().toString();
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
      fp.rm(path.join(this.dir.getPath(), ID));
    } else {
      fp.rmdir(path.join(this.dir.getPath(), ID));
    }
    pool.remove(parseInt(ID));
  }
}

module.exports = {
  directory,
  file,
  fileNameRandomPool,
  fp,
};
