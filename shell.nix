# Hound Whiteboard 开发环境兼容入口（非 flake 用法）
#
# 转发到 flake.nix 的 default devShell，保持 `nix-shell` 可用。
# 推荐直接用 `nix develop`（见 flake.nix）。

(builtins.getFlake (toString ./.)).devShells.${builtins.currentSystem}.default
