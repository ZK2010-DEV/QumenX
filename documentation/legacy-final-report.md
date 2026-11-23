# QumenX — Professional Video Editor

A free, fully local desktop video editor built with Tauri 2 + React + TypeScript + Tailwind + Zustand + FFmpeg. No paid services, subscriptions, watermarks, cloud dependencies or simulated exports.

## Current status

**Functional v1.0.0 — verified 2026-11-24.** The frontend builds, the Rust backend compiles as `qumenx v1.0.0`, the native window launches, and the full end-to-end suite passes **12/12** with zero console errors or runtime exceptions. Fresh MSI and NSIS installers were rebuilt and the standalone release executable was smoke-tested with a real FFmpeg export. See `FINAL_REPORT.md` for exact `ffprobe` results, bundle sizes and known limitations.

## What is implemented

- Modern dark UI: media/audio/text/sticker/effect/transition/filter/speed/title panels, live preview, multi-track timeline, inspector, project settings, import/export dialogs and a Backups & Recent dialog.
- Media import through the native dialog with `ffprobe` metadata, cached thumbnails/waveforms, and cached low-resolution preview proxies. Source media is never modified.
- Timeline: drag, trim, split, duplicate, delete, cross-track move, group, multi-select, snapping, frame quantization, zoom, playhead, track resize, waveforms, keyframe diamonds, and track visibility/mute/lock. Locked tracks block edits without polluting undo history.
- Editing: crop, rotate, flip, resize, reverse, freeze, speed, color, transform, text styling and animation, keyframes, transitions, effects, audio mixing and fades. Controls are wired to real store actions.
- Preview composition with overlays and audio, source-time mapping for speed/reverse/freeze, proxy fallback to original media, aspect ratios, safe zones, vignette and fullscreen — no full-resolution renders while editing.
- Project New/Open/Save with validated version-2 JSON, automatic rotating backups (max 12), corrupt-file recovery, backup restore and one-time migration from the old data folder.
- FFmpeg export with resolution/aspect/FPS/codec/CRF control, real progress events, cancellation, bounded scale expressions and diagnostic filter graphs on failure.
- Undo/redo with labeled history and consistent multi-operation behavior.

## Requirements

- Node.js + npm
- Rust with the `stable-x86_64-pc-windows-gnu` toolchain + WinLibs MinGW (see `src-tauri/cargo-gnu.cmd`)
- FFmpeg/ffprobe on PATH (for example winget `Gyan.FFmpeg.Essentials`)

## Build & run (from `QumenX/`)

```
npm install
npm run build                  # frontend production build
cd src-tauri && cmd /c cargo-gnu.cmd check
cd src-tauri && cmd /c cargo-gnu.cmd build
cmd /c dev-tauri.cmd           # launch the desktop app in dev mode
cmd /c build-tauri.cmd         # build MSI + NSIS installers
```

Installers are produced under `C:\Users\Gamer\capcut-target\release\bundle` (override with `CARGO_TARGET_DIR`):

- `msi\QumenX_1.0.0_x64_en-US.msi` — 4.27 MiB
- `nsis\QumenX_1.0.0_x64-setup.exe` — 2.98 MiB

The `*.cmd` wrappers set the GNU toolchain, MinGW linker path and a space-free `CARGO_TARGET_DIR` required on this machine.

## Verification (from `QumenX/`)

```
powershell -NoProfile -ExecutionPolicy Bypass -File run-qmenx-e2e.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File run-release-progress.ps1
```

The first script launches Vite plus the real `qumenx.exe`, drives it over WebView2 CDP, performs 12 checks (real exports, persistence, backup/recovery, undo/redo, freeze, scale, proxies and app health), and writes results to `C:\Users\Gamer\AppData\Local\Temp\qumenx-e2e\results.json`. The second smoke-tests the standalone release binary and its real export/progress events.

Every generated MP4 was re-probed with `ffprobe`; exports are real H.264/AAC files with verified durations, stream types, dimensions and sizes. Freeze holds are verified perceptually with SSIM because exact decoded MD5 hashes are not stable under lossy H.264.

## Data locations

- Projects/recent list: `%APPDATA%\QumenX\` (migrated once from the old `capcut-editor` folder).
- Automatic backups: `%APPDATA%\QumenX\backups\` (up to 12 timestamped `.bak` files per project).
- Preview proxies: `%LOCALAPPDATA%\QumenX\proxies\`, keyed by source path and mtime.
- Thumbnails and waveforms: QumenX cache directories.

## Notes

- `ffmpeg`/`ffprobe` must be on PATH at runtime; the application is otherwise fully offline.
- Hardware/codec capability UI is informational; exports use reliable software encoders.
- UI export is serialized; concurrent native export calls are not supported.
- A non-fatal MinGW `.rsrc merge failure: multiple non-default manifests` linker warning remains.
