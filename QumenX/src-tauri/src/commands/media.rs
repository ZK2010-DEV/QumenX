use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::command;
use tokio::process::Command as AsyncCommand;
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub duration: f64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub size: u64,
    pub format: String,
    pub codec: String,
    pub has_audio: bool,
}

#[derive(Deserialize)]
struct FFProbe {
    format: FFProbeFormat,
    streams: Vec<FFProbeStream>,
}

#[derive(Deserialize)]
struct FFProbeFormat {
    duration: Option<String>,
    size: Option<String>,
    format_name: String,
}

#[derive(Deserialize)]
struct FFProbeStream {
    codec_type: String,
    codec_name: String,
    width: Option<i32>,
    height: Option<i32>,
    avg_frame_rate: Option<String>,
    r_frame_rate: Option<String>,
}

#[command]
pub fn ffmpeg_probe(path: String) -> Result<MediaMetadata, String> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found or failed to run: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let probe: FFProbe = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("failed to parse ffprobe output: {e}"))?;

    let duration = probe.format.duration.as_deref()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let size = probe.format.size.as_deref()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let video_stream = probe.streams.iter().find(|s| s.codec_type == "video");
    let audio_stream = probe.streams.iter().any(|s| s.codec_type == "audio");

    let width = video_stream.and_then(|s| s.width).unwrap_or(0);
    let height = video_stream.and_then(|s| s.height).unwrap_or(0);
    let fps = parse_fps(video_stream.and_then(|s| s.avg_frame_rate.as_deref())
        .or_else(|| video_stream.and_then(|s| s.r_frame_rate.as_deref())));
    let codec = video_stream.map(|s| s.codec_name.clone()).unwrap_or_else(|| probe.format.format_name.clone());

    Ok(MediaMetadata {
        duration,
        width,
        height,
        fps,
        size,
        format: probe.format.format_name,
        codec,
        has_audio: audio_stream,
    })
}

fn parse_fps(rate: Option<&str>) -> f64 {
    match rate {
        Some(s) => {
            let parts: Vec<&str> = s.split('/').collect();
            if parts.len() == 2 {
                let num: f64 = parts[0].parse().unwrap_or(30.0);
                let den: f64 = parts[1].parse().unwrap_or(1.0);
                if den > 0.0 { return num / den; }
            }
            s.parse::<f64>().unwrap_or(30.0)
        }
        None => 30.0,
    }
}

#[derive(Serialize)]
pub struct ThumbnailResult {
    pub path: String,
}

#[command]
pub fn ffmpeg_thumbnail(path: String, time: f64, width: i32) -> Result<ThumbnailResult, String> {
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("QumenX")
        .join("thumbnails");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let safe_name = path.split(std::path::MAIN_SEPARATOR)
        .last()
        .unwrap_or("thumb")
        .replace(std::path::MAIN_SEPARATOR, "_");
    let out = cache_dir.join(format!("{safe_name}_{time}_{width}.jpg"));

    let height = (width as f64 * 9.0 / 16.0).round() as i32;
    let status = Command::new("ffmpeg")
        .args(&[
            "-y", "-ss", &time.to_string(),
            "-i", &path,
            "-frames:v", "1",
            "-vf", &format!("scale={}:{}", width, height),
            "-q:v", "2",
            out.to_str().unwrap(),
        ])
        .status()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !status.success() {
        return Err("ffmpeg thumbnail generation failed".into());
    }

    Ok(ThumbnailResult { path: out.to_string_lossy().to_string() })
}

#[derive(Serialize)]
pub struct ProxyResult {
    pub path: String,
}

/// Generate a small, silent preview proxy. The source media is never modified;
/// the result lives in QumenX's cache directory and is reused while valid.
#[command]
pub async fn ffmpeg_proxy(path: String) -> Result<ProxyResult, String> {
    if !Path::new(&path).is_file() {
        return Err(format!("Source media not found: {path}"));
    }
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("QumenX")
        .join("proxies");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let modified = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    let out = cache_dir.join(format!("{:016x}.mp4", hasher.finish()));
    if out.is_file() {
        return Ok(ProxyResult { path: out.to_string_lossy().to_string() });
    }

    let max_dim = 960.to_string();
    let output = AsyncCommand::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            &path,
            "-an",
            "-vf",
            &format!(
                "scale={0}:{0}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1",
                max_dim
            ),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "30",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            out.to_str().ok_or("Proxy cache path is not valid UTF-8")?,
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg not found: {e}"))?;
    if !output.status.success() {
        let _ = std::fs::remove_file(&out);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("proxy generation failed: {stderr}"));
    }
    Ok(ProxyResult { path: out.to_string_lossy().to_string() })
}

#[derive(Serialize)]
pub struct Capabilities {
    pub h264: bool,
    pub h265: bool,
    pub vp9: bool,
    pub av1: bool,
    pub hwaccel: Vec<String>,
}

#[command]
pub fn ffmpeg_capabilities() -> Result<Capabilities, String> {
    let encoders = Command::new("ffmpeg").args(&["-hide_banner", "-encoders"]).output();
    let hwaccels = Command::new("ffmpeg").args(&["-hide_banner", "-hwaccels"]).output();

    let encoders_text = encoders
        .ok()
        .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).to_string()) } else { None })
        .unwrap_or_default();
    let hwaccels_text = hwaccels
        .ok()
        .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).to_string()) } else { None })
        .unwrap_or_default();

    Ok(Capabilities {
        h264: encoders_text.contains("libx264"),
        h265: encoders_text.contains("libx265") || encoders_text.contains("hevc"),
        vp9: encoders_text.contains("libvpx-vp9"),
        av1: encoders_text.contains("libaom-av1"),
        hwaccel: hwaccels_text.lines().skip(1).map(|l| l.split_whitespace().next().unwrap_or("").to_string()).filter(|s| !s.is_empty()).collect(),
    })
}

#[command]
pub fn ffmpeg_thumbnails(path: String, times: Vec<f64>, width: i32) -> Result<Vec<ThumbnailResult>, String> {
    let mut results = Vec::new();
    for time in times {
        results.push(ffmpeg_thumbnail(path.clone(), time, width)?);
    }
    Ok(results)
}

#[command]
pub fn ffmpeg_waveform(path: String, samples: i32) -> Result<Vec<f64>, String> {
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            &path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "8000",
            "-f",
            "f32le",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;
    if !output.status.success() {
        return Err("ffmpeg waveform extraction failed".into());
    }
    let values: Vec<f32> = output
        .stdout
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    if values.is_empty() {
        return Ok(vec![]);
    }
    let samples = samples.max(1) as usize;
    let bucket = (values.len() / samples).max(1);
    let mut peaks = Vec::with_capacity(samples);
    for i in 0..samples {
        let start = i * bucket;
        let end = if i + 1 == samples { values.len() } else { (i + 1) * bucket };
        let peak = values[start..end]
            .iter()
            .fold(0.0_f32, |acc, v| acc.max(v.abs()));
        peaks.push(peak as f64);
    }
    Ok(peaks)
}
