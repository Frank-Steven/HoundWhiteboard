//! 板 daemon 进程管理 command
//!
//! 职责：
//! - 板不存在时创建骨架（board.json + 目录布局），随后 spawn 持板 daemon 进程
//! - 轮询板目录 `.daemon.json` 直到 daemon 就绪（端口已写入）
//! - 返回 { name, port }，供 GUI 经协作通道连接

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

/// spawn_board_daemon 的入参
#[derive(Deserialize)]
pub struct SpawnDaemonArgs {
    /// 板目录绝对路径
    pub path: String,
    /// daemon 名（注册表唯一标识）
    pub name: String,
    /// 协作身份
    pub source: Option<String>,
    /// 建板骨架时的板宽（板已存在时忽略）
    pub width: Option<f64>,
    /// 建板骨架时的板高（板已存在时忽略）
    pub height: Option<f64>,
}

/// spawn_board_daemon 的返回
#[derive(Serialize)]
pub struct SpawnDaemonResult {
    pub name: String,
    pub port: u16,
}

/// daemon 进程入口（相对本 crate 源码目录的 start-daemon.js）
const START_DAEMON_JS: &str = "../src/cli/start-daemon.js";

/// 轮询板目录 .daemon.json 直到出现端口字段
fn wait_for_daemon(board_path: &Path, timeout: Duration) -> Option<u16> {
    let daemon_file = board_path.join(".daemon.json");
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(text) = fs::read_to_string(&daemon_file) {
            if let Ok(desc) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(port) = desc.get("port").and_then(|p| p.as_u64()) {
                    if port > 0 && port <= u64::from(u16::MAX) {
                        return Some(port as u16);
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    None
}

/// 板不存在时创建骨架（board.json + 目录布局；板尺寸写入 boardConfig）
fn ensure_board_skeleton(board_path: &Path, width: Option<f64>, height: Option<f64>) {
    let meta_file = board_path.join("board.json");
    if meta_file.exists() {
        return;
    }
    let _ = fs::create_dir_all(board_path.join("objects"));
    let _ = fs::create_dir_all(board_path.join("trash"));
    let _ = fs::create_dir_all(board_path.join("hit"));
    let _ = fs::create_dir_all(board_path.join("chunks"));
    let mut meta = serde_json::json!({
        "formatVersion": 1,
        "lastTime": 0,
        "nextSegmentSeq": 1,
    });
    if let (Some(w), Some(h)) = (width, height) {
        if w > 0.0 && h > 0.0 {
            meta["boardConfig"] = serde_json::json!({ "width": w, "height": h });
        }
    }
    let _ = fs::write(&meta_file, serde_json::to_string_pretty(&meta).unwrap_or_default());
}

/// 拉起板 daemon 进程并等待就绪
#[tauri::command]
pub fn spawn_board_daemon(args: SpawnDaemonArgs) -> Result<SpawnDaemonResult, String> {
    let board_path = Path::new(&args.path);
    if !board_path.is_dir() {
        return Err(format!("板目录不存在：{}", args.path));
    }
    ensure_board_skeleton(board_path, args.width, args.height);

    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let daemon_js = Path::new(manifest_dir)
        .join(START_DAEMON_JS)
        .canonicalize()
        .map_err(|e| format!("无法定位 daemon 进程入口：{e}"))?;

    let mut cmd = Command::new("node");
    cmd.arg(&daemon_js)
        .arg("--name")
        .arg(&args.name)
        .arg("--path")
        .arg(&args.path);
    if let Some(source) = &args.source {
        if !source.is_empty() {
            cmd.arg("--source").arg(source);
        }
    }
    // 脱离父进程：GUI 关闭后 daemon 常驻（引用计数 release 才回收）
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let child = cmd
        .spawn()
        .map_err(|e| format!("daemon 进程启动失败（需要 node 在 PATH）：{e}"))?;
    drop(child);

    let port = wait_for_daemon(&board_path, Duration::from_secs(15))
        .ok_or_else(|| format!("daemon {} 启动超时（15s 内未就绪）", args.name))?;
    Ok(SpawnDaemonResult {
        name: args.name,
        port,
    })
}
