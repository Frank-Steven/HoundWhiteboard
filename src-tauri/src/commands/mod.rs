//! safe-io commands 模块
//!
//! 提供 Tauri 侧的安全文件操作 command 集：
//! - registry：根目录注册表与路径解析（安全核心）
//! - fs：文件系统操作（read/write/ls/stat/exists/rm/cp/mv/mkdir/hide/unhide/isHidden）
//! - zip：ZIP 压缩/解压/列表

pub mod fs;
pub mod hide;
pub mod registry;
pub mod zip;
