/**
 * @file 鼠标设备
 * @description 提供鼠标输入信号的设备图节点创建与处理接口。
 * @module ui/devices-dag/devices/mouse-device
 * @author Zhou Chenyu
 */

import { createSubDAG, SignalPacket } from "../index.js";
import { DEVICE_DEFAULT_ROUTE } from "./constant.js";

/**
 * 创建一张鼠标设备子图
 * @description
 * 五个通道路由节点（pointer / primary / secondary / auxiliary / wheel）
 * 均只设 defaultRoute = "default"，不再接受外部 processor 定制。
 * @returns {import("../dag-type.js").SubDAGDefinition & {
 *   resetState: () => void,
 *   getState: () => {
 *     activeButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
 *     lastPosition: any,
 *     lastWheelDelta: {deltaX: number, deltaY: number, deltaZ: number}|null,
 *   },
 * }}
 * @author Zhou Chenyu
 */
function createMouseDevice() {
  let activeButtons = {
    primary: false,
    secondary: false,
    auxiliary: false,
  };
  let lastPosition = null;
  let lastWheelDelta = null;

  /**
   * 复制位置值，避免把可变对象直接暴露到设备外部
   * @param {any} position - 原始位置值
   * @returns {any}
   */
  const clonePosition = (position) => {
    if (position && typeof position === "object") {
      return Array.isArray(position) ? [...position] : { ...position };
    }
    return position;
  };

  /**
   * 鼠标按钮位掩码表
   * @type {{primary: number, secondary: number, auxiliary: number}}
   */
  const BUTTON_MASKS = {
    primary: 1,
    secondary: 2,
    auxiliary: 4,
  };

  /**
   * 将按钮编号映射为设备内部通道名
   * @param {number|string} button - DOM 或业务侧按钮编号
   * @returns {"primary"|"secondary"|"auxiliary"|null}
   */
  const buttonIndexToChannel = (button) => {
    if (button === 0 || button === "primary") return "primary";
    if (button === 2 || button === "secondary") return "secondary";
    if (button === 1 || button === "middle" || button === "auxiliary") {
      return "auxiliary";
    }
    return null;
  };

  /**
   * 根据 buttons 位掩码推导当前按钮状态
   * @param {number} buttonsValue - DOM buttons 位掩码
   * @param {{primary: boolean, secondary: boolean, auxiliary: boolean}} [fallback=activeButtons] - 无法解析时的回退状态
   * @returns {{primary: boolean, secondary: boolean, auxiliary: boolean}}
   */
  const getButtonsState = (buttonsValue, fallback = activeButtons) => {
    if (typeof buttonsValue !== "number") {
      return { ...fallback };
    }
    return {
      primary: (buttonsValue & BUTTON_MASKS.primary) === BUTTON_MASKS.primary,
      secondary:
        (buttonsValue & BUTTON_MASKS.secondary) === BUTTON_MASKS.secondary,
      auxiliary:
        (buttonsValue & BUTTON_MASKS.auxiliary) === BUTTON_MASKS.auxiliary,
    };
  };

  /**
   * 获取设备当前状态快照
   * @returns {{
   *   activeButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   *   lastPosition: any,
   *   lastWheelDelta: {deltaX: number, deltaY: number, deltaZ: number}|null,
   * }}
   */
  const getState = () => ({
    activeButtons: { ...activeButtons },
    lastPosition: clonePosition(lastPosition),
    lastWheelDelta: lastWheelDelta ? { ...lastWheelDelta } : null,
  });

  /**
   * 根据输入包更新鼠标设备的内部状态
   * @param {SignalPacket} packet - 当前信号包
   * @returns {{
   *   previousButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   *   nextButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   *   endedChannels: Set<string>,
   * }}
   */
  const updateStateFromPacket = (packet) => {
    const previousButtons = { ...activeButtons };
    let nextButtons = { ...activeButtons };
    const endedChannels = new Set();

    for (const signal of packet.signals) {
      if (signal.type === "position" || signal.type === "wheel") {
        const position = signal?.context?.value ?? signal?.context?.position;
        if (position !== undefined && position !== null) {
          lastPosition = clonePosition(position);
        }

        nextButtons = getButtonsState(signal?.context?.buttons, nextButtons);

        if (signal.type === "wheel") {
          lastWheelDelta = {
            deltaX: signal?.context?.deltaX ?? 0,
            deltaY: signal?.context?.deltaY ?? 0,
            deltaZ: signal?.context?.deltaZ ?? 0,
          };
        }
      }

      if (signal.type === "end" || signal.type === "cancel") {
        nextButtons = getButtonsState(signal?.context?.buttons, nextButtons);
        const endedChannel = buttonIndexToChannel(signal?.context?.button);
        if (endedChannel) {
          nextButtons[endedChannel] = false;
          endedChannels.add(endedChannel);
        }
      }
    }

    activeButtons = nextButtons;
    return { previousButtons, nextButtons, endedChannels };
  };

  /**
   * 解析当前输入包应继续路由到哪些子节点
   * @description
   * 按信号类型拆分路由，各通道只收到属于自己的信号列表：
   * - `position` → pointer 通道 + 活跃按钮通道
   * - `wheel` → wheel 通道 + 活跃按钮通道
   * - `end` / `cancel` → 仅 `context.button` 归属的通道
   *   （避免误伤其他仍按住按钮的手势）；无按钮信息时（如 pointerleave / blur）
   *   广播到所有活跃通道，保留“终结全部手势”的兑底语义
   * - 其他类型 → 活跃按钮通道
   * @param {SignalPacket} packet - 当前信号包
   * @param {{
   *   previousButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   *   nextButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   *   endedChannels: Set<string>,
   * }} routeState - 路由决策所需的状态快照
   * @returns {Array<{to: string, signals: Array<Object>}>}
   */
  const resolveRouteTargets = (packet, routeState) => {
    const positionSignals = [];
    const wheelSignals = [];
    const endLikeSignals = [];
    const otherSignals = [];

    for (const signal of packet.signals) {
      if (signal.type === "position") {
        positionSignals.push(signal);
      } else if (signal.type === "wheel") {
        wheelSignals.push(signal);
      } else if (signal.type === "end" || signal.type === "cancel") {
        endLikeSignals.push(signal);
      } else {
        otherSignals.push(signal);
      }
    }

    /** @type {Map<string, Array<Object>>} 通道路径 → 拆分后的信号列表 */
    const targets = new Map();

    /**
     * 向指定通道追加信号
     * @param {string} path - 通道路径
     * @param {Array<Object>} signals - 信号列表
     * @returns {void}
     */
    const append = (path, signals) => {
      if (signals.length === 0) return;
      const existing = targets.get(path);
      if (existing) {
        existing.push(...signals);
      } else {
        targets.set(path, [...signals]);
      }
    };

    // pointer / wheel 通道只接收对应类型的信号
    append("pointer", positionSignals);
    append("wheel", wheelSignals);

    const channelPaths = {
      primary: "primary",
      secondary: "secondary",
      auxiliary: "auxiliary",
    };

    /**
     * 判断按钮通道当前是否活跃（按住中或本包刚按下）
     * @param {string} channel - 通道名
     * @returns {boolean}
     */
    const isChannelActive = (channel) =>
      routeState.previousButtons[channel] || routeState.nextButtons[channel];

    // 活跃按钮通道接收 position / wheel / 其他类型信号
    for (const [channel, path] of Object.entries(channelPaths)) {
      if (!isChannelActive(channel)) continue;
      append(path, positionSignals);
      append(path, wheelSignals);
      append(path, otherSignals);
    }

    // end/cancel 按按钮归属路由；无归属的广播到活跃通道
    const broadcastEndLikes = endLikeSignals.filter(
      (signal) => buttonIndexToChannel(signal?.context?.button) === null,
    );
    for (const [channel, path] of Object.entries(channelPaths)) {
      const ownEndLikes = endLikeSignals.filter(
        (signal) => buttonIndexToChannel(signal?.context?.button) === channel,
      );
      append(path, ownEndLikes);
      if (isChannelActive(channel) || ownEndLikes.length > 0) {
        append(path, broadcastEndLikes);
      }
    }

    return Array.from(targets.entries()).map(([childPath, signals]) => ({
      to: childPath,
      signals,
    }));
  };

  /**
   * 解析显式指定的下行目标，保留调用方已经选定的子路径。
   * @param {SignalPacket} packet
   * @param {{ path?: string }} [ctx={}]
   * @returns {string}
   */
  const resolveExplicitDescendantPath = (packet, ctx = {}) => {
    const packetTo = typeof packet?.to === "string" ? packet.to : "";
    const currentPath = typeof ctx?.path === "string" ? ctx.path : "";
    if (!packetTo) return "";
    if (!packetTo.startsWith("/")) return packetTo;
    if (!currentPath || packetTo === currentPath) return "";
    const prefix = `${currentPath}/`;
    return packetTo.startsWith(prefix) ? packetTo.slice(prefix.length) : "";
  };

  /**
   * 按钮通道与按钮编号的映射（路由与合成共用）
   * @type {Object<string, number>}
   */
  const CHANNEL_BUTTONS = {
    primary: 0,
    secondary: 2,
    auxiliary: 1,
  };

  /**
   * 为按钮位掩码 1→0 跳变但未被显式 end/cancel 覆盖的通道合成 end 信号
   * @description
   * 某些环境（如多键同按时 WebView2/浏览器不逐键派发 pointerup）下，
   * 适配器无法为每次按钮释放翻译出 end 信号，手势因此永远不结束。
   * 设备以按钮状态机的 1→0 跳变为准自行合成 end：
   * 只要某个按键松开了（无论事件源是否派发 pointerup），就向对应通道发 end。
   * 已被包内显式 end/cancel（含无归属广播）覆盖的通道不重复合成。
   * @param {SignalPacket} packet - 当前信号包
   * @param {{
   *   previousButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   *   nextButtons: {primary: boolean, secondary: boolean, auxiliary: boolean},
   * }} routeState - 路由决策所需的状态快照
   * @returns {SignalPacket} 补齐合成 end 后的信号包（无合成时返回原包）
   */
  const withSynthesizedEnds = (packet, routeState) => {
    // 已被显式 end/cancel 覆盖的通道
    const coveredChannels = new Set();
    let hasBroadcastEnd = false;
    for (const signal of packet.signals) {
      if (signal.type !== "end" && signal.type !== "cancel") continue;
      const channel = buttonIndexToChannel(signal?.context?.button);
      if (channel) {
        coveredChannels.add(channel);
      } else {
        hasBroadcastEnd = true;
      }
    }

    const nextMask =
      (routeState.nextButtons.primary ? BUTTON_MASKS.primary : 0) |
      (routeState.nextButtons.secondary ? BUTTON_MASKS.secondary : 0) |
      (routeState.nextButtons.auxiliary ? BUTTON_MASKS.auxiliary : 0);

    const synthesized = [];
    for (const [channel, buttonIndex] of Object.entries(CHANNEL_BUTTONS)) {
      const wasPressed = routeState.previousButtons[channel];
      const isPressed = routeState.nextButtons[channel];
      if (!wasPressed || isPressed) continue; // 无 1→0 跳变
      if (coveredChannels.has(channel) || hasBroadcastEnd) continue; // 已被覆盖
      synthesized.push({
        type: "end",
        context: { button: buttonIndex, buttons: nextMask, synthetic: true },
      });
    }

    if (synthesized.length === 0) return packet;
    return new SignalPacket(packet.to, [...packet.signals, ...synthesized]);
  };

  /**
   * 根节点处理器
   * @description
   * 1. 将 position 信号的 canvas 相对坐标转为世界坐标
   * 2. 更新设备内部状态（按钮掩码、最近位置）
   * 3. 为按钮位掩码 1→0 跳变合成缺失的 end 信号（见 {@link withSynthesizedEnds}）
   * 4. 按按钮状态分流到对应的通道路由节点
   * @param {SignalPacket|Object} signalPacket - 输入信号包
   * @param {Object} [context={}] - handler context（含 services.viewport）
   * @returns {Array<SignalPacket|Object>}
   */
  const rootHandler = (signalPacket, context = {}) => {
    const packet = SignalPacket.from(signalPacket, { defaultTo: "/" });

    const viewport = context?.services?.viewport;
    const convertedSignals =
      viewport && typeof viewport.convertCanvasSignalsToWorld === "function"
        ? viewport.convertCanvasSignalsToWorld(packet.signals)
        : packet.signals;

    const convertedPacket = new SignalPacket(packet.to, convertedSignals);
    const routeState = updateStateFromPacket(convertedPacket);
    const routedPacket = withSynthesizedEnds(convertedPacket, routeState);
    const nextPackets = resolveRouteTargets(routedPacket, routeState);
    const explicitDescendantPath = resolveExplicitDescendantPath(
      convertedPacket,
      context,
    );
    if (
      explicitDescendantPath &&
      !nextPackets.some((entry) => entry.to === explicitDescendantPath)
    ) {
      nextPackets.push({
        to: explicitDescendantPath,
        // 浅拷贝信号数组，避免下游分支共享同一可变数组
        signals: [...convertedPacket.signals],
      });
    }
    return nextPackets;
  };

  const builder = createSubDAG("/mouse");
  const root = builder.node().handler(rootHandler);

  const pointer = builder.node().defaultRoute(DEVICE_DEFAULT_ROUTE);
  const primary = builder.node().defaultRoute(DEVICE_DEFAULT_ROUTE);
  const secondary = builder.node().defaultRoute(DEVICE_DEFAULT_ROUTE);
  const auxiliary = builder.node().defaultRoute(DEVICE_DEFAULT_ROUTE);
  const wheel = builder.node().defaultRoute(DEVICE_DEFAULT_ROUTE);

  builder.edge("pointer", root, pointer);
  builder.edge("primary", root, primary);
  builder.edge("secondary", root, secondary);
  builder.edge("auxiliary", root, auxiliary);
  builder.edge("wheel", root, wheel);

  return builder
    .expose({
      resetState() {
        activeButtons = {
          primary: false,
          secondary: false,
          auxiliary: false,
        };
        lastPosition = null;
        lastWheelDelta = null;
      },
      getState,
    })
    .build();
}

export { createMouseDevice };
