/**
 * @file whiteboard demo 浏览器入口
 * @description 初始化 whiteboard demo 页面，装配 board/viewport/worker、demo 配置与 DOM 适配器。
 * @module demo/whiteboard
 * @author Zhou Chenyu
 */

import { Vector } from "../kernel/utils/math.js";
import { Board } from "../ui/components/orchestration/board.js";
import { createConsolePrinter, logBus } from "../utils/log/index.js";
import {
  configureWhiteboardDemo,
  mountToolSwitcher,
} from "./config/whiteboard-demo.js";
import { resolveDeviceSource } from "../utils/device-identity.js";
import { DemoLog } from "./config/log.js";
import { ViewportTool } from "./config/viewport-tool.js";
import {
  attachHistoryAdapter,
  attachKeyboardAdapter,
  attachPointerAdapter,
  attachResizeAdapter,
  attachToolbarAdapter,
  attachWheelAdapter,
} from "./config/dom-adapters.js";

// Demo 独立入口，需要手动注册控制台输出器
createConsolePrinter(logBus, { timestamps: true });

/**
 * 启动 whiteboard demo 页面
 * @returns {Promise<void>}
 */
async function bootstrapWhiteboard() {
  // demo 板目录：家目录下 hound-whiteboard/demo-board（首次运行自动创建）
  // 同步中继：URL ?relay= 或 localStorage hwb-relay（双开时第二窗口用 localStorage 设不同值）
  // 身份：URL ?source= 或 localStorage hwb-source（同机双开需不同身份）
  // 板副本：URL ?board=（双开时第二窗口用不同路径，各自持久化副本）
  const query = new URLSearchParams(globalThis.location?.search ?? "");
  const storage = globalThis.localStorage;
  const relayUrl =
    query.get("relay") ?? storage?.getItem?.("hwb-relay") ?? undefined;
  const sourceOverride =
    query.get("source") ?? storage?.getItem?.("hwb-source") ?? undefined;
  const boardPath =
    query.get("board") ?? storage?.getItem?.("hwb-board") ?? undefined;
  const board = new Board({
    idSource: sourceOverride ?? resolveDeviceSource(),
    rootPath: boardPath ?? "~/hound-whiteboard/demo-board",
    syncUrl: relayUrl,
    boardId: "demo-board",
  });
  board.width = 800;
  board.height = 600;

  const appLeft = document.getElementById("app-left");
  const foregroundLayer = document.getElementById("app-foreground-layer");
  if (!appLeft || !foregroundLayer) {
    throw new Error("whiteboard demo root elements not found.");
  }

  const worker = new Worker(
    new URL("../host/core-worker.js", import.meta.url),
    { type: "module" },
  );

  try {
    await board.enableWorkerMode(worker);
  } catch (error) {
    worker.terminate?.();
    throw error;
  }

  const viewport = board.createViewport(
    foregroundLayer,
    {
      width: appLeft.clientWidth,
      height: window.innerHeight,
    },
    "viewport",
  );
  viewport.zoom = 1.0;
  viewport.origin = new Vector(0, 0);
  viewport.canvas.tabIndex = 0;

  const demoLog = new DemoLog();

  demoLog.status("运行模式", "Worker");
  demoLog.status(
    "左键工具",
    "工具栏切换：笔画 | 圆 | 选择+修改",
  );
  demoLog.status("右键工具", "矩形框选 -> 修改对象");
  demoLog.status("空格工具", "随机圆对象");
  demoLog.status("视口快捷键", "方向键平移，+/- 缩放，R 全屏刷新");

  const viewportTool = new ViewportTool({
    onViewportChange(targetViewport) {
      demoLog.status("视口状态", {
        origin: targetViewport.origin.serialize(),
        zoom: targetViewport.zoom,
      });
    },
    onFlush(targetViewport) {
      demoLog.status("视口全屏刷新", {
        origin: targetViewport.origin.serialize(),
        zoom: targetViewport.zoom,
      });
    },
  });

  const demoResults = configureWhiteboardDemo(board, viewport, { viewportTool });

  const toolbar = attachToolbarAdapter(board, viewport);
  if (toolbar) {
    mountToolSwitcher(viewport, {
      tools: toolbar.tools,
      defaultTool: toolbar.defaultTool,
      primaryStrokeTool: demoResults.primaryStrokeTool,
    });
  }

  attachPointerAdapter(viewport, board, demoLog);
  attachKeyboardAdapter(viewport, board, demoLog, toolbar?.tools);
  attachHistoryAdapter(board, viewport);
  attachResizeAdapter(viewport, appLeft);
  attachWheelAdapter(viewport, board, appLeft);

  viewport.canvas.focus();
}

void bootstrapWhiteboard().catch((error) => {
  console.error("[whiteboard] Failed to bootstrap whiteboard demo:", error);
});
