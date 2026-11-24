use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Emitter, Runtime};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};

static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/* ------------------------------------------------------------------ *
 * Project model
 * ------------------------------------------------------------------ */

#[derive(Clone, Default)]
struct Kf {
    time: f64,
    value: f64,
    easing: String,
}

#[derive(Clone, Default)]
struct Effect {
    kind: String,
    value: f64,
}

#[derive(Clone, Default)]
struct Transition {
    kind: String,
    duration: f64,
}

#[derive(Clone, Default)]
struct Freeze {
    enabled: bool,
    at: f64,
    duration: f64,
}

#[derive(Clone, Default)]
struct AudioDsp {
    enabled: bool,
    highpass_hz: f64,
    lowpass_hz: f64,
    low_gain_db: f64,
    mid_gain_db: f64,
    high_gain_db: f64,
    compressor: bool,
    threshold_db: f64,
    ratio: f64,
    attack_ms: f64,
    release_ms: f64,
}

#[derive(Clone, Default)]
struct TextStyle {
    text: String,
    font_family: String,
    font_size: f64,
    font_weight: i64,
    color: String,
    align: String,
    outline_width: f64,
    outline_color: String,
    shadow: bool,
    shadow_color: String,
    shadow_blur: f64,
    background: bool,
    background_color: String,
    background_padding: f64,
    letter_spacing: f64,
    line_spacing: f64,
    animation: String,
    animation_duration: f64,
}

#[derive(Clone)]
struct ClipDef {
    label: String,       // sanitized FFmpeg link label, e.g. "c3"
    input_index: i32,    // media input index (0 = text-only clip)
    path: String,
    kind: String,
    start: f64,
    duration: f64,
    source_offset: f64,
    speed: f64,
    volume: f64,
    muted: bool,
    scale: f64,
    pos_x: f64,
    pos_y: f64,
    rotation: f64,
    opacity: f64,
    crop_top: f64,
    crop_right: f64,
    crop_bottom: f64,
    crop_left: f64,
    flip_h: bool,
    flip_v: bool,
    fade_in: f64,
    fade_out: f64,
    audio_fade_in: f64,
    audio_fade_out: f64,
    z_index: i64,
    track_order: i64,
    track_hidden: bool,
    track_muted: bool,
    has_audio: bool,
    asset_width: i32,
    asset_height: i32,
    freeze: Option<Freeze>,
    audio_dsp: AudioDsp,
    keyframes: HashMap<String, Vec<Kf>>,
    effects: Vec<Effect>,
    transition_in: Option<Transition>,
    transition_out: Option<Transition>,
    text: Option<TextStyle>,
}

fn num(v: Option<&Value>, default: f64) -> f64 {
    v.and_then(|x| x.as_f64())
        .filter(|x| x.is_finite())
        .unwrap_or(default)
}
fn int(v: Option<&Value>, default: i64) -> i64 {
    v.and_then(|x| x.as_i64()).unwrap_or(default)
}
fn text(v: Option<&Value>, default: &str) -> String {
    v.and_then(|x| x.as_str()).unwrap_or(default).to_string()
}
fn boolean(v: Option<&Value>, default: bool) -> bool {
    v.and_then(|x| x.as_bool()).unwrap_or(default)
}

fn parse_audio_dsp(v: Option<&Value>) -> AudioDsp {
    let mut dsp = AudioDsp {
        threshold_db: -18.0,
        ratio: 3.0,
        attack_ms: 10.0,
        release_ms: 180.0,
        ..AudioDsp::default()
    };
    let Some(o) = v.and_then(|x| x.as_object()) else { return dsp; };
    dsp.enabled = boolean(o.get("enabled"), false);
    dsp.highpass_hz = num(o.get("highpassHz"), 0.0).clamp(0.0, 5000.0);
    dsp.lowpass_hz = num(o.get("lowpassHz"), 0.0).clamp(0.0, 22050.0);
    dsp.low_gain_db = num(o.get("lowGainDb"), 0.0).clamp(-24.0, 24.0);
    dsp.mid_gain_db = num(o.get("midGainDb"), 0.0).clamp(-24.0, 24.0);
    dsp.high_gain_db = num(o.get("highGainDb"), 0.0).clamp(-24.0, 24.0);
    dsp.compressor = boolean(o.get("compressor"), false);
    dsp.threshold_db = num(o.get("thresholdDb"), -18.0).clamp(-60.0, 0.0);
    dsp.ratio = num(o.get("ratio"), 3.0).clamp(1.0, 20.0);
    dsp.attack_ms = num(o.get("attackMs"), 10.0).clamp(1.0, 200.0);
    dsp.release_ms = num(o.get("releaseMs"), 180.0).clamp(10.0, 2000.0);
    dsp
}

fn collect_clips(project: &Value) -> Result<(Vec<ClipDef>, f64), String> {
    let clips = project
        .get("clips")
        .and_then(|c| c.as_array())
        .ok_or("Project has no clips array")?;
    let assets = project
        .get("assets")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();
    let mut asset_map: HashMap<String, Value> = HashMap::new();
    for a in assets {
        if let Some(id) = a.get("id").and_then(|i| i.as_str()) {
            asset_map.insert(id.to_string(), a);
        }
    }
    let tracks: HashMap<String, Value> = project
        .get("tracks")
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    t.get("id")
                        .and_then(|i| i.as_str())
                        .map(|id| (id.to_string(), t.clone()))
                })
                .collect()
        })
        .unwrap_or_default();

    let mut rows: Vec<(ClipDef, f64)> = Vec::new();
    let mut media_index = 1i32;

    for c in clips {
        let asset_id = text(c.get("assetId").or_else(|| c.get("asset_id")), "");
        let asset = asset_map.get(&asset_id).cloned().unwrap_or(Value::Null);
        let path = text(asset.get("path"), "");
        let is_text = c.get("text").and_then(|t| t.as_object()).is_some();
        if path.is_empty() && !is_text {
            continue;
        }
        let kind = text(asset.get("type"), "video");
        let transform = c.get("transform").cloned().unwrap_or(Value::Null);
        let pos = transform.get("position").cloned().unwrap_or(Value::Null);
        let crop = c.get("crop").cloned().unwrap_or(Value::Null);
        let track_id = text(c.get("trackId").or_else(|| c.get("track_id")), "");
        let track = tracks.get(&track_id).cloned().unwrap_or(Value::Null);

        let keyframes: HashMap<String, Vec<Kf>> = c
            .get("keyframes")
            .and_then(|k| k.as_array())
            .map(|arr| {
                let mut map: HashMap<String, Vec<Kf>> = HashMap::new();
                for k in arr {
                    let property = text(k.get("property"), "");
                    map.entry(property).or_default().push(Kf {
                        time: num(k.get("time"), 0.0),
                        value: num(k.get("value"), 0.0),
                        easing: text(k.get("easing"), "linear"),
                    });
                }
                for v in map.values_mut() {
                    v.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap());
                }
                map
            })
            .unwrap_or_default();

        let effects: Vec<Effect> = c
            .get("effects")
            .and_then(|e| e.as_array())
            .map(|arr| {
                arr.iter()
                    .filter(|e| boolean(e.get("enabled"), true))
                    .map(|e| Effect {
                        kind: text(e.get("kind"), ""),
                        value: num(e.get("value"), 0.0),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let parse_transition = |v: Option<&Value>| -> Option<Transition> {
            v.and_then(|x| x.as_object()).map(|o| Transition {
                kind: text(o.get("kind"), "fade"),
                duration: num(o.get("duration"), 0.5).max(0.01),
            })
        };
        let parse_text = |v: Option<&Value>| -> Option<TextStyle> {
            let o = v?.as_object()?;
            Some(TextStyle {
                text: text(o.get("text"), "Text"),
                font_family: text(o.get("fontFamily"), "Arial"),
                font_size: num(o.get("fontSize"), 64.0).max(4.0),
                font_weight: int(o.get("fontWeight"), 400),
                color: text(o.get("color"), "#ffffff"),
                align: text(o.get("align"), "center"),
                outline_width: num(o.get("outlineWidth"), 0.0).max(0.0),
                outline_color: text(o.get("outlineColor"), "#000000"),
                shadow: boolean(o.get("shadow"), false),
                shadow_color: text(o.get("shadowColor"), "#000000"),
                shadow_blur: num(o.get("shadowBlur"), 8.0).max(0.0),
                background: boolean(o.get("background"), false),
                background_color: text(o.get("backgroundColor"), "#000000"),
                background_padding: num(o.get("backgroundPadding"), 12.0),
                letter_spacing: num(o.get("letterSpacing"), 0.0),
                line_spacing: num(o.get("lineSpacing"), 1.2),
                animation: text(o.get("animation"), "none"),
                animation_duration: num(o.get("animationDuration"), 0.5).max(0.01),
            })
        };

        let speed = num(c.get("speed"), 1.0);
        let start = num(c.get("start"), 0.0).max(0.0);
        let duration = num(c.get("duration"), 1.0).max(1.0 / 240.0);
        let freeze = c.get("freeze").and_then(|f| f.as_object()).map(|f| {
            let at = num(f.get("at"), 0.0).clamp(0.0, duration);
            let fd = num(f.get("duration"), 0.0).max(0.0).min(duration - at);
            Freeze {
                enabled: boolean(f.get("enabled"), false) && fd > 1.0 / 240.0 && at < duration,
                at,
                duration: fd,
            }
        });
        let input_index = if path.is_empty() { 0 } else { let i = media_index; media_index += 1; i };

        rows.push((
            ClipDef {
                label: format!("c{}", rows.len()),
                input_index,
                path,
                kind,
                start,
                duration,
                source_offset: num(c.get("sourceOffset").or_else(|| c.get("source_offset")), 0.0).max(0.0),
                speed: {
                    let s = if speed.abs() < 0.05 { 0.05 } else { speed.abs() };
                    if speed < 0.0 { -s } else { s }
                },
                volume: num(c.get("volume"), 1.0).max(0.0),
                muted: boolean(c.get("muted"), false),
                scale: num(transform.get("scale"), 1.0).max(0.01),
                pos_x: num(pos.get("x"), 0.0),
                pos_y: num(pos.get("y"), 0.0),
                rotation: num(transform.get("rotation"), 0.0),
                opacity: num(c.get("opacity"), num(transform.get("opacity"), 1.0)).clamp(0.0, 1.0),
                crop_top: num(crop.get("top"), 0.0).max(0.0),
                crop_right: num(crop.get("right"), 0.0).max(0.0),
                crop_bottom: num(crop.get("bottom"), 0.0).max(0.0),
                crop_left: num(crop.get("left"), 0.0).max(0.0),
                flip_h: boolean(c.get("flipH"), false),
                flip_v: boolean(c.get("flipV"), false),
                fade_in: num(c.get("fadeIn"), 0.0).max(0.0),
                fade_out: num(c.get("fadeOut"), 0.0).max(0.0),
                audio_fade_in: num(c.get("audioFadeIn"), 0.0).max(0.0),
                audio_fade_out: num(c.get("audioFadeOut"), 0.0).max(0.0),
                z_index: int(c.get("zIndex"), 0),
                track_order: int(track.get("order"), 0),
                track_hidden: !track.is_null() && !boolean(track.get("visible"), true),
                track_muted: boolean(track.get("muted"), false),
                has_audio: boolean(asset.get("hasAudio").or_else(|| asset.get("has_audio")), false),
                asset_width: int(asset.get("width"), 0) as i32,
                asset_height: int(asset.get("height"), 0) as i32,
                freeze,
                audio_dsp: parse_audio_dsp(c.get("audioDsp")),
                keyframes,
                effects,
                transition_in: parse_transition(c.get("transitionIn").or_else(|| c.get("transition_in"))),
                transition_out: parse_transition(c.get("transitionOut").or_else(|| c.get("transition_out"))),
                text: parse_text(c.get("text")),
            },
            start + duration,
        ));
    }

    // Paint order: lower z-index first, so higher layers are composited on top.
    rows.sort_by(|a, b| {
        a.0.z_index
            .cmp(&b.0.z_index)
            .then(a.0.track_order.cmp(&b.0.track_order))
            .then(a.0.start.partial_cmp(&b.0.start).unwrap())
    });

    let mut clips = Vec::with_capacity(rows.len());
    let mut total = 0.0f64;
    for (row, end) in rows {
        total = total.max(end);
        clips.push(row);
    }
    Ok((clips, total))
}

/* ------------------------------------------------------------------ *
 * Expression helpers
 * ------------------------------------------------------------------ */

fn fnum(x: f64) -> String {
    let s = format!("{:.5}", x);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// FFmpeg audio filter segment for a clip's local DSP settings.
fn audio_dsp_filters(dsp: &AudioDsp) -> String {
    if !dsp.enabled {
        return String::new();
    }
    let mut chain = String::new();
    if dsp.highpass_hz > 20.0 {
        chain.push_str(&format!(",highpass=f={}", fnum(dsp.highpass_hz)));
    }
    if dsp.lowpass_hz > 100.0
        && dsp.lowpass_hz < 22000.0
        && (dsp.highpass_hz <= 20.0 || dsp.lowpass_hz > dsp.highpass_hz + 100.0)
    {
        chain.push_str(&format!(",lowpass=f={}", fnum(dsp.lowpass_hz)));
    }
    if dsp.low_gain_db.abs() > 0.05 {
        chain.push_str(&format!(
            ",lowshelf=f=160:width_type=q:width=1:g={}",
            fnum(dsp.low_gain_db)
        ));
    }
    if dsp.mid_gain_db.abs() > 0.05 {
        chain.push_str(&format!(
            ",equalizer=f=1000:t=q:w=1:g={}",
            fnum(dsp.mid_gain_db)
        ));
    }
    if dsp.high_gain_db.abs() > 0.05 {
        chain.push_str(&format!(
            ",highshelf=f=8000:width_type=q:width=1:g={}",
            fnum(dsp.high_gain_db)
        ));
    }
    if dsp.compressor {
        chain.push_str(&format!(
            ",acompressor=threshold={}dB:ratio={}:attack={}:release={}",
            fnum(dsp.threshold_db),
            fnum(dsp.ratio),
            fnum(dsp.attack_ms),
            fnum(dsp.release_ms),
        ));
    }
    chain
}

/// Build a `clamp`/`if` interpolation expression over keyframes.
/// Commas are escaped with `\,` so the expression is safe inside a single-quoted
/// FFmpeg filter option value.
fn interp(frames: &[Kf], var: &str, base: f64) -> String {
    if frames.is_empty() {
        return fnum(base);
    }
    if frames.len() == 1 {
        return fnum(frames[0].value);
    }
    let mut expr = String::new();
    for i in 0..frames.len() - 1 {
        let a = &frames[i];
        let b = &frames[i + 1];
        let span = (b.time - a.time).max(1e-6);
        let p = format!("clip(({var}-{})/{}\\,0\\,1)", fnum(a.time), fnum(span));
        let eased = match a.easing.as_str() {
            "easeIn" => format!("({p})*({p})"),
            "easeOut" => format!("1-(1-({p}))*(1-({p}))"),
            "easeInOut" => format!("({p})*({p})*(3-2*({p}))"),
            _ => p,
        };
        let value = format!(
            "{}+({}-{})*({})",
            fnum(a.value),
            fnum(b.value),
            fnum(a.value),
            eased
        );
        expr.push_str(&format!("if(lt({var}\\,{})\\,{}\\,", fnum(b.time), value));
    }
    expr.push_str(&fnum(frames.last().unwrap().value));
    for _ in 0..frames.len() - 1 {
        expr.push(')');
    }
    expr
}

fn effect_value(effects: &[Effect], kind: &str) -> f64 {
    effects
        .iter()
        .find(|e| e.kind == kind)
        .map(|e| e.value)
        .unwrap_or(0.0)
}
fn has_effect(effects: &[Effect], kind: &str) -> bool {
    effects.iter().any(|e| e.kind == kind)
}

fn esc_filter(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace(',', "\\,")
}
fn esc_drawtext(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace(':', "\\:")
        .replace('%', "\\%")
        .replace('\n', "\\n")
}

fn font_file(family: &str, weight: i64) -> Option<String> {
    let bold = weight >= 600;
    let file = match (family.to_ascii_lowercase().as_str(), bold) {
        ("arial", true) => "arialbd.ttf",
        ("arial", false) => "arial.ttf",
        ("verdana", true) => "verdanab.ttf",
        ("verdana", false) => "verdana.ttf",
        ("tahoma", true) => "tahomabd.ttf",
        ("tahoma", false) => "tahoma.ttf",
        ("times new roman", true) => "timesbd.ttf",
        ("times new roman", false) => "times.ttf",
        ("georgia", true) => "georgiab.ttf",
        ("georgia", false) => "georgia.ttf",
        ("courier new", true) => "courbd.ttf",
        ("courier new", false) => "cour.ttf",
        ("comic sans ms", true) => "comicbd.ttf",
        ("comic sans ms", false) => "comic.ttf",
        ("segoe ui", true) => "segoeui.ttf",
        ("segoe ui", false) => "segoeui.ttf",
        ("consolas", true) => "consolab.ttf",
        ("consolas", false) => "consola.ttf",
        _ if bold => "arialbd.ttf",
        _ => "arial.ttf",
    };
    let path = Path::new("C:\\Windows\\Fonts").join(file);
    if path.exists() {
        Some(path.to_string_lossy().to_string())
    } else {
        None
    }
}

/// FFmpeg's drawtext has no letter-spacing option; emulate positive spacing
/// by inserting a small number of spaces between glyphs.
fn spaced_text(text: &str, spacing: f64) -> String {
    if spacing <= 0.0 {
        return text.to_string();
    }
    let extra = (spacing / 8.0).round().clamp(1.0, 4.0) as usize;
    let gap = " ".repeat(extra);
    let mut chars = text.chars();
    let mut out = match chars.next() {
        Some(c) => c.to_string(),
        None => return String::new(),
    };
    for c in chars {
        out.push_str(&gap);
        out.push(c);
    }
    out
}

fn color_hex(value: &str) -> String {
    let v = value.trim();
    if let Some(hex) = v.strip_prefix('#') {
        format!("0x{}", hex)
    } else {
        v.to_string()
    }
}

/* ------------------------------------------------------------------ *
 * Canvas settings
 * ------------------------------------------------------------------ */

fn canvas_size(settings: &Value) -> (i32, i32) {
    let aspect = text(settings.get("aspectRatio"), "16:9");
    let resolution = text(settings.get("resolution"), "1080p");
    let ratio: f64 = match aspect.as_str() {
        "9:16" => 9.0 / 16.0,
        "1:1" => 1.0,
        "4:5" => 4.0 / 5.0,
        "21:9" => 21.0 / 9.0,
        _ => 16.0 / 9.0,
    };
    let mut w: i32;
    let mut h: i32;
    if aspect == "custom" || resolution == "custom" {
        let cw = int(settings.get("customWidth"), 0) as i32;
        let ch = int(settings.get("customHeight"), 0) as i32;
        if cw > 0 && ch > 0 {
            w = cw;
            h = ch;
        } else {
            h = 1080;
            w = (h as f64 * ratio).round() as i32;
        }
    } else {
        h = match resolution.as_str() {
            "480p" => 480,
            "720p" => 720,
            "1440p" => 1440,
            "4K" => 2160,
            _ => 1080,
        };
        w = (h as f64 * ratio).round() as i32;
    }
    w -= w % 2;
    h -= h % 2;
    (w.max(2), h.max(2))
}

/* ------------------------------------------------------------------ *
 * Filter-chain builders
 * ------------------------------------------------------------------ */

/// Build the source-side trim/speed chain shared by normal and frozen clips.
fn source_trim_chain(clip: &ClipDef) -> String {
    let mut chain = format!(
        "trim=start={}:end={},setpts=PTS-STARTPTS",
        fnum(clip.source_offset),
        fnum(clip.source_offset + clip.duration * clip.speed.abs())
    );
    if clip.speed < 0.0 {
        chain.push_str(&format!(
            ",reverse,setpts=PTS-STARTPTS/{}",
            fnum(clip.speed.abs())
        ));
    } else if (clip.speed - 1.0).abs() > 1e-4 {
        chain.push_str(&format!(",setpts=PTS-STARTPTS/{}", fnum(clip.speed)));
    }
    chain
}

fn build_video_filters(
    clip: &ClipDef,
    w: i32,
    h: i32,
    fps: i32,
    asset_width: i32,
    asset_height: i32,
) -> Vec<String> {
    let label = &clip.label;
    let mut parts = Vec::new();
    let base_label = format!("{}_base", label);
    parts.push(format!(
        "[{}:v]{}[{}]",
        clip.input_index,
        source_trim_chain(clip),
        base_label
    ));

    // A freeze is a hold inside the clip: the source segment is split into
    // before/hold/after parts, the hold is cloned for the requested duration,
    // then the parts are concatenated back into one continuous stream.
    let mut source_label = base_label.clone();
    if let Some(freeze) = &clip.freeze {
        if freeze.enabled && freeze.duration > 0.0 && freeze.at < clip.duration {
            let frame_dur = (1.0 / fps as f64).max(1.0 / 240.0);
            let hold_end = (freeze.at + freeze.duration).min(clip.duration);
            let mut segments: Vec<(String, String, String)> = Vec::new();
            let mut add_segment = |filter: String| {
                let i = segments.len();
                segments.push((
                    format!("{}_s{}", label, i),
                    filter,
                    format!("{}_s{}_o", label, i),
                ));
            };

            if freeze.at > 0.001 {
                add_segment(format!(
                    "trim=start=0:end={},setpts=PTS-STARTPTS",
                    fnum(freeze.at)
                ));
            }
            add_segment(format!(
                "trim=start={}:end={},select=eq(n\\,0),setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={},trim=duration={},setpts=PTS-STARTPTS,fps={}",
                fnum(freeze.at),
                fnum((freeze.at + frame_dur).min(clip.duration)),
                fnum(freeze.duration),
                fnum(freeze.duration),
                fps
            ));
            if hold_end < clip.duration - 0.001 {
                add_segment(format!(
                    "trim=start={}:end={},setpts=PTS-STARTPTS",
                    fnum(hold_end),
                    fnum(clip.duration)
                ));
            }

            let split_outputs = segments
                .iter()
                .map(|(input, _, _)| format!("[{}]", input))
                .collect::<Vec<_>>()
                .join("");
            parts.push(format!(
                "[{}]split={}{}",
                base_label,
                segments.len(),
                split_outputs
            ));
            let mut concat_inputs = Vec::new();
            for (input, filter, output) in &segments {
                parts.push(format!("[{}]{}[{}]", input, filter, output));
                concat_inputs.push(format!("[{}]", output));
            }
            let frozen_label = format!("{}_frozen", label);
            parts.push(format!(
                "{}concat=n={}:v=1:a=0[{}]",
                concat_inputs.join(""),
                segments.len(),
                frozen_label
            ));
            source_label = frozen_label;
        }
    }

    let mut chain = String::new();
    let ct = clip.crop_top.round() as i32;
    let cr = clip.crop_right.round() as i32;
    let cb = clip.crop_bottom.round() as i32;
    let cl = clip.crop_left.round() as i32;
    if ct > 0 || cr > 0 || cb > 0 || cl > 0 {
        chain.push_str(&format!(
            ",crop=iw-{}:ih-{}:{}:{}",
            cl + cr,
            ct + cb,
            cl,
            ct
        ));
    }

    // Scale matches CSS transforms: values below 1 shrink the media inside a
    // transparent canvas; values above 1 crop the enlarged media to that canvas.
    // A dynamic scale + pad + crop chain handles static and keyframed values
    // without ever asking pad to output less than its input.
    const MIN_SCALE: f64 = 0.05;
    const MAX_SCALE: f64 = 20.0;
    let scale_kfs = clip.keyframes.get("scale").cloned().unwrap_or_default();
    let base_scale = clip.scale.clamp(MIN_SCALE, MAX_SCALE);
    // The Inspector accepts a wide numeric range; clamp here so a hostile or
    // accidental value cannot allocate an enormous canvas or invert the crop.
    let max_scale = scale_kfs
        .iter()
        .map(|k| k.value.clamp(MIN_SCALE, MAX_SCALE))
        .fold(base_scale, f64::max);
    let pre_scale = max_scale.max(1.0);
    if !scale_kfs.is_empty() || (clip.scale - 1.0).abs() > 1e-4 {
        let aw = ((asset_width.max(2) + 1) / 2) * 2;
        let ah = ((asset_height.max(2) + 1) / 2) * 2;
        let scale_expr = interp(&scale_kfs, "t", base_scale);
        let factor = format!(
            "(clip(({})\\,{}\\,{})/{})",
            scale_expr,
            fnum(MIN_SCALE),
            fnum(MAX_SCALE),
            fnum(pre_scale)
        );
        chain.push_str(&format!(
            ",scale={}:{}:force_original_aspect_ratio=decrease,scale=w='iw*{}':h='ih*{}':eval=frame,pad=w='max({}\\,iw)':h='max({}\\,ih)':x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame,crop={}:{}:(iw-ow)/2:(ih-oh)/2",
            ((aw as f64 * pre_scale).round() as i32).max(2),
            ((ah as f64 * pre_scale).round() as i32).max(2),
            factor,
            factor,
            aw,
            ah,
            aw,
            ah
        ));
    }

    if clip.flip_h {
        chain.push_str(",hflip");
    }
    if clip.flip_v {
        chain.push_str(",vflip");
    }

    let rot_kfs = clip.keyframes.get("rotation").cloned().unwrap_or_default();
    let rot = interp(&rot_kfs, "t", clip.rotation);
    if clip.rotation.abs() > 1e-4 || !rot_kfs.is_empty() {
        let angle = format!("({})*PI/180", rot);
        chain.push_str(&format!(
            ",rotate=a='{}':ow=rotw('{}'):oh=roth('{}'):fillcolor=black@0",
            angle, angle, angle
        ));
    }

    chain.push_str(&format!(
        ",format=rgba,scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1",
        w, h, w, h
    ));

    // Color adjustments.
    let brightness = effect_value(&clip.effects, "brightness");
    let contrast = effect_value(&clip.effects, "contrast");
    let saturation = effect_value(&clip.effects, "saturation");
    let gamma = effect_value(&clip.effects, "gamma");
    let exposure = effect_value(&clip.effects, "exposure");
    let eq_b = 1.0 + brightness + exposure * 0.5;
    let eq_c = 1.0 + contrast - gamma * 0.3;
    let eq_s = 1.0 + saturation;
    if (eq_b - 1.0).abs() > 1e-4 || (eq_c - 1.0).abs() > 1e-4 || (eq_s - 1.0).abs() > 1e-4 {
        chain.push_str(&format!(
            ",eq=brightness={}:contrast={}:saturation={}",
            fnum(eq_b),
            fnum(eq_c),
            fnum(eq_s)
        ));
    }
    let temperature = effect_value(&clip.effects, "temperature");
    let tint = effect_value(&clip.effects, "tint");
    let highlights = effect_value(&clip.effects, "highlights");
    let shadows = effect_value(&clip.effects, "shadows");
    if temperature.abs() > 1e-4
        || tint.abs() > 1e-4
        || highlights.abs() > 1e-4
        || shadows.abs() > 1e-4
    {
        chain.push_str(&format!(
            ",colorbalance=rs={}:bs={}:gs={}",
            fnum(1.0 + temperature * 0.4 + highlights * 0.2),
            fnum(1.0 - temperature * 0.4 + shadows * 0.2),
            fnum(1.0 + tint * 0.3)
        ));
    }
    let sharpness = effect_value(&clip.effects, "sharpness");
    if has_effect(&clip.effects, "sharpness") && sharpness.abs() > 1e-4 {
        chain.push_str(&format!(
            ",unsharp=5:5:{}",
            fnum(sharpness.clamp(-1.0, 2.0))
        ));
    }
    let blur = effect_value(&clip.effects, "blur").max(effect_value(&clip.effects, "gaussianBlur"));
    if blur > 1e-4 {
        chain.push_str(&format!(",gblur=sigma={}", fnum(blur * 10.0)));
    }
    if effect_value(&clip.effects, "grayscale") > 0.0 {
        chain.push_str(",hue=s=0");
    }
    if effect_value(&clip.effects, "sepia") > 0.0 {
        let amount = effect_value(&clip.effects, "sepia").clamp(0.0, 1.0);
        chain.push_str(&format!(
            ",colorchannelmixer={}:{}:{}",
            fnum(1.0 - 0.4 * amount),
            fnum(1.0 - 0.15 * amount),
            fnum(0.2 * amount)
        ));
    }
    if has_effect(&clip.effects, "vignette") {
        chain.push_str(",vignette=PI/5");
    }

    // Video fades (clip-local time).
    if clip.fade_in > 0.0 {
        chain.push_str(&format!(
            ",fade=t=in:st=0:d={}",
            fnum(clip.fade_in.min(clip.duration))
        ));
    }
    if clip.fade_out > 0.0 {
        chain.push_str(&format!(
            ",fade=t=out:st={}:d={}",
            fnum((clip.duration - clip.fade_out).max(0.0)),
            fnum(clip.fade_out.min(clip.duration))
        ));
    }

    // Opacity and transition envelopes are time-varying, so geq is used
    // whenever either keyframes or transitions are present.
    let opacity_kfs = clip.keyframes.get("opacity").cloned().unwrap_or_default();
    let has_transitions = clip.transition_in.is_some() || clip.transition_out.is_some();
    if opacity_kfs.is_empty() && !has_transitions {
        if (clip.opacity - 1.0).abs() > 1e-4 {
            chain.push_str(&format!(",colorchannelmixer=aa={}", fnum(clip.opacity)));
        }
    } else {
        let mut alpha = if opacity_kfs.is_empty() {
            fnum(clip.opacity)
        } else {
            interp(&opacity_kfs, "T", clip.opacity)
        };
        if let Some(tin) = &clip.transition_in {
            alpha = format!("min({}\\,clip(T/{}\\,0\\,1))", alpha, fnum(tin.duration));
        }
        if let Some(tout) = &clip.transition_out {
            alpha = format!(
                "min({}\\,clip(({}-T)/{}\\,0\\,1))",
                alpha,
                fnum(clip.duration),
                fnum(tout.duration)
            );
        }
        chain.push_str(&format!(
            ",geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='{}'",
            alpha
        ));
    }

    // Filter fragments are appended with leading commas. Remove the first one
    // so `[N:v],format=...` never becomes an empty filter before `format`.
    parts.push(format!("[{}]{}[{}_v]", source_label, chain.trim_start_matches(','), label));
    parts
}

fn build_overlay_filter(clip: &ClipDef, chain_label: &str, out_label: &str, w: i32, _h: i32) -> String {
    let x_kfs = clip.keyframes.get("positionX").cloned().unwrap_or_default();
    let y_kfs = clip.keyframes.get("positionY").cloned().unwrap_or_default();
    // overlay expressions use lowercase `t` (uppercase T is geq-only).
    let mut x = interp(&x_kfs, "t", clip.pos_x);
    let mut y = interp(&y_kfs, "t", clip.pos_y);
    // Center the clip, then apply the user's pixel offset.
    x = format!("(W-w)/2+{}", x);
    y = format!("(H-h)/2+{}", y);

    if let Some(tin) = &clip.transition_in {
        if tin.kind == "slide" || tin.kind == "wipe" {
            x = format!(
                "{}-{}*clip(1-t/{}\\,0\\,1)",
                x,
                fnum(w as f64 * 0.6),
                fnum(tin.duration)
            );
        }
    }
    if let Some(tout) = &clip.transition_out {
        if tout.kind == "slide" || tout.kind == "wipe" {
            x = format!(
                "{}+{}*clip(1-({}-t)/{}\\,0\\,1)",
                x,
                fnum(w as f64 * 0.6),
                fnum(clip.duration),
                fnum(tout.duration)
            );
        }
    }
    format!(
        "[{}][{}_v]overlay=x='{}':y='{}':enable='gte(t,{})*lt(t,{})':shortest=0[{}]",
        chain_label,
        clip.label,
        x,
        y,
        fnum(clip.start),
        fnum(clip.start + clip.duration),
        out_label
    )
}

/// Build text drawtext filters. `chain` is the current video label, `out` the
/// final label; intermediate labels use a deterministic numeric suffix.
fn build_text_filters(clip: &ClipDef, chain: &str, out: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let t = match &clip.text {
        Some(t) => t,
        None => return parts,
    };
    let font = font_file(&t.font_family, t.font_weight);
    let start = clip.start;
    let end = clip.start + clip.duration;
    let font_size = fnum(t.font_size);
    let x = format!("(w-text_w)/2+{}", fnum(clip.pos_x));
    let mut y = format!("(h-text_h)/2+{}", fnum(clip.pos_y));

    if let Some(tin) = &clip.transition_in {
        if tin.kind == "slide" || tin.kind == "wipe" {
            y = format!(
                "{}-{}*clip(1-(t-{})/{}\\,0\\,1)",
                y,
                fnum(80.0),
                fnum(start),
                fnum(tin.duration)
            );
        }
    }

    let mut alpha = "1".to_string();
    match t.animation.as_str() {
        "fadeIn" => {
            alpha = format!("clip((t-{})/{}\\,0\\,1)", fnum(start), fnum(t.animation_duration))
        }
        "fadeOut" => {
            alpha = format!("clip(({}-t)/{}\\,0\\,1)", fnum(end), fnum(t.animation_duration))
        }
        "slideIn" => {
            alpha = format!("clip((t-{})/{}\\,0\\,1)", fnum(start), fnum(t.animation_duration));
        }
        "slideOut" => {
            alpha = format!("clip(({}-t)/{}\\,0\\,1)", fnum(end), fnum(t.animation_duration));
        }
        "zoomIn" | "zoomOut" => {
            alpha = format!("clip((t-{})/{}\\,0\\,1)", fnum(start), fnum(t.animation_duration));
        }
        _ => {}
    }

    let mut fontsize_expr = font_size.clone();
    if t.animation == "zoomIn" {
        fontsize_expr = format!(
            "{}*(0.4+0.6*clip((t-{})/{}\\,0\\,1))",
            font_size,
            fnum(start),
            fnum(t.animation_duration)
        );
    } else if t.animation == "zoomOut" {
        fontsize_expr = format!(
            "{}*(1.6-0.6*clip(({}-t)/{}\\,0\\,1))",
            font_size,
            fnum(end),
            fnum(t.animation_duration)
        );
    }

    // drawtext has no fontweight or spacing option: bold is a font file choice
    // and positive spacing is emulated with inserted spaces.
    let alpha = if (clip.opacity - 1.0).abs() > 1e-4 {
        format!("({})*{}", alpha, fnum(clip.opacity))
    } else {
        alpha
    };
    let display_text = spaced_text(&t.text, t.letter_spacing);
    let line_spacing = (t.font_size * (t.line_spacing - 1.0)).round().max(0.0) as i64;
    let mut base = format!(
        "drawtext={}text='{}':fontsize='{}':fontcolor={}:x='{}':y='{}':alpha='{}':line_spacing={}",
        font.as_ref()
            .map(|f| format!("fontfile='{}':", esc_filter(f)))
            .unwrap_or_default(),
        esc_drawtext(&display_text),
        fontsize_expr,
        color_hex(&t.color),
        x,
        y,
        alpha,
        line_spacing
    );
    if t.align == "right" {
        base.push_str(":x=w-text_w-20");
    } else if t.align == "left" {
        base.push_str(":x=20");
    }
    if t.outline_width > 0.0 {
        base.push_str(&format!(
            ":borderw={}:bordercolor={}",
            fnum(t.outline_width),
            color_hex(&t.outline_color)
        ));
    }
    if t.shadow {
        let offset = (t.shadow_blur / 3.0).round().max(1.0) as i64;
        base.push_str(&format!(
            ":shadowx={}:shadowy={}:shadowcolor={}",
            offset,
            offset,
            color_hex(&t.shadow_color)
        ));
    }
    if t.background {
        base.push_str(&format!(
            ":box=1:boxcolor={}:boxborderw={}",
            color_hex(&t.background_color),
            fnum(t.background_padding)
        ));
    }
    let filters: Vec<String> = if t.animation == "typewriter" {
        let chars: Vec<char> = t.text.chars().take(80).collect();
        if chars.is_empty() {
            vec![format!("{}:enable='gte(t,{})*lt(t,{})'", base, fnum(start), fnum(end))]
        } else {
            let step = t.animation_duration / chars.len() as f64;
            chars
                .iter()
                .enumerate()
                .map(|(i, _)| {
                    let prefix: String = chars.iter().take(i + 1).collect();
                    let mut f = base.clone();
                    let escaped = esc_drawtext(&spaced_text(&prefix, t.letter_spacing));
                    if let Some(pos) = f.find("text='") {
                        let rest = &f[pos + 6..];
                        if let Some(end_pos) = rest.find("':fontsize") {
                            let abs_end = pos + 6 + end_pos;
                            f.replace_range(pos + 6..abs_end, &escaped);
                        }
                    }
                    let on = start + i as f64 * step;
                    let off = if i + 1 == chars.len() { end } else { on + step };
                    format!("{}:enable='gte(t,{})*lt(t,{})'", f, fnum(on), fnum(off))
                })
                .collect()
        }
    } else {
        vec![format!("{}:enable='gte(t,{})*lt(t,{})'", base, fnum(start), fnum(end))]
    };

    let mut label = chain.to_string();
    for (i, filter) in filters.iter().enumerate() {
        let out_label = if i + 1 == filters.len() {
            out.to_string()
        } else {
            format!("{}_txt{}", clip.label, i)
        };
        parts.push(format!("[{}]{}[{}]", label, filter, out_label));
        label = out_label;
    }
    parts
}

fn build_audio_filters(clip: &ClipDef, has_stream: bool) -> Option<String> {
    if clip.muted || clip.track_muted || !has_stream {
        return None;
    }
    let trim_end = clip.source_offset + clip.duration * clip.speed.abs();
    let mut chain = format!(
        "atrim=start={}:end={},asetpts=PTS-STARTPTS",
        fnum(clip.source_offset),
        fnum(trim_end)
    );
    if clip.speed < 0.0 {
        chain.push_str(",areverse");
    } else if (clip.speed - 1.0).abs() > 1e-4 {
        let mut remaining = clip.speed.abs();
        while remaining > 2.0 + 1e-6 {
            chain.push_str(",atempo=2.0");
            remaining /= 2.0;
        }
        while remaining < 0.5 - 1e-6 {
            chain.push_str(",atempo=0.5");
            remaining *= 2.0;
        }
        chain.push_str(&format!(",atempo={}", fnum(remaining)));
    }
    chain.push_str(&audio_dsp_filters(&clip.audio_dsp));
    let vol_kfs = clip.keyframes.get("volume").cloned().unwrap_or_default();
    let volume = interp(&vol_kfs, "t", clip.volume);
    chain.push_str(&format!(",volume='{}'", volume));
    if clip.audio_fade_in > 0.0 {
        chain.push_str(&format!(
            ",afade=t=in:st=0:d={}",
            fnum(clip.audio_fade_in.min(clip.duration))
        ));
    }
    if clip.audio_fade_out > 0.0 {
        chain.push_str(&format!(
            ",afade=t=out:st={}:d={}",
            fnum((clip.duration - clip.audio_fade_out).max(0.0)),
            fnum(clip.audio_fade_out.min(clip.duration))
        ));
    }
    let delay_ms = (clip.start * 1000.0).round() as u64;
    chain.push_str(&format!(",adelay={}|{}", delay_ms, delay_ms));
    Some(format!(
        "[{}:a]{}[{}_a]",
        clip.input_index, chain, clip.label
    ))
}

/* ------------------------------------------------------------------ *
 * Export command
 * ------------------------------------------------------------------ */

#[command(rename_all = "snake_case")]
pub async fn ffmpeg_export<R: Runtime>(
    app: AppHandle<R>,
    project_json: String,
    output_path: String,
) -> Result<Value, String> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let started = now_ms();
    let project: Value =
        serde_json::from_str(&project_json).map_err(|e| format!("Invalid project JSON: {e}"))?;
    let settings = project.get("settings").cloned().unwrap_or(Value::Null);
    let (w, h) = canvas_size(&settings);
    let fps = int(settings.get("fps"), 30).clamp(1, 240);
    let codec = text(settings.get("codec"), "h264");
    let crf = int(settings.get("crf"), 23).clamp(0, 63);
    let audio_bitrate = int(
        settings
            .get("audioBitrate")
            .or_else(|| settings.get("audio_bitrate")),
        128,
    )
    .clamp(32, 512);

    let (clips, total_duration) = collect_clips(&project)?;
    if clips.is_empty() {
        return Err("No clips to export. Add media to the timeline first.".into());
    }
    if !total_duration.is_finite() || total_duration <= 0.0 {
        return Err("Project has no valid duration.".into());
    }
    let total_ms = (total_duration * 1000.0).max(1.0) as u64;

    let ext = output_path
        .rsplit('.')
        .next()
        .unwrap_or("mp4")
        .to_ascii_lowercase();
    let (vcodec, acodec, use_faststart) = match ext.as_str() {
        "webm" => ("libvpx-vp9", "libopus", false),
        "mkv" => (codec_for(&codec), "aac", false),
        _ => (codec_for(&codec), "aac", true),
    };

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("warning")
        .arg("-f")
        .arg("lavfi")
        .arg("-t")
        .arg(format!("{:.3}", total_duration))
        .arg("-i")
        .arg(format!("color=c=black:s={}x{}:r={}", w, h, fps));

    // Inputs are added in the same order as collect_clips assigned input_index.
    let mut inputs: Vec<&ClipDef> = clips.iter().filter(|c| c.input_index > 0).collect();
    inputs.sort_by_key(|c| c.input_index);
    for clip in inputs {
        if clip.kind == "image" {
            cmd.arg("-loop")
                .arg("1")
                .arg("-framerate")
                .arg(fps.to_string())
                .arg("-t")
                .arg(format!("{:.3}", clip.duration))
                .arg("-i")
                .arg(&clip.path);
        } else {
            cmd.arg("-i").arg(&clip.path);
        }
    }

    let mut filter_parts: Vec<String> = Vec::new();
    let mut audio_labels: Vec<String> = Vec::new();
    let mut video_chain = "0:v".to_string();
    let mut layer = 0usize;

    for clip in &clips {
        if clip.track_hidden {
            continue;
        }
        if clip.text.is_some() {
            let out = format!("vlay{}", layer + 1);
            filter_parts.extend(build_text_filters(clip, &video_chain, &out));
            video_chain = out;
            layer += 1;
            continue;
        }
        if clip.input_index == 0 {
            continue;
        }
        // Audio-only assets have no video stream; never emit a `[N:v]` filter
        // for them or the filtergraph will fail to bind.
        if clip.kind == "video" || clip.kind == "image" {
            let asset_w = if clip.asset_width > 0 { clip.asset_width } else { w };
            let asset_h = if clip.asset_height > 0 { clip.asset_height } else { h };
            filter_parts.extend(build_video_filters(clip, w, h, fps as i32, asset_w, asset_h));
            layer += 1;
            let out = format!("vlay{}", layer);
            filter_parts.push(build_overlay_filter(clip, &video_chain, &out, w, h));
            video_chain = out;
        }

        // Images have no audio stream; probing other clips avoids trusting
        // possibly stale metadata.
        let has_stream = if clip.kind == "image" {
            false
        } else {
            clip.has_audio || has_audio_stream(&clip.path)
        };
        if let Some(a) = build_audio_filters(clip, has_stream) {
            filter_parts.push(a);
            audio_labels.push(format!("[{}_a]", clip.label));
        }
    }

    filter_parts.push(format!("[{}]format=yuv420p[vout]", video_chain));
    if audio_labels.is_empty() {
        filter_parts.push(format!(
            "anullsrc=channel_layout=stereo:sample_rate=48000:d={:.3}[aout]",
            total_duration
        ));
    } else {
        filter_parts.push(format!(
            "{}amix=inputs={}:duration=longest:dropout_transition=0,atrim=duration={:.3}[aout]",
            audio_labels.join(""),
            audio_labels.len(),
            total_duration
        ));
    }

    let filter_graph = filter_parts.join(";");
    cmd.arg("-filter_complex")
        .arg(&filter_graph)
        .arg("-map")
        .arg("[vout]")
        .arg("-map")
        .arg("[aout]")
        .arg("-r")
        .arg(fps.to_string())
        .arg("-c:v")
        .arg(vcodec);
    match vcodec {
        "libx264" | "libx265" => {
            cmd.arg("-preset").arg("veryfast").arg("-crf").arg(crf.to_string());
        }
        "libvpx-vp9" => {
            cmd.arg("-deadline")
                .arg("realtime")
                .arg("-cpu-used")
                .arg("5")
                .arg("-b:v")
                .arg("0")
                .arg("-crf")
                .arg(crf.to_string());
        }
        "libaom-av1" => {
            cmd.arg("-cpu-used")
                .arg("8")
                .arg("-b:v")
                .arg("0")
                .arg("-crf")
                .arg(crf.to_string());
        }
        _ => {}
    }
    cmd.arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:a")
        .arg(acodec)
        .arg("-b:a")
        .arg(format!("{}k", audio_bitrate));
    if use_faststart {
        cmd.arg("-movflags").arg("+faststart");
    }
    cmd.arg("-progress")
        .arg("pipe:1")
        .arg("-nostats")
        .arg(&output_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg failed to start: {e}"))?;
    let stdout = child.stdout.take().ok_or("Could not read ffmpeg progress")?;
    let stderr = child.stderr.take().ok_or("Could not read ffmpeg diagnostics")?;
    let error_log = Arc::new(Mutex::new(Vec::<String>::new()));

    let app_progress = app.clone();
    let progress_path = output_path.clone();
    let (done_tx, done_rx) = oneshot::channel::<()>();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut last_percent = 0u64;
        while let Ok(Some(line)) = reader.next_line().await {
            if let Some(value) = line.strip_prefix("out_time_ms=") {
                if let Ok(us) = value.parse::<u64>() {
                    let elapsed_ms = us / 1000;
                    let pct = ((elapsed_ms as f64 / total_ms as f64) * 100.0).min(100.0) as u64;
                    if pct > last_percent {
                        last_percent = pct;
                        let wall_elapsed = now_ms().saturating_sub(started);
                        let remaining = if pct > 1 && pct < 100 {
                            wall_elapsed.saturating_mul(100 - pct) / pct
                        } else {
                            0
                        };
                        let _ = app_progress.emit(
                            "ffmpeg-export-progress",
                            serde_json::json!({
                                "percent": pct,
                                "estimatedRemainingMs": remaining,
                            }),
                        );
                    }
                }
            } else if line == "progress=end" {
                let _ = app_progress.emit("ffmpeg-export-progress", serde_json::json!({"percent": 100}));
                let _ = app_progress.emit(
                    "ffmpeg-export-complete",
                    serde_json::json!({"outputPath": progress_path}),
                );
                break;
            }
        }
        let _ = done_tx.send(());
    });

    let log_for_task = error_log.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let mut log = log_for_task.lock().unwrap();
            log.push(line);
            if log.len() > 200 {
                log.remove(0);
            }
        }
    });

    loop {
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            let _ = tokio::fs::remove_file(&output_path).await;
            return Err("Export cancelled".into());
        }
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                let _ = done_rx.await;
                let _ = stderr_task.await;
                if !status.success() {
                    let log = error_log.lock().unwrap().join("\n");
                    let tail: String = log
                        .chars()
                        .rev()
                        .take(1800)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect();
                    return Err(format!(
                        "ffmpeg export failed (status {}).\nFilter graph: {}\n{}",
                        status, filter_graph, tail
                    ));
                }
                break;
            }
            None => sleep(Duration::from_millis(100)).await,
        }
    }

    Ok(serde_json::json!({
        "outputPath": output_path,
        "durationMs": now_ms().saturating_sub(started),
    }))
}

fn codec_for(codec: &str) -> &'static str {
    match codec {
        "h265" => "libx265",
        "vp9" => "libvpx-vp9",
        "av1" => "libaom-av1",
        _ => "libx264",
    }
}

fn has_audio_stream(path: &str) -> bool {
    std::process::Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            path,
        ])
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}

#[command]
pub fn ffmpeg_cancel_export() -> Result<(), String> {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn audio_dsp_filters_build_real_chain() {
        let raw = json!({
            "enabled": true,
            "highpassHz": 90,
            "lowpassHz": 12000,
            "lowGainDb": -3,
            "midGainDb": 2,
            "highGainDb": 4,
            "compressor": true,
            "thresholdDb": -18,
            "ratio": 3,
            "attackMs": 10,
            "releaseMs": 180
        });
        let chain = audio_dsp_filters(&parse_audio_dsp(Some(&raw)));
        assert!(chain.contains("highpass=f=90"), "{}", chain);
        assert!(chain.contains("lowpass=f=12000"), "{}", chain);
        assert!(chain.contains("lowshelf=f=160:width_type=q:width=1:g=-3"), "{}", chain);
        assert!(chain.contains("equalizer=f=1000:t=q:w=1:g=2"), "{}", chain);
        assert!(chain.contains("highshelf=f=8000:width_type=q:width=1:g=4"), "{}", chain);
        assert!(
            chain.contains("acompressor=threshold=-18dB:ratio=3:attack=10:release=180"),
            "{}",
            chain
        );
    }

    #[test]
    fn audio_dsp_disabled_emits_no_filters() {
        let raw = json!({ "enabled": false, "highpassHz": 90, "compressor": true });
        assert!(audio_dsp_filters(&parse_audio_dsp(Some(&raw))).is_empty());
    }
}
