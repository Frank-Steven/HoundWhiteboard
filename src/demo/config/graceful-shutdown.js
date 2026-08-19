/**
 * @file 关窗优雅销毁
 * @description 窗口关闭前销毁 BoardCore（含板 daemon 创建者引用回收），销毁失败或超时不阻塞关窗。
 * @module demo/config/graceful-shutdown
 * @author Zhou Chenyu
 */

/**
 * 关窗销毁的最长等待时长（毫秒）
 * @description 防止 destroyBoard 挂起卡死关窗；destroyBoard 内的 daemon release 协议
 * 自身带 2s 超时（见 core-worker 的 releaseOwnedGuiDaemon），此处外层再兜 3s。
 * @type {number}
 */
const CLOSE_DESTROY_TIMEOUT_MS = 3000;

/**
 * 安装关窗优雅销毁钩子
 * @param {{ destroyBoard: Function }} boardApi - BoardApiRpc 实例
 * @param {{ tauriAvailable?: boolean, closeTimeoutMs?: number }} [options={}] - 运行环境与超时配置
 * @returns {Promise<void>} 钩子注册完成
 *
 * @description
 * Tauri 桌面端：拦下 close-requested 事件，先销毁 BoardCore（触发板 daemon 创建者引用
 * release，无其他引用时 daemon 随即退出）再真正关窗。web 端（浏览器 demo）仅能挂
 * beforeunload 尽力而为，页面销毁不保证异步完成，残留引用由 daemon 闲置自退出兜底。
 * 宿主进程被强杀（^C 等）时本钩子无机会执行，同样由 daemon 闲置自退出兜底。
 */
async function installGracefulShutdown(boardApi, options = {}) {
  const { tauriAvailable = false, closeTimeoutMs = CLOSE_DESTROY_TIMEOUT_MS } =
    options;

  if (!tauriAvailable) {
    globalThis.addEventListener?.("beforeunload", () => {
      void boardApi.destroyBoard();
    });
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  // 重入保护：放行自身 close() 再次触发的 close-requested，避免无限拦截
  let closing = false;
  await appWindow.onCloseRequested(async (event) => {
    if (closing) return;
    closing = true;
    event.preventDefault();
    let timer = null;
    try {
      await Promise.race([
        boardApi.destroyBoard(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, closeTimeoutMs);
        }),
      ]);
    } catch {
      // 销毁失败不阻塞关窗
    } finally {
      clearTimeout(timer);
    }
    await appWindow.close();
  });
}

export { installGracefulShutdown };
