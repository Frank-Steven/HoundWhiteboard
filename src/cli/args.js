/**
 * @file CLI 参数解析
 * @description 命令与标志的解析：首个非标志 token 为命令，支持 `--key value` 与 `--key=value` 两种写法。
 * @module cli/args
 * @author Zhou Chenyu
 */

/**
 * 解析命令行参数
 * @param {string[]} argv - 参数列表（process.argv.slice(2)）
 * @returns {{command: ?string, args: string[], flags: Object}} 解析结果
 *
 * @description
 * 非标志 token 全部是位置参数（对象 id / 操作 id），不参与路径；
 * `--key value` 与 `--key=value` 等价，无值标志解析为 true。
 */
function parseArgv(argv) {
  const [command, ...rest] = argv;
  const args = [];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      args.push(token);
    }
  }
  return { command, args, flags };
}

export { parseArgv };
