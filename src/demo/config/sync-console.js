/**
 * @file 同步控制台辅助
 * @description 在 window.hwb 挂载同步配置快速设置函数，控制台免手写 localStorage（Mac 调出控制台为 Command+Option+I）。
 * @module demo/config/sync-console
 * @author Zhou Chenyu
 */

/** 中继地址存储键 */
const RELAY_KEY = "hwb-relay";
/** 身份覆盖存储键 */
const SOURCE_KEY = "hwb-source";
/** 板目录覆盖存储键 */
const BOARD_KEY = "hwb-board";

/**
 * 安装同步控制台辅助
 * @returns {void}
 *
 * @description
 * 提供五个函数：setRelay / setSource / setBoard（设置后自动刷新）、status（只读打印）、off（清除配置回离线）。
 */
function installSyncConsole() {
  if (globalThis.hwb !== undefined) return;
  globalThis.hwb = {
    /**
     * 设置同步中继地址并刷新
     * @param {string} url - 形如 ws://192.168.1.5:8377 的地址
     * @returns {void}
     */
    setRelay(url) {
      if (typeof url !== "string" || url === "") {
        console.warn("hwb.setRelay(url)：url 形如 ws://192.168.1.5:8377");
        return;
      }
      globalThis.localStorage?.setItem(RELAY_KEY, url);
      console.log(`已设置中继：${url}，刷新中…`);
      globalThis.location?.reload?.();
    },

    /**
     * 设置身份覆盖并刷新（同机多窗口需互不相同）
     * @param {string} source - 身份标识
     * @returns {void}
     */
    setSource(source) {
      if (typeof source !== "string" || source === "") {
        console.warn("hwb.setSource(source)：source 为非空字符串");
        return;
      }
      globalThis.localStorage?.setItem(SOURCE_KEY, source);
      console.log(`已设置身份：${source}，刷新中…`);
      globalThis.location?.reload?.();
    },

    /**
     * 设置板目录覆盖并刷新（同机多窗口需互不相同）
     * @param {string} board - 板目录路径
     * @returns {void}
     */
    setBoard(board) {
      if (typeof board !== "string" || board === "") {
        console.warn("hwb.setBoard(board)：board 为板目录路径");
        return;
      }
      globalThis.localStorage?.setItem(BOARD_KEY, board);
      console.log(`已设置板目录：${board}，刷新中…`);
      globalThis.location?.reload?.();
    },

    /**
     * 打印当前同步配置
     * @returns {void}
     */
    status() {
      const storage = globalThis.localStorage;
      console.log(
        "HWB 同步配置",
        JSON.stringify(
          {
            relay: storage?.getItem(RELAY_KEY) ?? "(离线)",
            source: storage?.getItem(SOURCE_KEY) ?? "(设备自动身份)",
            board: storage?.getItem(BOARD_KEY) ?? "(默认 demo-board)",
          },
          null,
          2,
        ),
      );
    },

    /**
     * 清除全部同步配置并刷新（回到离线）
     * @returns {void}
     */
    off() {
      const storage = globalThis.localStorage;
      storage?.removeItem(RELAY_KEY);
      storage?.removeItem(SOURCE_KEY);
      storage?.removeItem(BOARD_KEY);
      console.log("已清除同步配置，刷新中…");
      globalThis.location?.reload?.();
    },
  };
}

export { installSyncConsole };
