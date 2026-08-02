# Hound Whiteboard 开发环境（Linux / NixOS）
#
# 用法：
#   nix develop         # 进入开发环境（flake，推荐）
#   nix-shell           # 兼容入口（经 shell.nix 转发到本 flake）
#   yarn                # 装依赖
#   yarn dev:linux      # Tauri 开发模式
#
# Tauri 2 在 Linux 需要 webkitgtk 等系统库，NixOS 上必须通过
# nix develop 提供（系统没有 /usr/lib，裸 cargo build 找不到库）。
#
# nixpkgs 固定在 nixos-24.11：
#   - nodejs_22 / webkitgtk_4_1 / libsoup_3 等包名需要 nixpkgs >= 24.05
#   - 固定版本保证任何机器解析到同一套包，避免 <nixpkgs> channel 漂移

{
  description = "Hound Whiteboard dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            # 构建工具
            nativeBuildInputs = with pkgs; [
              pkg-config
              gobject-introspection
            ];

            packages = with pkgs; [
              nodejs_22
              yarn

              cargo
              rustc
              rustfmt
              clippy
              cargo-edit
            ];

            # Tauri 2 系统依赖
            buildInputs = with pkgs; [
              gtk3
              glib
              cairo
              pango
              atk
              gdk-pixbuf
              libsoup_3
              webkitgtk_4_1
              javascriptcoregtk_4_1
              librsvg
              openssl
              libayatana-appindicator
              xdotool
            ];

            shellHook = ''
              echo "hwb dev shell: node $(node --version), cargo $(cargo --version)"
            '';
          };
        });
    };
}
