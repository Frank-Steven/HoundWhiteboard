/**
 * @file IO invoke 转发器测试
 * @author Zhou Chenyu
 */

import { attachIoInvokeForwarder } from "../io-invoke-forwarder.js";

/**
 * 创建假端点
 * @returns {Object} 端点与已发送消息列表
 */
function createFakeEndpoint() {
  const posted = [];
  const listeners = new Set();
  return {
    posted,
    postMessage(message) {
      posted.push(message);
    },
    addEventListener(type, handler) {
      if (type === "message") listeners.add(handler);
    },
    removeEventListener(type, handler) {
      if (type === "message") listeners.delete(handler);
    },
    emit(message) {
      for (const handler of listeners) handler({ data: message });
    },
  };
}

describe("attachIoInvokeForwarder", () => {
  test("io-invoke 经注入 invoke 执行后回传 io-response", async () => {
    const endpoint = createFakeEndpoint();
    const detach = attachIoInvokeForwarder(endpoint, async (command, args) => {
      if (command === "safe_io_fs_read") return `内容:${args.relPath}`;
      throw new Error(`unknown ${command}`);
    });

    endpoint.emit({ type: "io-invoke", msgId: "io-1", command: "safe_io_fs_read", args: { relPath: "a.json" } });
    await new Promise((r) => setTimeout(r, 0));

    expect(endpoint.posted).toEqual([
      { type: "io-response", msgId: "io-1", ok: true, result: "内容:a.json" },
    ]);
    detach();
  });

  test("invoke 抛错回传 ok:false", async () => {
    const endpoint = createFakeEndpoint();
    attachIoInvokeForwarder(endpoint, async () => {
      throw new Error("权限不足");
    });

    endpoint.emit({ type: "io-invoke", msgId: "io-2", command: "x", args: {} });
    await new Promise((r) => setTimeout(r, 0));

    expect(endpoint.posted[0].ok).toBe(false);
    expect(endpoint.posted[0].error).toBe("权限不足");
  });

  test("非 io-invoke 消息不响应；卸接后不再响应", async () => {
    const endpoint = createFakeEndpoint();
    const detach = attachIoInvokeForwarder(endpoint, async () => "x");

    endpoint.emit({ type: "rpc-response", msgId: "r1" });
    await new Promise((r) => setTimeout(r, 0));
    expect(endpoint.posted).toHaveLength(0);

    detach();
    endpoint.emit({ type: "io-invoke", msgId: "io-3", command: "x", args: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(endpoint.posted).toHaveLength(0);
  });
});
