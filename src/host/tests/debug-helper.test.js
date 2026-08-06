import { handleDebugQuery } from "../debug-helper.js";
import { BoardApi } from "../../kernel/api/board-api.js";
import { BoardCore } from "../../kernel/board/board-core.js";
import { createDefaultAomRenderHooks } from "../../kernel/board/aom-render-hooks.js";
import { createDefaultPersistenceAdapter } from "../../kernel/board/persistence-adapter.js";
import { logBus } from "../../utils/log/log-bus.js";

function createBoardCore() {
  return new BoardCore({
    width: 800,
    height: 600,
    aomRenderHooks: createDefaultAomRenderHooks(),
    persistenceAdapter: createDefaultPersistenceAdapter(),
  });
}

function captureDebugEntries() {
  const entries = [];
  const handler = (entry) => {
    if (entry?.logger === "DebugHelper") entries.push(entry);
  };
  logBus.on("DEBUG", handler);
  return {
    entries,
    stop: () => logBus.off("DEBUG", handler),
  };
}

describe("debug-helper", () => {
  test("objectsDetail 应按字符串 id 查到对象而不是报 not found", () => {
    const boardCore = createBoardCore();
    const api = new BoardApi(boardCore);

    api.createObject("StrokeObject", {
      id: "1",
      position: { x: 0, y: 0 },
      property: { width: 2 },
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    });
    api.commitObjects(["1"]);

    const capture = captureDebugEntries();
    try {
      handleDebugQuery(boardCore, "objectsDetail", { objectIds: ["1"] });
    } finally {
      capture.stop();
    }

    const detailEntry = capture.entries.find((entry) =>
      entry.args?.some(
        (arg) => Array.isArray(arg) && arg.length > 0 && arg[0]?.id === "1",
      ),
    );
    expect(detailEntry).toBeDefined();

    const details = detailEntry.args.find(Array.isArray);
    expect(details[0].error).toBeUndefined();
    expect(details[0].type).toBe("StrokeObject");
  });
});
