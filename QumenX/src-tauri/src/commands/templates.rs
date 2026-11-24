use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;

use super::project::app_data_dir;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub builtin: bool,
    #[serde(default)]
    pub project: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TemplateFile {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    created_at: u64,
    project: Value,
}

fn template_dir() -> Result<PathBuf, String> {
    let dir = app_data_dir()?.join("templates");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_id(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(80)
        .collect();
    if cleaned.is_empty() { "template".to_string() } else { cleaned }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn info_from(file: &TemplateFile) -> TemplateInfo {
    TemplateInfo {
        id: file.id.clone(),
        name: file.name.clone(),
        description: file.description.clone(),
        created_at: file.created_at,
        builtin: false,
        project: file.project.clone(),
    }
}

fn list_in(dir: &Path) -> Result<Vec<TemplateInfo>, String> {
    let mut templates = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Ok(file) = serde_json::from_str::<TemplateFile>(&raw) {
            templates.push(info_from(&file));
        }
    }
    templates.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(a.name.cmp(&b.name)));
    Ok(templates)
}

fn save_in(dir: &Path, template_json: &str) -> Result<TemplateInfo, String> {
    let mut file: TemplateFile = serde_json::from_str(template_json)
        .map_err(|e| format!("Invalid template: {}", e))?;
    if file.name.trim().is_empty() {
        return Err("Template name cannot be empty".to_string());
    }
    if file.created_at == 0 {
        file.created_at = now_ms();
    }
    let info = info_from(&file);
    let path = dir.join(format!("{}.json", safe_id(&file.id)));
    let text = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())?;
    Ok(info)
}

fn delete_in(dir: &Path, id: &str) -> Result<(), String> {
    let path = dir.join(format!("{}.json", safe_id(id)));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub fn template_list() -> Result<Vec<TemplateInfo>, String> {
    list_in(&template_dir()?)
}

#[command(rename_all = "snake_case")]
pub fn template_save(template_json: String) -> Result<TemplateInfo, String> {
    save_in(&template_dir()?, &template_json)
}

#[command]
pub fn template_delete(id: String) -> Result<(), String> {
    delete_in(&template_dir()?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn template_save_list_delete_roundtrip() {
        let dir = std::env::temp_dir().join(format!("qumenx-template-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let json = r#"{
            "id":"test-template",
            "name":"Test Template",
            "description":"Roundtrip",
            "createdAt":123,
            "project":{"version":2,"clips":[]}
        }"#;
        let info = save_in(&dir, json).expect("save should succeed");
        assert_eq!(info.id, "test-template");
        let listed = list_in(&dir).expect("list should succeed");
        assert!(listed.iter().any(|t| t.id == "test-template" && t.name == "Test Template"));
        delete_in(&dir, "test-template").expect("delete should succeed");
        let listed = list_in(&dir).expect("list should succeed");
        assert!(listed.iter().all(|t| t.id != "test-template"));
        let _ = fs::remove_dir_all(dir);
    }
}
