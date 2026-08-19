/**
 * @file hit 变更广播辅助
 * @description 向 TOOL_SWITCHER 与 SECONDARY_CHOOSER workflow 广播 hit:changed 信号。
 * @module demo/config/hit-changed-broadcast
 * @author Zhou Chenyu
 */

import { DEMO_WORKFLOW_NAMES } from "./constants.js";

/**
 * 向各工具 workflow 广播 hit 变更信号
 * @description 撤销/重做或远程文档变化后调用，让工具清理失效的对象引用。
 * @param {import("../../ui/components/orchestration/board.js").Board} board - 白板实例
 * @param {string} viewportId - 视口 id
 * @param {Object} [hitContext] - hit:changed 信号上下文
 * @returns {void}
 */
function broadcastHitChanged(board, viewportId, hitContext = {}) {
  const workflows = [
    DEMO_WORKFLOW_NAMES.TOOL_SWITCHER,
    DEMO_WORKFLOW_NAMES.SECONDARY_CHOOSER,
  ];
  for (const wf of workflows) {
    board.signalsEventBus.emit("input", {
      to: `/${viewportId}/workflows/${wf}`,
      signals: [{ type: "hit:changed", context: hitContext }],
    });
  }
}

export { broadcastHitChanged };
