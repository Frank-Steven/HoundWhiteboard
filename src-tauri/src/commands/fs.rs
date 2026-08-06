//! 文件系统操作 commands
//!
//! 每个操作先经 registry::resolve 校验（root 注册 + 词法校验 + 符号链接边界），
//! 再经权限强制检查，最后执行实际文件操作。错误统一返回 Err(String)，
//! JS 侧驱动捕获后转为安全值。

use serde::Serialize;

use super::hide;
use super::registry;

/// 目录条目
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub hidden: bool,
}

/// 文件状态
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsStat {
    pub size: u64,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub hidden: bool,
    pub created_at: Option<u64>,
    pub modified_at: Option<u64>,
}

/// 隐藏操作结果
#[derive(Serialize)]
pub struct HideResult {
    pub success: bool,
    pub path: String,
}

/// 读取文件（utf8）
#[tauri::command]
pub fn safe_io_fs_read(
    root_id: String,
    rel_path: String,
    _encoding: Option<String>,
) -> Result<Option<String>, String> {
    let (_root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_read(&perms)?;

    if !abs.is_file() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&abs)
        .map_err(|e| format!("read failed: {e}"))?;
    Ok(Some(content))
}

/// 写入文件（utf8，自动创建父目录）
#[tauri::command]
pub fn safe_io_fs_write(
    root_id: String,
    rel_path: String,
    content: String,
    _encoding: Option<String>,
) -> Result<bool, String> {
    let (_root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_write(&perms)?;

    std::fs::write(&abs, content).map_err(|e| format!("write failed: {e}"))?;
    Ok(true)
}

/// 列出目录条目
#[tauri::command]
pub fn safe_io_fs_ls(root_id: String, rel_path: String) -> Result<Vec<FsEntry>, String> {
    let (_root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_read(&perms)?;

    if !abs.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&abs).map_err(|e| format!("ls failed: {e}"))?;

    for item in read_dir {
        let item = item.map_err(|e| format!("ls entry failed: {e}"))?;
        let entry_path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();
        let symlink_meta = std::fs::symlink_metadata(&entry_path).ok();
        let is_symlink = symlink_meta
            .as_ref()
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);
        let meta = std::fs::metadata(&entry_path).ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let is_file = meta.as_ref().map(|m| m.is_file()).unwrap_or(false);
        let hidden = hide::is_hidden(&entry_path).unwrap_or(false);

        entries.push(FsEntry {
            name,
            is_dir,
            is_file,
            is_symlink,
            hidden,
        });
    }

    Ok(entries)
}

/// 系统时间转毫秒时间戳
fn system_time_millis(t: std::time::SystemTime) -> Option<u64> {
    t.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

/// 获取文件状态
#[tauri::command]
pub fn safe_io_fs_stat(root_id: String, rel_path: String) -> Result<Option<FsStat>, String> {
    let (_root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_read(&perms)?;

    let meta = match std::fs::metadata(&abs) {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };
    let symlink_meta = std::fs::symlink_metadata(&abs).ok();
    let is_symlink = symlink_meta
        .as_ref()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);

    Ok(Some(FsStat {
        size: meta.len(),
        is_dir: meta.is_dir(),
        is_file: meta.is_file(),
        is_symlink,
        hidden: hide::is_hidden(&abs).unwrap_or(false),
        created_at: meta.created().ok().and_then(system_time_millis),
        modified_at: meta.modified().ok().and_then(system_time_millis),
    }))
}

/// 检查路径是否存在
#[tauri::command]
pub fn safe_io_fs_exists(root_id: String, rel_path: String) -> Result<bool, String> {
    let (_root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_read(&perms)?;
    Ok(abs.exists())
}

/// 删除文件或目录
#[tauri::command]
pub fn safe_io_fs_rm(root_id: String, rel_path: String) -> Result<bool, String> {
    let (root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_rm(&perms)?;

    if abs == root_abs {
        return Err("cannot remove root".into());
    }
    if !abs.exists() {
        return Ok(false);
    }

    if abs.is_dir() {
        std::fs::remove_dir_all(&abs).map_err(|e| format!("rm failed: {e}"))?;
    } else {
        std::fs::remove_file(&abs).map_err(|e| format!("rm failed: {e}"))?;
    }
    Ok(true)
}

/// 复制文件或目录
#[tauri::command]
pub fn safe_io_fs_cp(
    root_id: String,
    src_rel: String,
    dest_rel: String,
) -> Result<bool, String> {
    let (_root_abs, src, perms) = registry::resolve(&root_id, &src_rel)?;
    registry::require_write(&perms)?;
    let (_root_abs2, dest, _) = registry::resolve(&root_id, &dest_rel)?;

    if !src.exists() {
        return Ok(false);
    }

    copy_recursive(&src, &dest).map_err(|e| format!("cp failed: {e}"))?;
    Ok(true)
}

/// 移动文件或目录
#[tauri::command]
pub fn safe_io_fs_mv(
    root_id: String,
    src_rel: String,
    dest_rel: String,
) -> Result<bool, String> {
    let (_root_abs, src, perms) = registry::resolve(&root_id, &src_rel)?;
    registry::require_write(&perms)?;
    let (_root_abs2, dest, _) = registry::resolve(&root_id, &dest_rel)?;

    if !src.exists() {
        return Ok(false);
    }

    match std::fs::rename(&src, &dest) {
        Ok(()) => Ok(true),
        Err(_) => {
            // 跨设备等场景回退到复制 + 删除
            copy_recursive(&src, &dest).map_err(|e| format!("mv copy failed: {e}"))?;
            if src.is_dir() {
                std::fs::remove_dir_all(&src).map_err(|e| format!("mv cleanup failed: {e}"))?;
            } else {
                std::fs::remove_file(&src).map_err(|e| format!("mv cleanup failed: {e}"))?;
            }
            Ok(true)
        }
    }
}

/// 递归复制文件或目录
fn copy_recursive(src: &std::path::Path, dest: &std::path::Path) -> std::io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dest)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dest.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dest)?;
        Ok(())
    }
}

/// 创建目录
#[tauri::command]
pub fn safe_io_fs_mkdir(root_id: String, rel_path: String) -> Result<bool, String> {
    let (root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_mkdir(&perms)?;

    if abs == root_abs {
        return Err("cannot mkdir root".into());
    }

    std::fs::create_dir_all(&abs).map_err(|e| format!("mkdir failed: {e}"))?;
    Ok(true)
}

/// 隐藏文件或目录
#[tauri::command]
pub fn safe_io_fs_hide(root_id: String, rel_path: String) -> Result<HideResult, String> {
    let (root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_hide(&perms)?;

    if !abs.exists() {
        return Err("path not found".into());
    }

    match hide::hide_path(&abs)? {
        None => Ok(HideResult {
            success: true,
            path: rel_path,
        }),
        Some(new_abs) => {
            let new_rel = registry::rel_from_root(&new_abs, &root_abs)?;
            Ok(HideResult {
                success: true,
                path: new_rel,
            })
        }
    }
}

/// 取消隐藏
#[tauri::command]
pub fn safe_io_fs_unhide(root_id: String, rel_path: String) -> Result<HideResult, String> {
    let (root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_hide(&perms)?;

    if !abs.exists() {
        return Err("path not found".into());
    }

    match hide::unhide_path(&abs)? {
        None => Ok(HideResult {
            success: true,
            path: rel_path,
        }),
        Some(new_abs) => {
            let new_rel = registry::rel_from_root(&new_abs, &root_abs)?;
            Ok(HideResult {
                success: true,
                path: new_rel,
            })
        }
    }
}

/// 检查是否隐藏
#[tauri::command]
pub fn safe_io_fs_is_hidden(root_id: String, rel_path: String) -> Result<bool, String> {
    let (_root_abs, abs, perms) = registry::resolve(&root_id, &rel_path)?;
    registry::require_read(&perms)?;

    if !abs.exists() {
        return Ok(false);
    }
    hide::is_hidden(&abs)
}

