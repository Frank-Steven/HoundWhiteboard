/**
 * @file I/O Direct 性能测试
 * @description 测量 node driver 直接文件 I/O 各操作的性能（不含桥接层开销）。
 * @module benchmarks/io-direct
 */

import fs from "fs";
import os from "os";
import path from "path";

import { createNodeDriver } from "../src/io/driver/node.js";
import { bindRoot } from "../src/io/driver/io-driver.js";
import { printHeader, printFooter, benchmarkAsync } from "./helpers.js";

const ITERATIONS = 2000;
const SCENARIO_ITERATIONS = 200;
const LARGE_DIRECTORY_FILE_COUNT = 400;
const LARGE_JSON_ITEM_COUNT = 2000;
const BURST_WRITE_COUNT = 20;
const ROUNDS = 5;

function createLargeJSONPayload(size) {
  return {
    meta: { type: "benchmark", size },
    objects: Array.from({ length: size }, (_, index) => ({
      id: index,
      x: index % 100,
      y: (index * 3) % 100,
      text: `object-${index}`,
      color: `#${(index % 255).toString(16).padStart(2, "0")}0000`,
    })),
  };
}

/**
 * 创建测试夹具：node driver 绑定临时根目录，预置小文件、大 JSON、大目录与突发写文件
 * @returns {Promise<Object>} 夹具（含绑定驱动与各相对路径）
 */
async function createFixture() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "hound-io-direct-"));
  const driver = createNodeDriver(rootPath);
  const { rootId } = await driver.registerRoot(rootPath);
  const d = bindRoot(driver, rootId);

  await d.mkdir("docs");
  await d.mkdir("large-dir");
  await d.write("docs/note.txt", "hello benchmark");
  await d.write("docs/config.json", JSON.stringify({ ok: true, size: 3 }));
  await d.write(
    "docs/large-config.json",
    JSON.stringify(createLargeJSONPayload(LARGE_JSON_ITEM_COUNT)),
  );
  await d.write("docs/burst.json", JSON.stringify({ ok: true, size: 0 }));
  for (let index = 0; index < LARGE_DIRECTORY_FILE_COUNT; index++) {
    await d.write(
      `large-dir/item-${index}.json`,
      JSON.stringify({ id: index, label: `item-${index}` }),
    );
  }
  return { rootPath, d };
}

/**
 * 销毁测试夹具
 * @param {string} rootPath - 临时根目录
 * @returns {void}
 */
function destroyFixture(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

printHeader("I/O Direct 性能测试");

// Direct read
{
  const fixture = await createFixture();
  await benchmarkAsync("Direct read", ITERATIONS, ROUNDS, async () => {
    await fixture.d.read("docs/note.txt");
  });
  destroyFixture(fixture.rootPath);
}

// Direct ls
{
  const fixture = await createFixture();
  await benchmarkAsync("Direct ls", ITERATIONS, ROUNDS, async () => {
    await fixture.d.ls("docs");
  });
  destroyFixture(fixture.rootPath);
}

// Direct write
{
  const fixture = await createFixture();
  let index = 0;
  await benchmarkAsync("Direct write", ITERATIONS, ROUNDS, async () => {
    await fixture.d.write(
      "docs/config.json",
      JSON.stringify({ ok: true, size: index++ % 10 }),
    );
  });
  destroyFixture(fixture.rootPath);
}

// Large directory ls
{
  const fixture = await createFixture();
  await benchmarkAsync(
    "Scenario Direct ls (400 files)",
    SCENARIO_ITERATIONS,
    ROUNDS,
    async () => {
      await fixture.d.ls("large-dir");
    },
  );
  destroyFixture(fixture.rootPath);
}

// Large JSON read + parse
{
  const fixture = await createFixture();
  await benchmarkAsync(
    "Scenario Direct read JSON (large)",
    SCENARIO_ITERATIONS,
    ROUNDS,
    async () => {
      JSON.parse(await fixture.d.read("docs/large-config.json"));
    },
  );
  destroyFixture(fixture.rootPath);
}

// Burst write
{
  const fixture = await createFixture();
  let index = 0;
  await benchmarkAsync(
    `Scenario Direct write burst (${BURST_WRITE_COUNT} writes)`,
    SCENARIO_ITERATIONS,
    ROUNDS,
    async () => {
      for (let writeIndex = 0; writeIndex < BURST_WRITE_COUNT; writeIndex++) {
        await fixture.d.write(
          "docs/burst.json",
          JSON.stringify({
            ok: true,
            size: index,
            writeIndex,
            payload: createLargeJSONPayload(50),
          }),
        );
      }
      index++;
    },
  );
  destroyFixture(fixture.rootPath);
}

printFooter();
