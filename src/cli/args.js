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
 * 首个非 `--` 前缀的 token 为命令，全部 token 均为标志时命令为空（如 daemon 进程入口）；
 * `--key value` 与 `--key=value` 等价，无值标志解析为 true。
 */
function parseArgv(argv) {
  let [command, ...rest] = argv;
  if (command !== undefined && command.startsWith("--")) {
    // 首个 token 是标志：无命令形态（纯标志入口），全部按标志解析
    rest = [command, ...rest];
    command = undefined;
  }
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
