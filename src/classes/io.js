const fs = require("fs");
const path = require("path");
const hidefile = require("hidefile");
const AdmZip = require("adm-zip");

/**
 * @class
 * @property {string} address - 目录所在路径
 * @property {string} name - 目录名称
 */
class directory {
  address = "";
  name = "";

  /**
   * 创建目录实例
   * @param {string} address - 目录所在路径
   * @param {string} name - 目录名称
   */
  constructor (address, name) {
    this.address = address;
    this.name = name;
  }

  /**
   * 获取目录的完整绝对路径
   * @returns {string} 组合后的完整路径
   */
  getPath() {
    return path.join(this.address, this.name);
  }

  /**
   * 进入指定子目录并返回新实例
   * @param {string} pathStr - 子目录路径(相对路径或目录名)
   * @returns {directory} 新的目录实例
   */
  cd(pathStr) {
    return new directory(this.getPath(), pathStr);
  }

  /**
   * 获取当前目录的父目录实例
   * @returns {directory} 父目录实例，如果是根目录则返回null
   */
  father() {
    return new directory(path.dirname(this.address), path.basename(this.address));
  }

  /**
   * 创建并返回指定文件的实例
   * @param {string} fileName - 文件名(不含扩展名)
   * @param {string} fileExt - 文件扩展名(不含点)
   * @returns {file} 文件实例
   */
  peek(fileName, fileExt) {
    return new file(this.getPath(), fileName, fileExt)
  }

  /**
   * 检查指定子目录是否存在
   * @param {string} dirName - 子目录名称
   * @returns {boolean} 子目录是否存在
   */
  existDir(dirName) {
    return fp.exist(this.cd(dirName));
  }

  /**
   * 检查指定文件是否存在
   * @param {string} fileName - 文件名(不含扩展名)
   * @param {string} fileExt - 文件扩展名(不含点)
   * @returns {boolean} 文件是否存在
   */
  existFile(fileName, fileExt) {
    return fp.exist(this.peek(fileName, fileExt));
  }

  /**
   * 检查当前目录是否存在
   * @returns {boolean} 目录是否存在
   */
  exist() {
    return fp.exist(this);
  }

  /**
   * 创建该目录
   * @returns {directory} 当前目录对象
   */
  make() {
    fp.mkdir(this);
    return this;
  }

  /**
   * 若该目录不存在则创建
   * @returns {directory} 当前目录对象
   */
  existOrMake() {
    if (!this.exist()) this.make();
    return this;
  }

  /**
   * 复制目录
   * @param {directory} dest - 目标目录
   * @returns {directory} 目标目录对象
   */
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

  /**
   * 删除该目录
   * @returns {directory} 当前目录对象
   */
  rm() {
    fp.rmDir(this);
    return this;
  }

  /**
   * 当目录存在时删除该目录
   * @returns {directory} 当前目录对象
   */
  rmWhenExist() {
    if (this.exist()) this.rm();
    return this;
  }

  /**
   * 移动目录
   * @param {directory} dest - 目标目录
   * @returns {directory} 目标目录对象
   */
  mv(dest) {
    this.cp(dest);
    this.rm();
    return dest;
  }

  /**
   * 列出目录中的所有内容
   * @returns {Array<directory|file>} 目录和文件数组
   */
  ls() {
    return fp.ls(this);
  }

  /**
   * 列出目录中的所有子目录
   * @returns {Array<directory>} 目录数组
   */
  lsDir() {
    return fp.lsDir(this);
  }

  /**
   * 列出目录中的所有文件
   * @returns {Array<file>} 文件数组
   */
  lsFile() {
    return fp.lsFile(this);
  }

  /**
   * 隐藏目录
   * @returns {directory} 当前目录对象
   */
  hide() {
    const tempDir = directory.parse(hidefile.hideSync(this.getPath()));
    this.address = tempDir.address;
    this.name = tempDir.name;
    return this;
  }

  /**
   * 取消隐藏目录
   * @returns {directory} 当前目录对象
   */
  unhide() {
    const tempDir = directory.parse(hidefile.revealSync(this.getPath()));
    this.address = tempDir.address;
    this.name = tempDir.name;
    return this;
  }

  /**
   * 压缩目录
   * @param {file} file - 压缩后的文件
   * @param {boolean} remove - 是否删除原目录
   * @returns {file} 压缩后的文件对象
   */
  compress(file, remove = false) {
    fp.compressFile(this, file, remove);
    return file;
  }

  /**
   * 获取隐藏后的目录结果
   * @param {directory} dir - 目录对象
   * @returns {directory} 隐藏后的目录对象
   */
  static getHideResult(dir) {
    return new directory(dir.address, "." + dir.name);
  }

  /**
   * 获取取消隐藏后的目录结果
   * @param {directory} dir - 目录对象
   * @returns {directory} 取消隐藏后的目录对象
   */
  static getUnHideResult(dir) {
    return new directory(dir.address, dir.name.substring(1));
  }

  /**
   * 解析路径字符串为目录对象
   * @param {string} pathStr - 路径字符串
   * @returns {directory} 目录对象
   */
  static parse(pathStr) {
    return new directory(path.dirname(pathStr), path.basename(pathStr));
  }
}

/**
 * @class
 * @property {string} address - 文件所在路径
 * @property {string} name - 文件名 (不含扩展名)
 * @property {string} extension - 文件扩展名 (不含点)
 */
class file {
  address = "";
  name = "";
  extension = "";

  /**
   * 创建文件实例
   * @param {string} address - 文件所在路径
   * @param {string} name - 文件名 (不含扩展名)
   * @param {string} extension - 文件扩展名 (不含点)
   */
  constructor (address, name, extension = "") {
    this.address = address;
    this.name = name;
    this.extension = extension;
  }

  /**
   * 获取文件的完整绝对路径
   * @returns {string} 组合后的完整路径
   */
  getPath() {
    if (this.extension === "") return path.join(this.address, this.name);
    return path.join(this.address, this.name + "." + this.extension);
  }

  /**
   * 获取文件所在的目录实例
   * @returns {directory} 父目录实例
   */
  unPeek() {
    return new directory(path.dirname(this.address), path.basename(this.address));
  }

  /**
   * 读取文件内容为字符串
   * @returns {string} 文件内容字符串
   */
  cat() {
    return fp.readFile(this);
  }

  /**
   * 读取 JSON 文件内容
   * @returns {JSON} JSON 对象
   */
  catJSON() {
    return JSON.parse(this.cat());
  }

  /**
   * 写入字符串
   * @param {string} content - 要写入的内容
   * @returns {file} 当前文件对象
   */
  write(content) {
    fp.writeFile(this, content);
    return this;
  }

  /**
   * 写入 JSON
   * @param {JSON} content - 要写入的内容
   * @returns {file} 当前文件对象
   */
  writeJSON(content) {
    this.write(JSON.stringify(content, null, 2));
    return this;
  }

  /**
   * 判断该文件是否存在
   * @returns {boolean} 是否存在
   */
  exist() {
    return fp.exist(this);
  }

  /**
   * 将该文件置空
   * @returns {file} 当前文件对象
   */
  init() {
    fp.touch(this);
    return this;
  }

  /**
   * 若该文件不存在则创建并将该文件置空
   * @returns {file} 当前文件对象
   */
  existOrInit() {
    if (!this.exist()) this.init();
    return this;
  }

  /**
   * 若该文件不存在则创建并写入内容
   * @param {string} content - 要写入的内容
   * @returns {file} 当前文件对象
   */
  existOrWrite(content) {
    if(!this.exist()) this.write(content);
    return this;
  }

  /**
   * 若该文件不存在则创建并写入 JSON
   * @param {Object} content - 要写入的内容
   * @returns {file} 当前文件对象
   */
  existOrWriteJSON(content) {
    if(!this.exist()) this.writeJSON(content);
    return this;
  }

  /**
   * 转换为 Url
   * @returns {string} URL 字符串
   */
  toUrl() {
    return previewScreen.style.background = `url("${this.getPath().replace(/\\/g, "\\\\")}")`;
  }

  /**
   * 复制文件
   * @param {file|directory} dest - 目标文件或目录
   * @returns {file} 目标文件对象
   */
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

  /**
   * 移动文件
   * @param {file|directory} dest - 目标文件或目录
   * @returns {file} 目标文件对象
   */
  mv(dest) {
    this.cp(dest);
    this.rm();
    return dest;
  }

  /**
   * 删除该文件
   * @returns {file} 当前文件对象
   */
  rm() {
    fp.rm(this);
    return this;
  }

  /**
   * 当该文件存在时删除该文件
   * @returns {file} 当前文件对象
   */
  rmWhenExist() {
    if (this.exist()) this.rm();
    return this;
  }

  /**
   * 隐藏文件
   * @returns {file} 当前文件对象
   */
  hide() {
    const tempFile = file.parse(hidefile.hideSync(this.getPath()));
    this.address = tempFile.address;
    this.extension = tempFile.extension;
    this.name = tempFile.name;
    return this;
  }

  /**
   * 取消隐藏文件
   * @returns {file} 当前文件对象
   */
  unhide() {
    const tempFile = file.parse(hidefile.revealSync(this.getPath()));
    this.address = tempFile.address;
    this.extension = tempFile.extension;
    this.name = tempFile.name;
    return this;
  }

  /**
   * 解压文件
   * @param {directory} dir - 解压到的目录
   * @returns {directory} 目标目录对象
   */
  extract(dir) {
    fp.extractFile(this, dir);
    return dir;
  }

  /**
   * 获取隐藏后的文件结果
   * @param {file} f - 文件对象
   * @returns {file} 隐藏后的文件对象
   */
  static getHideResult(f) {
    return new file(f.address, "." + f.name, f.extension);
  }

  /**
   * 获取取消隐藏后的文件结果
   * @param {file} f - 文件对象
   * @returns {file} 取消隐藏后的文件对象
   */
  static getUnHideResult(f) {
    return new file(f.address, f.name.substring(1), f.extension);
  }

  /**
   * 解析路径字符串为文件对象
   * @param {string} pathStr - 路径字符串
   * @returns {file} 文件对象
   */
  static parse(pathStr) {
    const pathRes = path.parse(pathStr);
    return new file(pathRes.dir, pathRes.name, pathRes.ext.substring(1));
  }
}

class fpClass {
  /**
   * 创建指定目录
   * @param {directory} dir 要创建的目录实例
   */
  mkdir(dir) {
    fs.mkdirSync(dir.getPath(), { recursive: true });
  }

  /**
   * 获取目录中的所有子目录
   * @param {directory} dir 要读取的目录实例
   * @returns {Array<directory>} 子目录实例数组
   */
  lsDir(dir) {
    return fs.readdirSync(dir.getPath())
             .filter(name => fs.statSync(dir.cd(name).getPath()).isDirectory())
             .map(name => dir.cd(name));
  }

  /**
   * 读取目录中的文件
   * @param {directory} dir - 要读取的目录
   * @returns {Array<file>} 文件数组
   */
  lsFile(dir) {
    return fs.readdirSync(dir.getPath())
             .filter(name => fs.statSync(dir.cd(name).getPath()).isFile())
             .map(name => {
                const nameWithoutExt = name.split(".").slice(0, -1).join(".");
                const ext = name.split(".").pop();
                return new file(dir.getPath(), nameWithoutExt, ext);
              })
  }

  /**
   * 读取目录中的内容
   * @param {directory} dir - 要读取的目录
   * @returns {Array<string>} 文件名数组
   */
  ls(dir) {
    return fs.readdirSync(dir.getPath());
  }

  /**
   * 判断文件是否存在
   * @param {file|directory} file - 要判断的文件
   * @returns {boolean} 是否存在
   */
  exist(file) {
    return fs.existsSync(file.getPath());
  }

  /**
   * 读取文件内容
   * @param {file} file - 要读取的文件
   * @returns {string} 文件内容
   */
  readFile(file) {
    return fs.readFileSync(file.getPath(), "utf8");
  }

  /**
   * 写入文件内容
   * @param {file} file - 要写入的文件
   * @param {string} content - 要写入的内容
   */
  writeFile(file, content) {
    fs.writeFileSync(file.getPath(), content, "utf8");
  }

  /**
   * 创建文件
   * @param {file} file - 要创建的文件
   */
  touch(file) {
    this.writeFile(file, "");
  }

  /**
   * 删除文件
   * @param {file} file - 要删除的文件
   */
  rm(file) {
    fs.unlinkSync(file.getPath());
  }

  /**
   * 删除目录
   * @param {directory} dir - 要删除的目录
   */
  rmDir(dir) {
    fs.rmSync(dir.getPath(), { recursive: true, force: true});
  }

  /**
   * 复制文件
   * @param {file} source - 要复制的文件
   * @param {file} dest - 复制到的文件
   */
  cp(source, dest) {
    fs.copyFileSync(source.getPath(), dest.getPath());
  }

  /**
   * 复制目录
   * @param {directory} source - 要复制的目录
   * @param {directory} dest - 复制到的目录
   */
  cpDir(source, dest) {
    fs.cpSync(source.getPath(), dest.getPath(), { recursive: true });
  }

  /**
   * 移动文件
   * @param {file} source - 要移动的文件
   * @param {file} dest - 移动到的文件
   */
  mv(source, dest) {
    fs.renameSync(source.getPath(), dest.getPath());
  }

  /**
   * 解压文件
   * @param {file} source - 要解压的文件路径
   * @param {directory} dest - 解压到的目录路径
   */
  extractFile(source, dest) {
    const zip = new AdmZip(source.getPath());
    zip.extractAllTo(dest.getPath(), true);
  }

  /**
   * 压缩文件
   * @param {directory} source - 要压缩的文件夹路径
   * @param {file} dest - 压缩后的文件路径
   * @param {boolean} remove - 是否删除原文件
   */
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
  /**
   * 创建随机文件名池实例
   * @param {directory} dir 目标目录实例
   * @param {string} type "directory"表示目录池，其他值表示文件扩展名
   */
  constructor(dir, type = "directory") {
    this.dir = dir;
    this.type = type;
    const min = 1, max = 1145141919810;
    this.pool = new randomNumberPool(min, max);
    const numbers = fp.lsDir(dir)
                      .map(parseInt)
                      .filter(t => min <= t && t <= max);
    this.pool.initFromArray(numbers);
  }

  /**
   * 生成随机目录/文件实例
   * @returns {directory|file} 新创建的目录或文件实例
   */
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

  /**
   * 删除目录/文件
   * @param {string} ID - 目录/文件 ID
   */
  remove(ID) {
    if (this.type === "directory") {
      this.dir.cd(ID).rm();
    } else {
      this.dir.peek(ID, type).rm();
    }
    this.pool.remove(parseInt(ID));
  }

  /**
   * 重命名目录/文件
   * @param {string} ID - 目录/文件 ID
   * @returns {directory|file} 重命名后的文件或目录
   */
  rename(ID) {
    let newID = this.pool.rename(ID).toString();
    if (this.type === "directory") {
      this.dir.cd(ID).mv(this.dir.cd(newID));
      return this.dir.cd(newID);
    } else {
      this.dir.peek(ID, type).mv(this.dir.peek(newID, type));
      return this.dir.peek(newID, type);
    }
  }
}

module.exports = {
  /**
   * 目录操作类
   */
  directory,
  /**
   * 文件操作类
   */
  file,
  /**
   * 随机文件名生成器
   */
  fileNameRandomPool,
  /**
   * 文件系统操作工具类
   */
  fp,
};
