/**
 * @file I/O 文件粒度性能测试
 * @module benchmarks/io-file-granularity
 * @description 对比多个小文件 vs 少量大文件的读写性能（node driver 路径）。
 * 在总数据量相同的前提下，通过参数化改变单个文件的大小，找到最优平衡点。
 */

import fs from "fs";
import os from "os";
import path from "path";

import { createNodeDriver } from "../src/io/driver/node.js";
import { bindRoot } from "../src/io/driver/io-driver.js";

/**
 * 创建单个原子单位
 * @param {number} id
 * @param {number} unitSize
 */
function createAtomicUnit(id, unitSize) {
  const padding = "x".repeat(Math.max(0, unitSize - 30)); // 留余地给 id 和其他字段
  return JSON.stringify({
    id,
    value: padding,
  });
}

/**
 * 创建测试数据目录结构
 * @param {Object} d - 绑定根目录的驱动窄接口
 * @param {string} scenario - 场景目录名
 * @param {number} unitsPerFile
 * @param {number} totalUnits
 * @param {number} unitSize
 * @returns {Promise<{ files: string[] }>} 场景内文件的相对路径列表
 */
async function setupScenario(d, scenario, unitsPerFile, totalUnits, unitSize) {
  await d.mkdir(scenario);
  const files = [];

  const fileCount = Math.ceil(totalUnits / unitsPerFile);

  for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
    const startUnit = fileIndex * unitsPerFile;
    const endUnit = Math.min(startUnit + unitsPerFile, totalUnits);
    const actualUnitsInFile = endUnit - startUnit;

    // 构造这个文件的内容
    let content;
    if (unitsPerFile === 1) {
      // 小文件场景：直接是一个单位
      content = createAtomicUnit(startUnit, unitSize);
    } else {
      // 大文件场景：是一个数组，包含 unitsPerFile 个单位
      const items = [];
      for (let unitOffset = 0; unitOffset < actualUnitsInFile; unitOffset++) {
        items.push(createAtomicUnit(startUnit + unitOffset, unitSize));
      }
      content = JSON.stringify(items);
    }

    const rel = `${scenario}/file-${fileIndex}.json`;
    await d.write(rel, content);
    files.push(rel);
  }

  return { files };
}

/**
 * 反转字符串
 * @param {string} str
 */
function reverseString(str) {
  return str.split("").reverse().join("");
}

/**
 * 基础测试：写入、读取
 * @param {string} name
 * @param {Object} d - 绑定根目录的驱动窄接口
 * @param {string[]} files - 文件相对路径列表
 * @param {number} iterations
 */
async function runBasicTest(name, d, files, iterations) {
  const startWrite = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    for (const rel of files) {
      await d.read(rel); // 触发读，确保写操作的实际成本
    }
  }
  const elapsed = Number(process.hrtime.bigint() - startWrite) / 1_000_000;
  const opsPerSecond = (iterations * files.length * 1000) / elapsed;
  const msPerOp = elapsed / (iterations * files.length);

  console.log(
    `  ${name}: ${opsPerSecond.toFixed(2)} ops/sec (${msPerOp.toFixed(4)} ms/op)`,
  );
}

/**
 * 修改测试：随机选取内容，反转后写回
 * @param {string} name
 * @param {Object} d - 绑定根目录的驱动窄接口
 * @param {string[]} files - 文件相对路径列表
 * @param {number} unitsPerFile
 * @param {number} iterations
 */
async function runModifyTest(name, d, files, unitsPerFile, iterations) {
  const startModify = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    // 随机选一个文件
    const fileIndex = Math.floor(Math.random() * files.length);
    const rel = files[fileIndex];

    const content = await d.read(rel);

    if (unitsPerFile === 1) {
      // 小文件：反转整个内容
      const reversed = reverseString(content);
      await d.write(rel, reversed);
    } else {
      // 大文件：解析数组，反转其中一个元素，再写回
      const items = JSON.parse(content);
      const itemIndex = Math.floor(Math.random() * items.length);
      items[itemIndex] = reverseString(items[itemIndex]);
      await d.write(rel, JSON.stringify(items));
    }
  }

  const elapsed = Number(process.hrtime.bigint() - startModify) / 1_000_000;
  const opsPerSecond = (iterations * 1000) / elapsed;
  const msPerOp = elapsed / iterations;

  console.log(
    `  ${name}: ${opsPerSecond.toFixed(2)} ops/sec (${msPerOp.toFixed(4)} ms/op)`,
  );
}

/**
 * 运行一组对比测试
 * @param {number} totalUnits
 * @param {number} unitSize
 * @param {string} label
 */
async function runGranularityComparison(totalUnits, unitSize, label) {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "hound-granularity-"));
  const driver = createNodeDriver(rootPath);
  const { rootId } = await driver.registerRoot(rootPath);
  const d = bindRoot(driver, rootId);

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`${label}（总 ${totalUnits} 个单位，每个 ${unitSize} 字符）`);
  console.log(`═══════════════════════════════════════════════════\n`);

  const results = [];

  // 测试多种配置：unitsPerFile 的值从 1 到 totalUnits
  // 根据 totalUnits 动态生成配置范围
  const maxConfig = totalUnits;
  const configsToTest = [];

  // 添加基础配置：1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000, 10000
  [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((config) => {
    if (config <= maxConfig) {
      configsToTest.push(config);
    }
  });

  for (const unitsPerFile of configsToTest) {
    const fileCount = Math.ceil(totalUnits / unitsPerFile);
    if (fileCount === 0) continue; // 跳过不合理的配置

    const scenario = `file-granularity-${unitsPerFile}`;
    console.log(
      `\n配置：${fileCount} 个文件，每个 ${unitsPerFile} 个单位（${(unitsPerFile * unitSize).toLocaleString()} 字符）`,
    );

    const { files } = await setupScenario(
      d,
      scenario,
      unitsPerFile,
      totalUnits,
      unitSize,
    );

    // 根据文件数调整迭代次数，大数据量测试使用更少迭代
    const baseFactor = totalUnits / 1000; // 1000 时系数为 1，10000 时系数为 10
    const readIterations = Math.max(10, Math.floor(1000 / (fileCount * baseFactor)));
    const modifyIterations = Math.max(5, Math.floor(500 / (fileCount * baseFactor)));

    await runBasicTest(`读取测试（${readIterations} 迭代）`, d, files, readIterations);
    await runModifyTest(
      `修改测试（${modifyIterations} 迭代）`,
      d,
      files,
      unitsPerFile,
      modifyIterations,
    );

    results.push({
      unitsPerFile,
      fileCount,
      bytesPerFile: unitsPerFile * unitSize,
    });

    // 清理这个场景的文件
    await d.rm(scenario);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("\n配置总结：");
  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│ 单位/文件 │ 文件数 │   单位大小    │   优化建议");
  console.log("├─────────────────────────────────────────────────┤");
  for (const r of results) {
    console.log(
      `│ ${r.unitsPerFile.toString().padEnd(9)} │ ${r.fileCount.toString().padEnd(6)} │ ${r.bytesPerFile.toString().padEnd(13)} │`,
    );
  }
  console.log("└─────────────────────────────────────────────────┘");

  // 清理根目录
  fs.rmSync(rootPath, { recursive: true, force: true });
}

console.log("开始 I/O 文件粒度性能对比...\n");

// 测试组 1: 1000 个单位，256 字符/单位
console.log("【测试组 1】");
await runGranularityComparison(1000, 256, "小数据量测试");

// 测试组 2: 10000 个单位，8192 字符/单位
console.log("\n\n【测试组 2】");
await runGranularityComparison(10000, 8192, "大数据量测试");

console.log("\n\n" + "═".repeat(55));
console.log("          所有文件粒度对比测试完成！");
console.log("═".repeat(55) + "\n");
