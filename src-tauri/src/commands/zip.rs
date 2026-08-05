//! ZIP 压缩/解压 commands
//!
//! 解压时逐条目校验路径（zip-slip 防护：拒绝绝对路径与穿越段）。

use std::io::Write;

use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::registry;

/// ZIP 条目
#[derive(Serialize)]
pub struct ZipEntryInfo {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_directory: bool,
}

/// 校验 ZIP 条目名安全（禁绝对路径、禁穿越段）
fn is_safe_zip_name(name: &str) -> bool {
    if name.starts_with('/') || name.starts_with('\\') {
        return false;
    }
    if name.contains("..") {
        return false;
    }
    if name.contains('\0') {
        return false;
    }
    true
}

/// 将文件或目录打包为 ZIP
#[tauri::command]
pub fn safe_io_zip_from(
    root_id: String,
    src_rel: String,
    out_rel: String,
) -> Result<bool, String> {
    let (_root_abs, src, perms) = registry::resolve(&root_id, &src_rel)?;
    registry::require_zip(&perms)?;
    let (_root_abs2, out, _) = registry::resolve(&root_id, &out_rel)?;

    if !src.exists() {
        return Ok(false);
    }

    let file = std::fs::File::create(&out).map_err(|e| format!("zip create failed: {e}"))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let result = (|| -> std::io::Result<()> {
        if src.is_dir() {
            add_dir_to_zip(&mut zip, &src, &src, &options)?;
        } else {
            let name = src
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "bad name"))?;
            zip.start_file(name.to_string(), options)?;
            let mut f = std::fs::File::open(&src)?;
            std::io::copy(&mut f, &mut zip)?;
        }
        Ok(())
    })();

    if let Err(e) = result {
        return Err(format!("zip failed: {e}"));
    }

    zip.finish().map_err(|e| format!("zip finish failed: {e}"))?;
    Ok(true)
}

/// 递归添加目录到 ZIP
fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    base: &std::path::Path,
    dir: &std::path::Path,
    options: &SimpleFileOptions,
) -> std::io::Result<()> {
    let entries = std::fs::read_dir(dir)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let rel_name = path
            .strip_prefix(base)
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "bad rel"))?;
        let name = rel_name.to_string_lossy().into_owned();

        if path.is_dir() {
            zip.add_directory(name, *options)?;
            add_dir_to_zip(zip, base, &path, options)?;
        } else {
            zip.start_file(name, *options)?;
            let mut f = std::fs::File::open(&path)?;
            std::io::copy(&mut f, zip)?;
        }
    }

    Ok(())
}

/// 解压 ZIP 到目录（含 zip-slip 防护）
#[tauri::command]
pub fn safe_io_zip_extract(
    root_id: String,
    zip_rel: String,
    target_rel: String,
) -> Result<bool, String> {
    let (_root_abs, zip_abs, perms) = registry::resolve(&root_id, &zip_rel)?;
    registry::require_zip(&perms)?;
    let (_root_abs2, target_abs, _) = registry::resolve(&root_id, &target_rel)?;

    if !zip_abs.is_file() {
        return Ok(false);
    }

    let file = std::fs::File::open(&zip_abs).map_err(|e| format!("zip open failed: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("zip read failed: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry failed: {e}"))?;
        let name = entry.name().to_string();

        if !is_safe_zip_name(&name) {
            return Err(format!("unsafe zip entry name: {name}"));
        }

        let target = target_abs.join(&name);
        if !target.starts_with(&target_abs) {
            return Err("zip entry escapes target".into());
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&target)
                .map_err(|e| format!("zip mkdir failed: {e}"))?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("zip parent failed: {e}"))?;
            }
            let mut out = std::fs::File::create(&target)
                .map_err(|e| format!("zip file create failed: {e}"))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("zip extract failed: {e}"))?;
        }
    }

    Ok(true)
}

/// 列出 ZIP 条目
#[tauri::command]
pub fn safe_io_zip_list(root_id: String, zip_rel: String) -> Result<Vec<ZipEntryInfo>, String> {
    let (_root_abs, zip_abs, perms) = registry::resolve(&root_id, &zip_rel)?;
    registry::require_zip(&perms)?;

    if !zip_abs.is_file() {
        return Ok(Vec::new());
    }

    let file = std::fs::File::open(&zip_abs).map_err(|e| format!("zip open failed: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("zip read failed: {e}"))?;

    let mut entries = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry failed: {e}"))?;
        entries.push(ZipEntryInfo {
            name: entry.name().to_string(),
            size: entry.size(),
            compressed_size: entry.compressed_size(),
            is_directory: entry.is_dir(),
        });
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_name_safety_rejects_escape() {
        assert!(!is_safe_zip_name("../escape"));
        assert!(!is_safe_zip_name("a/../../b"));
        assert!(!is_safe_zip_name("/etc/passwd"));
        assert!(!is_safe_zip_name("\\windows\\x"));
        assert!(!is_safe_zip_name("a\0b"));
        assert!(is_safe_zip_name("a/b.txt"));
        assert!(is_safe_zip_name("dir/"));
    }
}
