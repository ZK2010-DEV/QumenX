# QumenX — build and verification report

Final verification was completed on **2026-11-24** against the real desktop application: native Tauri IPC, real FFmpeg exports checked with `ffprobe`, real save/backup/recovery calls, and a release-binary smoke test. The earlier 8-check report and the stale pre-rebrand bundle numbers are superseded by this document.

## Product

- **Name:** QumenX — Professional Video Editor
- **Version:** `1.0.0` · identifier `com.qumenx.editor` · binary `qumenx.exe`
- **Architecture:** Tauri 2 + React 19 + TypeScript + Tailwind + Zustand + FFmpeg. Everything runs locally; there are no paid APIs, subscriptions, watermarks, cloud services or simulated exports.
- The existing `QumenX/` tree was extended in place rather than replaced.
- Version/branding metadata is unified across `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` and `index.html`; the release executable reports product/file version `1.0.0`.

## Verification summary

### Frontend and backend builds

- `npm run build` passes TypeScript (`tsc -b`) and Vite production build. Final `QumenX/dist` output:
  - `index.html` — 0.69 kB (0.41 kB gzip)
  - CSS — 26.20 kB (5.80 kB gzip)
  - JS — 386.70 kB (114.10 kB gzip)
- `npm run lint` has **no errors**; only non-blocking warnings remain in legacy QA scripts and a few unused imports/legacy UI primitives.
- `cmd /c cargo-gnu.cmd build` passes as `qumenx v1.0.0` in both debug and release profiles.
- Toolchain: `stable-x86_64-pc-windows-gnu` with WinLibs MinGW and `CARGO_TARGET_DIR=C:\Users\Gamer\capcut-target` (the space-free target path is required by MinGW `windres`).
- One non-fatal linker warning persists: `.rsrc merge failure: multiple non-default manifests`. The binary links, launches and functions correctly.

### Native desktop app

- The real Tauri window opens with the title **QumenX — Professional Video Editor**, 1300×850, with active `window.__TAURI_INTERNALS__` native IPC.
- Final E2E health check: title `QumenX — Professional Video Editor`, 422 DOM nodes, `isTauri: true`, **zero console errors, zero runtime exceptions**.
- The dev URL is pinned to `http://127.0.0.1:5173` and Vite starts with `--host 127.0.0.1`. This fixes an environment-specific `localhost` IPv6 timeout that previously produced a blank CDP target. The CDP harness now waits for a genuinely loaded Tauri page and the dev-only store hook before running tests.

### Full E2E suite: 12/12 passed

`run-qmenx-e2e.ps1` launches Vite plus the real debug `qumenx.exe`, drives the app over WebView2 CDP, and invokes real native commands. Every export is written to disk and probed with `ffprobe`.

| Check | Final result |
| --- | --- |
| TEST 1 — import, trim/source-offset, export | `1.50 s`, `h264 852x480`, `aac`, 40,588 bytes |
| TEST 2 — two clips + transition, export | `3.00 s`, `h264 852x480`, `aac`, 41,672 bytes |
| TEST 3 — music, volume keyframes, audio fades, export | `3.00 s`, `h264 852x480`, `aac`, 70,820 bytes |
| TEST 4 — styled/animating text over image, export | `2.00 s`, `h264 852x480`, `aac`, 39,256 bytes |
| TEST 5 — keyframed scale/position/opacity + saturation, export | `2.00 s`, `h264 852x480`, `aac`, 34,752 bytes |
| TEST 6 — save, rotating backup, deliberate corruption, recovery, restore | 12 backups; recovered `Backup Test` from `%APPDATA%\QumenX\backups\...bak`; restored name/contents correctly |
| TEST 6b — full 4-track/4-clip project close and reopen | `signatureMatch: true`, expected/actual signature length `1648`; 4 tracks and 4 clips restored |
| TEST 7 — two additions, two undos, two redos via real UI buttons | clip counts `4 → 5 → 6 → 5 → 4 → 5 → 6`; history diag past `4`, future `0` |
| TEST 8 — mid-clip freeze hold/export | `1.80 s`, `h264 852x480`, `aac`, 44,601 bytes; hold SSIM `0.99974`, post-hold motion SSIM `0.91048` |
| TEST 9 — static scale preview/export parity | content centroid `yFull=41`, `yHalf=16`; both exports `852x480` |
| TEST 10 — proxy generation and preview use | proxy created, source unchanged, proxy stream `video:h264:960x540`, preview used `%LOCALAPPDATA%\QumenX\proxies\f601b477609b7a26.mp4` |
| App health / no runtime errors | passed; `errors: []` |

Machine-readable results: `C:\Users\Gamer\AppData\Local\Temp\qumenx-e2e\results.json`.

#### Freeze verification note

The pre-encode freeze filter graph is frame-exact: a direct `framemd5` check produced an identical hash (`0c99b0cdca358a619bf0493352611bd6`) for raw frames 15–32. After lossy H.264 encoding, two decoded frames from the hold window can have different MD5 values even though they are visually identical. TEST 8 therefore verifies perceptual stability with FFmpeg `ssim`: two samples inside the hold score `0.99974`, while a sample after the hold drops to `0.91048`. This tests the actual exported video without making a lossy codec satisfy an impossible exact-hash criterion.

### `ffprobe` results for every generated media file

Final table also saved to `C:\Users\Gamer\AppData\Local\Temp\qumenx-e2e\ffprobe-final.txt`.

| File | Duration | Video | Audio | Bytes |
| --- | ---: | --- | --- | ---: |
| `f601b477609b7a26.mp4` (preview proxy) | 2.000000 | h264:960x540 | — | 52,689 |
| `scale-source.mp4` (TEST 9 fixture) | 2.000000 | h264:640x360 | — | 3,398 |
| `test1-trim.mp4` | 1.500000 | h264:852x480 | aac | 40,588 |
| `test2-transition.mp4` | 3.000000 | h264:852x480 | aac | 41,672 |
| `test3-audio.mp4` | 3.000000 | h264:852x480 | aac | 70,820 |
| `test4-text.mp4` | 2.000000 | h264:852x480 | aac | 39,256 |
| `test5-keyframes.mp4` | 2.000000 | h264:852x480 | aac | 34,752 |
| `test8-freeze.mp4` | 1.800000 | h264:852x480 | aac | 44,601 |
| `test9-scale-full.mp4` | 1.533333 | h264:852x480 | aac | 5,706 |
| `test9-scale-half.mp4` | 1.533333 | h264:852x480 | aac | 5,830 |

### Release installers and smoke test

`cmd /c build-tauri.cmd` rebuilt the frontend and release binary, then produced fresh installers under `C:\Users\Gamer\capcut-target\release\bundle`:

| Artifact | Bytes | Size |
| --- | ---: | ---: |
| `msi\QumenX_1.0.0_x64_en-US.msi` | 4,481,024 | 4.27 MiB |
| `nsis\QumenX_1.0.0_x64-setup.exe` | 3,123,500 | 2.98 MiB |

- Standalone release binary: `C:\Users\Gamer\capcut-target\release\qumenx.exe` (11,750,675 bytes), product/file version `1.0.0`.
- `run-release-progress.ps1` / `cdp-progress.mjs` launched that release binary, subscribed to real `ffmpeg-export-progress` events, reached `percent: 100`, and exported `C:\Users\Gamer\AppData\Local\Temp\capcut-progress-test.mp4`.
- Release export `ffprobe`: `duration=2.000000`, `video=h264 852x480`, `audio=aac`, `size=55118`.
- Older `CapCut Editor_0.1.0_*` bundles are stale and superseded.

## What the editor actually does

- **Project model (v2):** tracks, clips, assets, keyframes, effects, transitions, text styling, crop/flip, fades, grouping, audio detach, frame-rate-aware snapping. Version 1 projects are normalized with defaults on load.
- **Timeline:** real multi-track move/trim/cross-track drag, split, duplicate, delete, group, multi-select, snapping, frame quantization, zoom, waveforms, keyframe diamonds, track resize, playhead, and visibility/mute/lock controls. Locked tracks block clip and keyframe edits and do not create no-op undo entries.
- **Preview:** rAF playback with a synced playhead, source-time mapping for speed/reverse/freeze, proxy source selection with fallback to original media, multi-layer composition, overlays, audio, keyframe interpolation, effects, transitions, fades, text animation, vignette, width/height transform, safe zones, aspect ratios and fullscreen. Editing does not render full-resolution frames.
- **Tools:** crop, rotate, flip, resize, reverse, freeze, speed, color, transform, text, keyframes, transitions, effects and audio mixing/fades. Inspector, sidebar and menu controls are wired to real store actions.
- **Undo/redo:** labeled history with consistent multi-operation behavior, verified through real UI buttons in TEST 7.
- **Persistence:** validated JSON, atomic saves that restore the original if a rename fails, rotating backups (max 12) in `%APPDATA%\QumenX\backups`, corrupt-file recovery with a user-visible notice, backup restore, recent projects, and one-time migration from the old `capcut-editor` data folder.
- **Performance:** cached proxies keyed by source path + mtime in `%LOCALAPPDATA%\QumenX\proxies`, cached thumbnails and waveforms, low/medium preview quality controls, and capability detection UI. Proxy failures fall back to the original source; source media is never modified.
- **Export:** real FFmpeg filter graph with z-ordering, hidden/muted track handling, trim/speed/reverse, crop/flip/rotation, animated scale/position/opacity/volume, effects, fades, transitions, `drawtext` styling and typewriter, audio mixing, resolution/aspect/FPS/CRF selection, real progress events and cancellation. Scale factors are clamped to `0.05..20` so hostile or accidental Inspector values cannot allocate an enormous canvas or invert the crop. Invalid media and FFmpeg failures are surfaced with the generated filter graph for diagnosis.
- FFmpeg expression details settled during verification: use `clip()` (not `clamp()`); `overlay` uses lowercase `t`, `geq` uses uppercase `T`; `colorchannelmixer=aa` has no time variable; `drawtext` has no `fontweight`/`spacing` (bold uses a bold font file, letter spacing is emulated with inserted spaces). Filter fragments are stripped of their leading comma at graph boundaries so FFmpeg never parses an empty filter.

## Robustness fixes included in this final pass

- Unified version metadata to `1.0.0` and corrected the browser/window title mismatch.
- Fixed the IPv4/IPv6 dev-server mismatch and hardened CDP target selection and readiness checks.
- Fixed export graph construction (`No such filter: ''`) and included the generated graph in FFmpeg error messages.
- Added perceptual freeze verification, dynamic scale clamping, and a direct FFmpeg check of the clamped keyframed/static scale expressions.
- Made atomic project saves restore the original file if replacement fails.
- Suppressed undo-history entries for locked-track no-ops; added a locked guard to keyframe dragging.
- Added preview fallback for evicted/missing proxy files; corrected `freezeFrame` to use clip-local time consistently with the Inspector and preview.
- Replaced the misleading “Drag files here” hint with an honest Import instruction; asset cards now really add the asset to the timeline.

## Known limitations / notes

- `ffmpeg` and `ffprobe` must be installed and on PATH at runtime (winget `Gyan.FFmpeg.Essentials` 9.0.2 was used here). The app is otherwise fully offline.
- The non-fatal `.rsrc merge failure: multiple non-default manifests` linker warning remains on this toolchain.
- UI export is serialized; the Rust backend uses a process-wide cancel flag, so concurrent native `ffmpeg_export` calls are not supported.
- Hardware/codec capability UI is informational. Exports intentionally use reliable software encoders.
- Build tooling in this environment requires the provided `*.cmd` wrappers (`cargo-gnu.cmd`, `dev-tauri.cmd`, `build-tauri.cmd`) because `cargo`/`rustup` are not on the default PATH and the default toolchain lacks a Windows linker.
- Verification preceded repository organization; the application now lives in QumenX/ at the repository root.

## Commands and verification scripts

Run from `QumenX/` unless noted:

```
npm run build                                   # frontend production build
cmd /c cargo-gnu.cmd check                      # Rust check; run from src-tauri
cmd /c cargo-gnu.cmd build                      # Rust debug build; run from src-tauri
cmd /c dev-tauri.cmd                            # launch desktop app in dev mode
cmd /c build-tauri.cmd                          # build MSI + NSIS installers
powershell -NoProfile -ExecutionPolicy Bypass -File run-qmenx-e2e.ps1
                                                # full 12-check native IPC + real export E2E
powershell -NoProfile -ExecutionPolicy Bypass -File run-release-progress.ps1
                                                # release-binary export/progress smoke test
```

Legacy QA helpers still present: `run-e2e.ps1`/`cdp-e2e.mjs`, `run-ui.ps1`/`cdp-ui.mjs`, `run-progress.ps1`/`cdp-progress.mjs`, `run-release-progress*.ps1`, `cdp.mjs`.
