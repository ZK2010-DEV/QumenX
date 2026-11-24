#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{
    ffmpeg_capabilities, ffmpeg_cancel_export, ffmpeg_export, ffmpeg_probe, ffmpeg_proxy,
    ffmpeg_thumbnail, ffmpeg_thumbnails, ffmpeg_waveform, open_path, project_add_recent, project_list_backups,
    project_open, project_recent, project_restore_backup, project_save, subtitles_read,
    subtitles_write,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            ffmpeg_probe,
            ffmpeg_proxy,
            ffmpeg_thumbnail,
            ffmpeg_thumbnails,
            ffmpeg_waveform,
            ffmpeg_capabilities,
            ffmpeg_cancel_export,
            ffmpeg_export,
            project_save,
            project_open,
            project_list_backups,
            project_restore_backup,
            project_recent,
            project_add_recent,
            open_path,
            subtitles_read,
            subtitles_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
