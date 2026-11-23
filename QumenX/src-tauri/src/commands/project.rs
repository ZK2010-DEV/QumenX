use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle};
use tauri_plugin_shell::ShellExt;

const MAX_BACKUPS: usize = 12;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectFileMeta {
    pub id: String,
    pub name: String,
    pub path: String,
    pub updated_at: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBackup {
    pub path: String,
    pub created_at: u64,
    pub size: u64,
}

fn app_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())?;
    let new_dir = base.join("QumenX");
    // One-time migration from the pre-rebrand data directory.
    let old_dir = base.join("capcut-editor");
    if !new_dir.exists() && old_dir.exists() {
        let _ = fs::rename(&old_dir, &new_dir);
    }
    Ok(new_dir)
}

fn recent_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("recent.json"))
}

fn ensure_data_dir() -> Result<PathBuf, String> {
    let d = app_data_dir()?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn backup_dir() -> Result<PathBuf, String> {
    let d = ensure_data_dir()?.join("backups");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Stable, filesystem-safe token derived from the full project path so that two
/// projects with the same file name never share a backup sequence.
fn path_token(path: &Path) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    let hash = hasher.finish();
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".into());
    let cleaned: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .take(48)
        .collect();
    format!("{}_{:016x}", cleaned, hash)
}

fn backup_files(target: &Path) -> Result<Vec<PathBuf>, String> {
    let token = path_token(target);
    let dir = backup_dir()?;
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension().and_then(|x| x.to_str()) == Some("bak")
                && p.file_name()
                    .and_then(|x| x.to_str())
                    .map(|n| n.starts_with(&format!("{}_", token)))
                    .unwrap_or(false)
        })
        .collect();
    files.sort_by(|a, b| b.to_string_lossy().cmp(&a.to_string_lossy()));
    Ok(files)
}

/// Copy the current version of `target` into the rotating backup set.
fn rotate_backup(target: &Path) {
    if !target.is_file() {
        return;
    }
    let token = path_token(target);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let name = format!("{}_{}.bak", token, stamp);
    let dest = match backup_dir() {
        Ok(d) => d.join(name),
        Err(_) => return,
    };
    if fs::copy(target, &dest).is_err() {
        return;
    }
    if let Ok(mut files) = backup_files(target) {
        if files.len() > MAX_BACKUPS {
            for extra in files.drain(MAX_BACKUPS..) {
                let _ = fs::remove_file(extra);
            }
        }
    }
}

fn write_atomic(target: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let stamp = format!("{}-{}", std::process::id(), now_ms());
    let temp = target.with_extension(format!("tmp-{stamp}"));
    let backup = target.with_extension(format!("old-{stamp}"));
    fs::write(&temp, content).map_err(|e| e.to_string())?;

    // Windows cannot rename over an existing file. Move the original aside
    // first, then restore it if the new file cannot be put in place.
    let had_target = target.exists();
    if had_target {
        if let Err(e) = fs::rename(target, &backup) {
            let _ = fs::remove_file(&temp);
            return Err(e.to_string());
        }
    }
    if let Err(e) = fs::rename(&temp, target) {
        let _ = fs::remove_file(&temp);
        if had_target && backup.exists() {
            if let Err(restore_err) = fs::rename(&backup, target) {
                return Err(format!(
                    "{e}; failed to restore original project: {restore_err}"
                ));
            }
        }
        return Err(e.to_string());
    }
    if backup.exists() {
        let _ = fs::remove_file(&backup);
    }
    Ok(())
}

fn valid_json(content: &str) -> bool {
    serde_json::from_str::<Value>(content).is_ok()
}

#[command(rename_all = "snake_case")]
pub fn project_save(project_json: String, file_path: Option<String>) -> Result<String, String> {
    if !valid_json(&project_json) {
        return Err("Refusing to save invalid project data".into());
    }
    let target = match file_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => return Err("file_path is required for save".into()),
    };
    rotate_backup(&target);
    write_atomic(&target, &project_json)?;
    Ok(target.to_string_lossy().to_string())
}

#[command(rename_all = "snake_case")]
pub fn project_open(file_path: String) -> Result<String, String> {
    let target = PathBuf::from(&file_path);
    let content = fs::read_to_string(&target).map_err(|e| e.to_string())?;
    if valid_json(&content) {
        return Ok(content);
    }

    // Corrupt or truncated file: recover from the newest readable backup.
    let recovered = backup_files(&target)
        .unwrap_or_default()
        .into_iter()
        .find_map(|p| {
            let c = fs::read_to_string(&p).ok()?;
            if valid_json(&c) { Some((p, c)) } else { None }
        });

    if let Some((backup_path, backup_content)) = recovered {
        let mut value: Value = serde_json::from_str(&backup_content).map_err(|e| e.to_string())?;
        if let Some(obj) = value.as_object_mut() {
            obj.insert(
                "__recoveredFrom".into(),
                Value::String(backup_path.to_string_lossy().to_string()),
            );
        }
        return Ok(serde_json::to_string(&value).map_err(|e| e.to_string())?);
    }

    Err(format!(
        "Project file is corrupted and no usable backup was found:\n{}",
        file_path
    ))
}

#[command(rename_all = "snake_case")]
pub fn project_list_backups(file_path: String) -> Result<Vec<ProjectBackup>, String> {
    let target = PathBuf::from(file_path);
    let mut result = Vec::new();
    for path in backup_files(&target)? {
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let created_at = path
            .file_name()
            .and_then(|n| {
                n.to_string_lossy()
                    .rsplit('_')
                    .next()
                    .map(|s| s.trim_end_matches(".bak").to_string())
            })
            .and_then(|s| s.parse::<u64>().ok())
            .map(|secs| secs.saturating_mul(1000))
            .unwrap_or_else(|| {
                meta.modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0)
            });
        result.push(ProjectBackup {
            path: path.to_string_lossy().to_string(),
            created_at,
            size: meta.len(),
        });
    }
    Ok(result)
}

#[command(rename_all = "snake_case")]
pub fn project_restore_backup(backup_path: String, target_path: String) -> Result<String, String> {
    let backup = PathBuf::from(backup_path);
    let target = PathBuf::from(target_path);
    let content = fs::read_to_string(&backup).map_err(|e| e.to_string())?;
    if !valid_json(&content) {
        return Err("Backup file is corrupted".into());
    }
    rotate_backup(&target);
    write_atomic(&target, &content)?;
    Ok(target.to_string_lossy().to_string())
}

#[command]
pub fn project_recent() -> Result<Vec<ProjectFileMeta>, String> {
    let p = recent_path()?;
    if !p.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let mut metas: Vec<ProjectFileMeta> = serde_json::from_str(&content).unwrap_or_default();
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    metas.retain(|m| Path::new(&m.path).exists());
    Ok(metas)
}

#[command]
pub fn project_add_recent(meta: ProjectFileMeta) -> Result<(), String> {
    ensure_data_dir()?;
    let p = recent_path()?;
    let mut metas: Vec<ProjectFileMeta> = if p.exists() {
        serde_json::from_str(&fs::read_to_string(&p).map_err(|e| e.to_string())?).unwrap_or_default()
    } else {
        vec![]
    };
    metas.retain(|m| m.id != meta.id);
    metas.push(meta);
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    metas.truncate(50);
    write_atomic(
        &p,
        &serde_json::to_string_pretty(&metas).map_err(|e| e.to_string())?,
    )?;
    Ok(())
}

#[command]
#[allow(deprecated)]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.shell().open(path, None).map_err(|e| e.to_string())
}
