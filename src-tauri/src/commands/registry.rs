//! 根目录注册表与路径解析（安全核心）
//!
//! 职责：
//! - 维护 root_id → 绝对路径 + 权限声明的权威注册表
//! - 相对路径校验（禁绝对路径、禁穿越段、禁反斜杠）
//! - 符号链接边界检查（canonicalize 后前缀校验）
//! - 权限强制检查

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

/// 根目录权限声明
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct RootPermissions {
    pub read: bool,
    pub write: bool,
    pub rm: bool,
    pub ls: bool,
    pub mkdir: bool,
    pub hide: bool,
    pub zip: bool,
}

impl Default for RootPermissions {
    fn default() -> Self {
        Self {
            read: false,
            write: false,
            rm: false,
            ls: false,
            mkdir: false,
            hide: false,
            zip: false,
        }
    }
}

/// 已注册根目录条目
#[derive(Clone)]
pub struct RootEntry {
    /// 规范化后的根目录绝对路径（注册时 canonicalize）
    pub abs: PathBuf,
    /// 权限声明
    pub perms: RootPermissions,
}

/// 全局根目录注册表
static ROOTS: OnceLock<Mutex<HashMap<String, RootEntry>>> = OnceLock::new();

/// 获取注册表
fn roots() -> &'static Mutex<HashMap<String, RootEntry>> {
    ROOTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 校验单段路径名称（与 JS 侧 dsl.isValidName 语义一致）
fn is_valid_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 255 {
        return false;
    }
    if name == "." || name == ".." {
        return false;
    }
    if name.ends_with('.') {
        return false;
    }
    !name.chars().any(|c| {
        matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0')
    })
}

/// 校验并规范化相对路径
pub fn normalize_rel(rel: &str) -> Result<String, String> {
    if rel.is_empty() {
        return Err("empty rel path".into());
    }
    if rel.starts_with('/') {
        return Err("absolute path is not allowed".into());
    }
    if rel.contains('\\') {
        return Err("backslash is not allowed in rel path".into());
    }
    if rel.contains('\0') {
        return Err("nul byte in rel path".into());
    }

    for segment in rel.split('/') {
        if !is_valid_name(segment) {
            return Err(format!("invalid path segment: {segment}"));
        }
    }

    Ok(rel.to_string())
}

/// 权限强制检查辅助
pub fn require_read(perms: &RootPermissions) -> Result<(), String> {
    if perms.read {
        Ok(())
    } else {
        Err("permission denied: read".into())
    }
}

/// 权限强制检查辅助
pub fn require_write(perms: &RootPermissions) -> Result<(), String> {
    if perms.write {
        Ok(())
    } else {
        Err("permission denied: write".into())
    }
}

/// 权限强制检查辅助
pub fn require_rm(perms: &RootPermissions) -> Result<(), String> {
    if perms.rm {
        Ok(())
    } else {
        Err("permission denied: rm".into())
    }
}

/// 权限强制检查辅助
pub fn require_mkdir(perms: &RootPermissions) -> Result<(), String> {
    if perms.mkdir {
        Ok(())
    } else {
        Err("permission denied: mkdir".into())
    }
}

/// 权限强制检查辅助
pub fn require_hide(perms: &RootPermissions) -> Result<(), String> {
    if perms.hide {
        Ok(())
    } else {
        Err("permission denied: hide".into())
    }
}

/// 权限强制检查辅助
pub fn require_zip(perms: &RootPermissions) -> Result<(), String> {
    if perms.zip {
        Ok(())
    } else {
        Err("permission denied: zip".into())
    }
}

/// 注册根目录
///
/// 返回生成的 root_id。路径支持 `~` 家目录展开；
/// 路径不存在且声明了写权限时自动创建（开板即建板），否则报错。
#[tauri::command]
pub fn safe_io_register_root(
    abs_path: String,
    permissions: Option<RootPermissions>,
) -> Result<String, String> {
    if abs_path.trim().is_empty() {
        return Err("empty root path".into());
    }

    let expanded = expand_home(&abs_path)?;
    let perms = permissions.unwrap_or_default();

    let path = std::path::Path::new(&expanded);
    if !path.exists() {
        if !perms.write {
            return Err("root path does not exist".into());
        }
        std::fs::create_dir_all(path)
            .map_err(|e| format!("failed to create root: {e}"))?;
    }

    let canonical = std::fs::canonicalize(path)
        .map_err(|e| format!("root path not resolvable: {e}"))?;

    if !canonical.is_dir() {
        return Err("root must be a directory".into());
    }

    let root_id = uuid::Uuid::new_v4().to_string();

    let entry = RootEntry {
        abs: canonical,
        perms,
    };

    roots()
        .lock()
        .expect("safe-io roots poisoned")
        .insert(root_id.clone(), entry);

    Ok(root_id)
}

/// 展开路径开头的 `~` 为家目录
fn expand_home(path: &str) -> Result<String, String> {
    if path == "~" || path.starts_with("~/") || path.starts_with("~\\") {
        let home = std::env::home_dir()
            .ok_or_else(|| "home directory unavailable".to_string())?;
        // "~" 单独使用即家目录本身（join("") 会引入尾部分隔符）
        if path == "~" {
            return Ok(home.to_string_lossy().into_owned());
        }
        return Ok(home.join(&path[2..]).to_string_lossy().into_owned());
    }
    Ok(path.to_string())
}

/// 注销根目录
#[tauri::command]
pub fn safe_io_unregister_root(root_id: String) -> Result<bool, String> {
    let removed = roots()
        .lock()
        .expect("safe-io roots poisoned")
        .remove(&root_id)
        .is_some();
    Ok(removed)
}

/// 列出已注册根目录 id
#[tauri::command]
pub fn safe_io_list_roots() -> Result<Vec<String>, String> {
    let guard = roots().lock().expect("safe-io roots poisoned");
    Ok(guard.keys().cloned().collect())
}

/// 解析相对路径到边界内绝对路径
///
/// 安全规则：
/// 1. rel 必须通过词法校验（无穿越、无绝对路径）
/// 2. 目标父目录必须存在（自动创建），canonicalize 后必须位于根目录内
/// 3. 目标本身存在时 canonicalize 后必须位于根目录内（符号链接逃逸防护）
///
/// 返回 (根目录绝对路径, 目标绝对路径, 权限声明)。
pub fn resolve(root_id: &str, rel: &str) -> Result<(PathBuf, PathBuf, RootPermissions), String> {
    let guard = roots().lock().expect("safe-io roots poisoned");
    let entry = guard
        .get(root_id)
        .ok_or_else(|| "unknown root id".to_string())?;

    let rel = normalize_rel(rel)?;
    let root_abs = entry.abs.clone();
    let target = root_abs.join(&rel);

    // 目标父目录：存在则解析，不存在则创建后解析
    let parent = target
        .parent()
        .ok_or_else(|| "target has no parent".to_string())?;
    if !parent.exists() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create parent failed: {e}"))?;
    }

    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("parent not resolvable: {e}"))?;

    if !is_within(&canonical_parent, &root_abs) {
        return Err("path outside security boundary".into());
    }

    let final_target = if target.exists() {
        let canonical = std::fs::canonicalize(&target)
            .map_err(|e| format!("target not resolvable: {e}"))?;
        if !is_within(&canonical, &root_abs) {
            return Err("path outside security boundary".into());
        }
        canonical
    } else {
        let file_name = target
            .file_name()
            .ok_or_else(|| "target has no file name".to_string())?;
        canonical_parent.join(file_name)
    };

    Ok((root_abs, final_target, entry.perms.clone()))
}

/// 判断路径是否位于根目录内（自身或前缀匹配）
fn is_within(abs: &Path, root: &Path) -> bool {
    abs == root || abs.starts_with(root)
}

/// 将绝对路径转换为相对根目录的路径（POSIX 分隔符）
pub fn rel_from_root(abs: &Path, root: &Path) -> Result<String, String> {
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| "path outside root".to_string())?;
    let mut parts = Vec::new();
    for comp in rel.components() {
        parts.push(comp.as_os_str().to_string_lossy().into_owned());
    }
    Ok(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_rel_rejects_absolute_and_traversal() {
        assert!(normalize_rel("/etc/passwd").is_err());
        assert!(normalize_rel("../escape").is_err());
        assert!(normalize_rel("a/../b").is_err());
        assert!(normalize_rel("a\\b").is_err());
        assert!(normalize_rel("").is_err());
        assert!(normalize_rel("a//b").is_err());
        assert!(normalize_rel("a/b.txt").is_ok());
    }

    #[test]
    fn normalize_rel_rejects_invalid_segments() {
        assert!(normalize_rel("a/.").is_err());
        assert!(normalize_rel("a/b:").is_err());
        assert!(normalize_rel("a/*").is_err());
        assert!(normalize_rel("ok/名字").is_ok());
    }

    #[test]
    fn permissions_default_all_false() {
        let p = RootPermissions::default();
        assert!(!p.read && !p.write && !p.rm && !p.hide);
    }

    #[test]
    fn resolve_unknown_root_fails() {
        assert!(resolve("nope", "a.txt").is_err());
    }

    #[test]
    fn expand_home_expands_tilde_prefix() {
        let home = std::env::home_dir().unwrap();
        assert_eq!(expand_home("~").unwrap(), home.to_string_lossy());
        assert_eq!(
            expand_home("~/demo-board").unwrap(),
            home.join("demo-board").to_string_lossy()
        );
        // 不以 ~ 开头的路径原样返回
        assert_eq!(expand_home("/abs/path").unwrap(), "/abs/path");
        assert_eq!(expand_home("~other/x").unwrap(), "~other/x");
    }
}
