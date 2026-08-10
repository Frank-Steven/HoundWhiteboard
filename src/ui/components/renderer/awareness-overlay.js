/**
 * @file awareness overlay
 * @description 协作感知装饰层：远程命名选择的按来源着色框与来源标签，只画不存。
 * @module ui/components/renderer/awareness-overlay
 * @author Zhou Chenyu
 */

import { RectangleRange } from "../../../kernel/range/index.js";
import { getSummaryWorldRect } from "./ui-overlay-factory.js";

/**
 * awareness 标签的屏幕高度（像素）
 * @type {number}
 */
const AWARENESS_LABEL_HEIGHT = 16;

/**
 * 本端光标上报的节流间隔（毫秒）
 * @type {number}
 */
const CURSOR_REPORT_THROTTLE_MS = 50;

/**
 * 远程光标的过期时长（毫秒，无更新即消失）
 * @type {number}
 */
const CURSOR_EXPIRY_MS = 3000;

/**
 * 来源标识的默认取色（稳定哈希 → HSL 色相环）
 * @param {string} source - 来源标识
 * @returns {string} CSS 颜色
 */
function defaultResolveColor(source) {
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash * 31 + source.charCodeAt(i)) | 0) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 75%, 45%)`;
}

/**
 * 协作感知装饰层
 * @class
 * @description
 * 远程命名选择的可视化：经 BoardApi RPC 拉取 queryRemoteChoices 与对象摘要缓存，
 * 作为 UiRenderer overlay provider 按来源着色画框并标注来源与 choice 名。
 * 远程注册表的变更经 worker 的 awareness 消息驱动刷新；缓存不进任何文档状态（只画不存）。
 */
class AwarenessOverlay {
  /**
   * BoardApi RPC 面
   * @type {Object}
   * @private
   */
  #boardApi;

  /**
   * 视口实例
   * @type {import("../orchestration/viewport.js").Viewport}
   * @private
   */
  #viewport;

  /**
   * 来源取色函数
   * @type {(source: string) => string}
   * @private
   */
  #resolveColor;

  /**
   * 远程选择分组缓存
   * @type {{ source: string, name: string|undefined, color: string, summaries: Object[] }[]}
   * @private
   */
  #groups = [];

  /**
   * 进行中的刷新（串行化）
   * @type {Promise<void> | null}
   * @private
   */
  #refreshPromise = null;

  /**
   * 刷新期间又到通知的待办标记
   * @type {boolean}
   * @private
   */
  #refreshPending = false;

  /**
   * overlay provider 引用（注销用）
   * @type {Function | null}
   * @private
   */
  #provider = null;

  /**
   * awareness 消息监听引用（解除用）
   * @type {Function | null}
   * @private
   */
  #listener = null;

  /**
   * 远程光标缓存（来源 → 光标状态）
   * @type {Map<string, { point: { x: number, y: number }, color: string, lastSeen: number, expiryTimer: ReturnType<typeof setTimeout> | null }>}
   * @private
   */
  #cursors = new Map();

  /**
   * 本端光标上报的 pointermove 监听引用
   * @type {Function | null}
   * @private
   */
  #pointerMoveListener = null;

  /**
   * 本端光标上次上报时刻
   * @type {number}
   * @private
   */
  #cursorLastSentAt = 0;

  /**
   * 本端光标尾随上报定时器
   * @type {ReturnType<typeof setTimeout> | null}
   * @private
   */
  #cursorTrailingTimer = null;

  /**
   * 本端光标最新世界坐标（尾随上报用）
   * @type {{ x: number, y: number } | null}
   * @private
   */
  #cursorLatestWorld = null;

  /**
   * @param {Object} options - 选项
   * @param {Object} options.boardApi - BoardApi RPC 面（须含 queryRemoteChoices 与 queryObjects）
   * @param {import("../orchestration/viewport.js").Viewport} options.viewport - 视口实例
   * @param {(source: string) => string} [options.resolveColor] - 来源取色函数（缺省稳定哈希取色）
   */
  constructor({ boardApi, viewport, resolveColor } = {}) {
    if (!boardApi || !viewport) {
      throw new TypeError("AwarenessOverlay requires boardApi and viewport.");
    }
    this.#boardApi = boardApi;
    this.#viewport = viewport;
    this.#resolveColor = resolveColor ?? defaultResolveColor;
  }

  /**
   * 启动装饰层：注册 overlay provider 与 awareness 消息监听，并做首次拉取
   * @returns {void}
   */
  start() {
    if (this.#provider !== null) return;
    this.#provider = () => this.#collectEntries();
    this.#viewport.registerUiOverlayProvider(this.#provider, {
      invalidate: false,
    });
    this.#listener = (message) => this.#handleAwarenessMessage(message);
    this.#viewport.addAwarenessListener(this.#listener);
    this.#startCursorReporting();
    void this.refresh();
  }

  /**
   * 停止装饰层：注销 provider 与监听并清空缓存
   * @returns {void}
   */
  stop() {
    if (this.#provider !== null) {
      this.#viewport.unregisterUiOverlayProvider(this.#provider, {
        invalidate: false,
      });
      this.#provider = null;
    }
    if (this.#listener !== null) {
      this.#viewport.removeAwarenessListener(this.#listener);
      this.#listener = null;
    }
    this.#stopCursorReporting();
    for (const cursor of this.#cursors.values()) {
      if (cursor.expiryTimer !== null) clearTimeout(cursor.expiryTimer);
    }
    this.#cursors.clear();
    this.#groups = [];
    this.#viewport.uiRenderer?.invalidateViewport?.();
  }

  /**
   * 处理 awareness 下行消息
   * @param {Object} message - awareness 消息（{awarenessType, source, data}）
   * @returns {void}
   * @private
   */
  #handleAwarenessMessage(message) {
    switch (message?.awarenessType) {
      case "remote-activity":
        void this.refresh();
        return;
      case "cursor":
        this.#applyRemoteCursor(message.source, message.data?.point);
        return;
      case "peer-left":
        this.#dropRemoteCursor(message.source);
        return;
      default:
        return;
    }
  }

  /**
   * 登记远程光标位置（含过期调度）
   * @param {string} source - 来源标识
   * @param {{ x: number, y: number }} point - 世界坐标
   * @returns {void}
   * @private
   */
  #applyRemoteCursor(source, point) {
    if (
      typeof source !== "string" ||
      typeof point?.x !== "number" ||
      typeof point?.y !== "number"
    ) {
      return;
    }
    const existing = this.#cursors.get(source);
    if (existing?.expiryTimer) {
      clearTimeout(existing.expiryTimer);
    }
    const expiryTimer = setTimeout(() => {
      this.#dropRemoteCursor(source);
    }, CURSOR_EXPIRY_MS);
    this.#cursors.set(source, {
      point: { x: point.x, y: point.y },
      color: this.#resolveColor(source),
      lastSeen: Date.now(),
      expiryTimer,
    });
    this.#viewport.uiRenderer?.invalidateViewport?.();
  }

  /**
   * 移除远程光标（过期或对端离开）
   * @param {string} source - 来源标识
   * @returns {void}
   * @private
   */
  #dropRemoteCursor(source) {
    const existing = this.#cursors.get(source);
    if (!existing) return;
    if (existing.expiryTimer !== null) clearTimeout(existing.expiryTimer);
    this.#cursors.delete(source);
    this.#viewport.uiRenderer?.invalidateViewport?.();
  }

  /**
   * 启动本端光标上报（pointermove 节流）
   * @returns {void}
   * @private
   */
  #startCursorReporting() {
    const canvas = this.#viewport.canvas;
    if (typeof canvas?.addEventListener !== "function") return;
    this.#pointerMoveListener = (event) => {
      const world = this.#viewport.screenToWorld?.({
        x: event.clientX,
        y: event.clientY,
      });
      if (!world) return;
      this.#cursorLatestWorld = { x: world.x, y: world.y };
      const now = Date.now();
      const elapsed = now - this.#cursorLastSentAt;
      if (elapsed >= CURSOR_REPORT_THROTTLE_MS) {
        this.#cursorLastSentAt = now;
        this.#viewport.sendAwareness({
          kind: "cursor",
          point: this.#cursorLatestWorld,
        });
      } else if (this.#cursorTrailingTimer === null) {
        // 尾随补发：手势停下前的最后位置不丢
        this.#cursorTrailingTimer = setTimeout(() => {
          this.#cursorTrailingTimer = null;
          this.#cursorLastSentAt = Date.now();
          if (this.#cursorLatestWorld) {
            this.#viewport.sendAwareness({
              kind: "cursor",
              point: this.#cursorLatestWorld,
            });
          }
        }, CURSOR_REPORT_THROTTLE_MS - elapsed);
      }
    };
    canvas.addEventListener("pointermove", this.#pointerMoveListener);
  }

  /**
   * 停止本端光标上报
   * @returns {void}
   * @private
   */
  #stopCursorReporting() {
    const canvas = this.#viewport.canvas;
    if (this.#pointerMoveListener !== null) {
      canvas?.removeEventListener?.("pointermove", this.#pointerMoveListener);
      this.#pointerMoveListener = null;
    }
    if (this.#cursorTrailingTimer !== null) {
      clearTimeout(this.#cursorTrailingTimer);
      this.#cursorTrailingTimer = null;
    }
    this.#cursorLatestWorld = null;
  }

  /**
   * 重新拉取远程选择状态并刷新装饰
   * @returns {Promise<void>}
   *
   * @description
   * 刷新串行执行；刷新期间到达的通知合并为一次追加刷新。
   */
  refresh() {
    if (this.#refreshPromise !== null) {
      this.#refreshPending = true;
      return this.#refreshPromise;
    }
    this.#refreshPromise = (async () => {
      try {
        const choices = await this.#boardApi.queryRemoteChoices();
        const ids = [...new Set(choices.flatMap((c) => c.ids))];
        const summaries =
          ids.length > 0 ? await this.#boardApi.queryObjects(ids) : [];
        const byId = new Map(summaries.map((s) => [s.id, s]));
        this.#groups = choices.map((choice) => ({
          source: choice.source,
          name: choice.name,
          color: this.#resolveColor(choice.source),
          summaries: choice.ids
            .map((id) => byId.get(id))
            .filter(Boolean),
        }));
        this.#viewport.uiRenderer?.invalidateViewport?.();
      } catch {
        // RPC 失败（板已销毁等）：保留旧缓存，等待下次通知
      } finally {
        this.#refreshPromise = null;
        if (this.#refreshPending) {
          this.#refreshPending = false;
          void this.refresh();
        }
      }
    })();
    return this.#refreshPromise;
  }

  /**
   * 收集当前应绘制的 awareness 条目
   * @returns {import("./ui-overlay-factory.js").UiOverlayEntry[]}
   * @private
   */
  #collectEntries() {
    const entries = [];
    for (const group of this.#groups) {
      let unionRect;
      for (const summary of group.summaries) {
        const worldRect = getSummaryWorldRect(summary);
        if (!worldRect) continue;
        entries.push({
          source: `awareness-choice:${group.source}`,
          objectId: summary.id,
          type: "rect",
          geometry: { worldRect },
          style: {
            strokeStyle: group.color,
            lineWidth: 1.5,
            lineDash: [6, 3],
          },
        });
        unionRect = unionRect ? unionRect.union(worldRect) : worldRect;
      }
      const labelEntry = this.#createLabelEntry(group, unionRect);
      if (labelEntry) {
        entries.push(labelEntry);
      }
    }
    for (const [source, cursor] of this.#cursors) {
      entries.push(this.#createCursorEntry(source, cursor));
    }
    return entries;
  }

  /**
   * 生成远程光标条目（着色圆点 + 来源标签）
   * @param {string} source - 来源标识
   * @param {{ point: { x: number, y: number }, color: string }} cursor - 光标状态
   * @returns {import("./ui-overlay-factory.js").UiOverlayEntry}
   * @private
   */
  #createCursorEntry(source, cursor) {
    return {
      source: `awareness-cursor:${source}`,
      type: "point",
      geometry: { worldPoint: cursor.point, radius: 5 },
      draw: (context, runtime) => {
        const point = runtime?.entry?.geometry?.screenPoint;
        if (!point || !context) return;
        context.save?.();
        if (typeof context.fillStyle !== "undefined") {
          context.fillStyle = cursor.color;
        }
        context.beginPath?.();
        context.arc?.(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill?.();
        context.font = "11px sans-serif";
        context.textBaseline = "top";
        context.fillText?.(source, point.x + 9, point.y + 6);
        context.restore?.();
      },
    };
  }

  /**
   * 生成一组远程选择的来源标签条目
   * @param {{ source: string, name: string|undefined, color: string }} group - 远程选择分组
   * @param {RectangleRange | undefined} unionRect - 分组的世界组合矩形
   * @returns {import("./ui-overlay-factory.js").UiOverlayEntry | undefined}
   * @private
   */
  #createLabelEntry(group, unionRect) {
    if (!unionRect) return undefined;
    const label = group.name
      ? `${group.source} · ${group.name}`
      : group.source;
    const screenRect = this.#viewport.worldRectToScreenRect?.(unionRect, 0);
    if (!screenRect) return undefined;
    // 标签贴组合框上方；出屏时退到框内顶部
    const top = Math.max(2, screenRect.top - AWARENESS_LABEL_HEIGHT - 4);
    const color = group.color;
    return {
      source: `awareness-label:${group.source}`,
      type: "rect",
      geometry: {
        screenRect: new RectangleRange(
          screenRect.left,
          top,
          label.length * 7 + 10,
          AWARENESS_LABEL_HEIGHT,
        ),
      },
      draw: (context, runtime) => {
        const rect = runtime?.entry?.geometry?.screenRect;
        if (!rect || !context) return;
        context.save?.();
        if (typeof context.fillStyle !== "undefined") {
          context.fillStyle = color;
        }
        context.globalAlpha = 0.85;
        context.fillRect?.(rect.left, rect.top, rect.width, rect.height);
        context.globalAlpha = 1;
        if (typeof context.fillStyle !== "undefined") {
          context.fillStyle = "#ffffff";
        }
        context.font = "11px sans-serif";
        context.textBaseline = "middle";
        context.fillText?.(
          label,
          rect.left + 5,
          rect.top + rect.height / 2,
        );
        context.restore?.();
      },
    };
  }
}

export { AwarenessOverlay, defaultResolveColor };
