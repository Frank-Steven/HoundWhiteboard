import { DevicesDAG, createSubDAG } from "../index.js";
import { createMouseDevice } from "../mouse-device.js";
import { createEdgePrefix } from "../../prefixes/index.js";
import { Tool } from "../../tools/tool.js";

/**
 * 创建通道报告 prefix handler — 拦截信号并报告通道名
 * @param {string} channel
 * @returns {{ handler: Function }}
 */
function createChannelReporter(channel) {
  return {
    handler(packet) {
      return {
        stop: true,
        packets: [
          {
            to: "",
            signals: [
              {
                type: `${channel}-routed`,
                context: {
                  channel,
                  signals: packet.signals,
                },
              },
            ],
          },
        ],
      };
    },
  };
}

/**
 * 在所有鼠标通道节点上挂载报告 prefix（替代旧 processor options）
 * @param {DevicesDAG} dag
 * @param {string} mouseBasePath
 */
function mountChannelReporters(dag, mouseBasePath) {
  for (const channel of [
    "pointer",
    "primary",
    "secondary",
    "auxiliary",
    "wheel",
  ]) {
    const prefix = createEdgePrefix(createChannelReporter(channel));
    dag.mountSubDAG(
      `${mouseBasePath}/${channel}`,
      { ...prefix, rootPath: "/default" },
      {},
    );
  }
}

function toPlainPackets(packets) {
  return packets.map((packet) => ({
    to: packet.to,
    signals: packet.signals,
  }));
}

describe("mouse-device", () => {
  test("普通移动应路由到 pointer 节点", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    const mountedNodes = dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    const result = dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "position",
          context: { value: { x: 10, y: 20 }, buttons: 0, button: 0 },
        },
      ],
    });

    expect(mountedNodes.map((node) => dag.getNodePath(node))).toEqual([
      "/viewport/mouse",
      "/viewport/mouse/pointer",
      "/viewport/mouse/primary",
      "/viewport/mouse/secondary",
      "/viewport/mouse/auxiliary",
      "/viewport/mouse/wheel",
    ]);
    expect(mouseDevice.getState()).toEqual({
      activeButtons: {
        primary: false,
        secondary: false,
        auxiliary: false,
      },
      lastPosition: { x: 10, y: 20 },
      lastWheelDelta: null,
    });
    expect(toPlainPackets(result.packets)).toEqual([
      {
        to: "",
        signals: [
          {
            type: "pointer-routed",
            context: {
              channel: "pointer",
              signals: [
                {
                  type: "position",
                  context: { value: { x: 10, y: 20 }, buttons: 0, button: 0 },
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  test("左键与右键可同时激活，并聚合路由到多个按钮节点", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    const result = dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "position",
          context: { value: { x: 10, y: 20 }, buttons: 3, button: 2 },
        },
      ],
    });

    expect(
      toPlainPackets(result.packets)
        .map((packet) => packet.signals[0].type)
        .sort(),
    ).toEqual(["pointer-routed", "primary-routed", "secondary-routed"]);

    expect(mouseDevice.getState()).toEqual({
      activeButtons: {
        primary: true,
        secondary: true,
        auxiliary: false,
      },
      lastPosition: { x: 10, y: 20 },
      lastWheelDelta: null,
    });
  });

  test("扇出到多个通道时各分支的 signals 数组相互独立", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    const result = dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "position",
          context: { value: { x: 10, y: 20 }, buttons: 3, button: 2 },
        },
      ],
    });

    // 通道报告 prefix 把各自收到的 signals 数组记入 context.signals
    const branchArrays = result.packets.map(
      (packet) => packet.signals[0].context.signals,
    );
    expect(branchArrays.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < branchArrays.length; i++) {
      // 内容一致但数组引用互不相同（任一分支修改不影响兄弟分支）
      expect(branchArrays[i]).toEqual(branchArrays[0]);
      expect(branchArrays[i]).not.toBe(branchArrays[0]);
    }
  });

  test("按住主键时滚轮事件应同时路由到 primary 和 wheel 节点", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "position",
          context: { value: { x: 10, y: 20 }, buttons: 1, button: 0 },
        },
      ],
    });

    const result = dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "wheel",
          context: {
            deltaX: 0,
            deltaY: -120,
            deltaZ: 0,
            buttons: 1,
            button: 0,
          },
        },
      ],
    });

    expect(
      toPlainPackets(result.packets)
        .map((packet) => packet.signals[0].type)
        .sort(),
    ).toEqual(["primary-routed", "wheel-routed"]);

    expect(mouseDevice.getState()).toEqual({
      activeButtons: {
        primary: true,
        secondary: false,
        auxiliary: false,
      },
      lastPosition: { x: 10, y: 20 },
      lastWheelDelta: {
        deltaX: 0,
        deltaY: -120,
        deltaZ: 0,
      },
    });
  });

  test("主键抬起时应继续把结束包路由到 primary，同时保留其它激活键", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "position",
          context: { value: { x: 15, y: 30 }, buttons: 3, button: 2 },
        },
      ],
    });

    const releaseResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        {
          type: "position",
          context: { value: { x: 18, y: 36 }, buttons: 2, button: 0 },
        },
        {
          type: "end",
          context: { button: 0, buttons: 2 },
        },
      ],
    });

    expect(mouseDevice.getState()).toEqual({
      activeButtons: {
        primary: false,
        secondary: true,
        auxiliary: false,
      },
      lastPosition: { x: 18, y: 36 },
      lastWheelDelta: null,
    });
    expect(
      toPlainPackets(releaseResult.packets)
        .map((packet) => packet.signals[0].type)
        .sort(),
    ).toEqual(["pointer-routed", "primary-routed", "secondary-routed"]);
  });

  test("松左键的 end 仅路由到 primary，不泄漏到仍在按住的 secondary", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    // 按住右键，再按下左键
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 2, button: 2 } },
      ],
    });
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 2, y: 2 }, buttons: 3, button: 0 } },
      ],
    });

    // 松左键（右键仍按住）
    const releaseResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "end", context: { button: 0, buttons: 2 } }],
    });

    expect(
      toPlainPackets(releaseResult.packets).map((packet) => packet.signals[0].type),
    ).toEqual(["primary-routed"]);
  });

  test("松右键的 end 仅路由到 secondary，不泄漏到仍在按住的 primary（对称场景）", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    // 按住左键，再按下右键
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 1, button: 0 } },
      ],
    });
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 2, y: 2 }, buttons: 3, button: 2 } },
      ],
    });

    // 松右键（左键仍按住）
    const releaseResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "end", context: { button: 2, buttons: 1 } }],
    });

    expect(
      toPlainPackets(releaseResult.packets).map((packet) => packet.signals[0].type),
    ).toEqual(["secondary-routed"]);
  });

  test("双键依次松开时各 end 分别归属各自通道", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 1, button: 0 } },
      ],
    });
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 2, y: 2 }, buttons: 3, button: 2 } },
      ],
    });

    const releasePrimary = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "end", context: { button: 0, buttons: 2 } }],
    });
    const releaseSecondary = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "end", context: { button: 2, buttons: 0 } }],
    });

    expect(
      toPlainPackets(releasePrimary.packets).map((packet) => packet.signals[0].type),
    ).toEqual(["primary-routed"]);
    expect(
      toPlainPackets(releaseSecondary.packets).map((packet) => packet.signals[0].type),
    ).toEqual(["secondary-routed"]);
  });

  test("无按钮信息的 end 应广播到所有活跃通道", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    // 双键按住
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 3, button: 0 } },
      ],
    });

    // pointerleave 风格：button=-1，无通道归属
    const leaveResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "end", context: { button: -1, buttons: 3 } }],
    });

    expect(
      toPlainPackets(leaveResult.packets)
        .map((packet) => packet.signals[0].type)
        .sort(),
    ).toEqual(["primary-routed", "secondary-routed"]);
  });

  test("cancel 与 end 一样按按钮归属路由", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 3, button: 0 } },
      ],
    });

    const cancelResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "cancel", context: { button: 2, buttons: 1 } }],
    });

    expect(
      toPlainPackets(cancelResult.packets).map((packet) => packet.signals[0].type),
    ).toEqual(["secondary-routed"]);
  });

  test("未派发 pointerup 时，按钮掩码 1→0 跳变应合成 end 到对应通道", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    // 按住右键，再按下左键
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 2, button: 2 } },
      ],
    });
    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 2, y: 2 }, buttons: 3, button: 0 } },
      ],
    });

    // 左键松开但浏览器未派发 pointerup：下一个移动事件 buttons 已变 2
    const moveResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 3, y: 3 }, buttons: 2, button: -1 } },
      ],
    });

    // primary 收到 position + 合成 end；secondary 只收到 position
    const primaryReport = moveResult.packets.find(
      (p) => p.signals[0].type === "primary-routed",
    );
    const secondaryReport = moveResult.packets.find(
      (p) => p.signals[0].type === "secondary-routed",
    );
    expect(
      primaryReport.signals[0].context.signals.map((s) => s.type),
    ).toEqual(["position", "end"]);
    expect(
      secondaryReport.signals[0].context.signals.map((s) => s.type),
    ).toEqual(["position"]);
    // 合成 end 携带归属按钮与 synthetic 标记
    const synthesizedEnd = primaryReport.signals[0].context.signals.find(
      (s) => s.type === "end",
    );
    expect(synthesizedEnd.context).toMatchObject({ button: 0, buttons: 2 });
  });

  test("显式 end 已覆盖的通道不重复合成", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();

    dag.mountSubDAG("/viewport", mouseDevice);
    mountChannelReporters(dag, "/viewport/mouse");

    dag.dispatch({
      to: "/viewport/mouse",
      signals: [
        { type: "position", context: { value: { x: 1, y: 1 }, buttons: 1, button: 0 } },
      ],
    });

    const releaseResult = dag.dispatch({
      to: "/viewport/mouse",
      signals: [{ type: "end", context: { button: 0, buttons: 0 } }],
    });

    const primaryReport = releaseResult.packets.find(
      (p) => p.signals[0].type === "primary-routed",
    );
    expect(
      primaryReport.signals[0].context.signals.map((s) => s.type),
    ).toEqual(["end"]);
  });

  test("可同时把同一包交给多个注入处理器", () => {
    const dag = new DevicesDAG();
    const mouseDevice = createMouseDevice();
    class MappingTool extends Tool {
      constructor(type) {
        super();
        this.type = type;
      }

      process(signalPacket, deviceContext) {
        this.lastCall = { signalPacket, deviceContext };
      }

      createProcessor() {
        return (packet, context) => ({
          to: "",
          signals: [
            {
              type: this.type,
              context: { from: context.path },
            },
          ],
        });
      }

      reset() { }
    }

    dag.mountSubDAG("/viewport", mouseDevice);
    dag.mountWorkflow(
      "/viewport/workflows/pointer-handled",
      new MappingTool("pointer-handled"),
    );
    dag.addEdge(
      "/viewport/mouse/pointer",
      "default",
      "/viewport/workflows/pointer-handled",
    );
    dag.mountWorkflow(
      "/viewport/workflows/primary-handled",
      new MappingTool("primary-handled"),
    );
    dag.addEdge(
      "/viewport/mouse/primary",
      "default",
      "/viewport/workflows/primary-handled",
    );
    dag.mountWorkflow(
      "/viewport/workflows/wheel-handled",
      new MappingTool("wheel-handled"),
    );
    dag.addEdge(
      "/viewport/mouse/wheel",
      "default",
      "/viewport/workflows/wheel-handled",
    );

    expect(
      toPlainPackets(
        dag.dispatch({
          to: "/viewport/mouse",
          signals: [
            {
              type: "position",
              context: { value: { x: 3, y: 4 }, buttons: 1, button: 0 },
            },
            {
              type: "wheel",
              context: {
                deltaX: 0,
                deltaY: 8,
                deltaZ: 0,
                buttons: 1,
                button: 0,
              },
            },
          ],
        }).packets,
      )
        .map((packet) => packet.signals[0].type)
        .sort(),
    ).toEqual(["pointer-handled", "primary-handled", "wheel-handled"]);
  });
});
