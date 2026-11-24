use std::fs;
use std::path::Path;
use tauri::command;

/// Read a local SRT/VTT file as UTF-8 text.
#[command]
pub fn subtitles_read(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read subtitle file: {}", e))
}

/// Write local SRT/VTT text, creating the target directory when needed.
#[command]
pub fn subtitles_write(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create subtitle directory: {}", e))?;
        }
    }
    fs::write(target, contents).map_err(|e| format!("Failed to write subtitle file: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn subtitle_read_write_roundtrip() {
        let path = std::env::temp_dir()
            .join(format!("qumenx-caption-test-{}.srt", std::process::id()));
        let contents = "1\n00:00:00,000 --> 00:00:01,500\nHello\nworld\n";
        let name = path.to_string_lossy().to_string();
        subtitles_write(name.clone(), contents.to_string()).expect("write should succeed");
        let read_back = subtitles_read(name).expect("read should succeed");
        assert_eq!(read_back, contents);
        let _ = fs::remove_file(path);
    }
}
