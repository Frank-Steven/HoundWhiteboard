#!/usr/bin/env node

/**
 * @file kernel 许可证头检查
 * @description 扫描 src/kernel 下所有 .js 文件，验证包含 SPDX-License-Identifier: MIT。
 * @module scripts/ci/check-kernel-license
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.HOUND_BUILD_ROOT || path.resolve(__dirname, "../..");
const KERNEL_DIR = path.join(ROOT, "src", "kernel");
const TAG = "SPDX-License-Identifier: MIT";

let checked = 0;
const missing = [];

/**
 * 递归收集所有 .js 文件
 * @param {string} dir
 * @returns {string[]}
 */
function collectJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

for (const file of collectJsFiles(KERNEL_DIR)) {
  checked++;
  const content = fs.readFileSync(file, "utf-8");
  if (!content.includes(TAG)) {
    missing.push(path.relative(ROOT, file));
  }
}

if (missing.length > 0) {
  console.error(
    `\n✗ kernel 许可证头检查失败 — ${missing.length}/${checked} 个文件缺少 ${TAG}:\n`,
  );
  for (const file of missing) {
    console.error(`  ${file}`);
  }
  process.exit(1);
} else {
  console.log(
    `✓ kernel 许可证头检查通过 — ${checked} 个文件均含 SPDX-License-Identifier: MIT`,
  );
}
