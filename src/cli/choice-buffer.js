// SPDX-License-Identifier: MIT

/**
 * @file choice buffer 持久化
 * @description 命名选择集合的读写；buffer 是 CLI 侧状态，落板目录 .cli-choices.json，不进操作日志。
 * @module cli/choice-buffer
 * @author Zhou Chenyu
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * choice buffer 文件名（板目录内）
 * @type {string}
 */
const CHOICE_BUFFER_FILE = ".cli-choices.json";

/**
 * buffer 文件的顶层形状
 * @typedef {Object} ChoiceBuffer
 * @property {Object<string, string[]>} choices - choice 名到对象 id 列表的映射
 */

/**
 * 读取板目录的 choice buffer
 * @param {string} boardRoot - 板目录
 * @returns {Promise<ChoiceBuffer>} buffer；文件缺失或损坏时返回空 buffer
 */
async function loadChoices(boardRoot) {
  try {
    const text = await fs.readFile(
      path.join(boardRoot, CHOICE_BUFFER_FILE),
      "utf-8",
    );
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.choices) {
      return { choices: { ...parsed.choices } };
    }
    return { choices: {} };
  } catch {
    return { choices: {} };
  }
}

/**
 * 原子写 choice buffer（临时文件 + rename，避免半截文件）
 * @param {string} boardRoot - 板目录
 * @param {ChoiceBuffer} buffer - buffer
 * @returns {Promise<void>}
 */
async function saveChoices(boardRoot, buffer) {
  const file = path.join(boardRoot, CHOICE_BUFFER_FILE);
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(buffer, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

/**
 * 登记一个 choice（同名覆盖；对象从其它 choice 移除，保证一个对象只属一个 choice）
 * @param {string} boardRoot - 板目录
 * @param {string} name - choice 名
 * @param {string[]} ids - 对象 id 列表
 * @returns {Promise<void>}
 */
async function setChoice(boardRoot, name, ids) {
  const buffer = await loadChoices(boardRoot);
  const idSet = new Set(ids);
  for (const [other, otherIds] of Object.entries(buffer.choices)) {
    if (other === name) continue;
    buffer.choices[other] = otherIds.filter((id) => !idSet.has(id));
    if (buffer.choices[other].length === 0) {
      delete buffer.choices[other];
    }
  }
  buffer.choices[name] = [...idSet];
  await saveChoices(boardRoot, buffer);
}

/**
 * 移除一个 choice
 * @param {string} boardRoot - 板目录
 * @param {string} name - choice 名
 * @returns {Promise<boolean>} 是否存在并被移除
 */
async function removeChoice(boardRoot, name) {
  const buffer = await loadChoices(boardRoot);
  if (!(name in buffer.choices)) return false;
  delete buffer.choices[name];
  await saveChoices(boardRoot, buffer);
  return true;
}

/**
 * 查找对象所属的 choice 名
 * @param {string} boardRoot - 板目录
 * @param {string} objectId - 对象 id
 * @returns {Promise<?string>} choice 名；不属于任何 choice 时为 null
 */
async function findChoiceOf(boardRoot, objectId) {
  const buffer = await loadChoices(boardRoot);
  for (const [name, ids] of Object.entries(buffer.choices)) {
    if (ids.includes(objectId)) return name;
  }
  return null;
}

export { loadChoices, saveChoices, setChoice, removeChoice, findChoiceOf };
