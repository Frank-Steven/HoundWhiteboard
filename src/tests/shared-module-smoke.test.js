/** @jest-environment node */

/**
 * @file shared module smoke test
 * @description 验证共享模块在 Node 环境下可被 import，且无 DOM/Worker/Tauri IPC 隐式依赖。
 * @author Zhou Chenyu
 */

/**
 * 共享模块导入路径集合
 * @type {string[]}
 */
const SHARED_MODULE_PATHS = [
  "../kernel/range/index.js",
  "../kernel/utils/math.js",
  "../kernel/utils/math-algorithm.js",
  "../kernel/utils/chain.js",
  "../renderers/canvas/render-scheduler.js",
  "../renderers/canvas/renderer.js",
  "../renderers/canvas/dirty-rect-strategy-shared.js",
  "../kernel/types/types.js",
  "../kernel/types/board-api-types.js",
  "../kernel/types/message-types.js",
];

describe("Shared module smoke test", () => {
  test.each(SHARED_MODULE_PATHS)(
    "%s 应可在 Node 环境中导入",
    async (modulePath) => {
      await expect(import(modulePath)).resolves.toBeDefined();
    },
  );
});
