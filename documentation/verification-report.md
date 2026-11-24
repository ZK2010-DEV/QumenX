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
- Final E2E health check: title `QumenX — Professional Video Editor`, 752 DOM nodes, `isTauri: true`, **zero console errors, zero runtime exceptions**.
- The dev URL is pinned to `http://127.0.0.1:5173` and Vite starts with `--host 127.0.0.1`. This fixes an environment-specific `localhost` IPv6 timeout that previously produced a blank CDP target. The CDP harness now waits for a genuinely loaded Tauri page and the dev-only store hook before running tests.

### Full E2E suite: 17/17 passed

`run-qmenx-e2e.ps1` launches Vite plus the real debug `qumenx.exe`, drives the app over WebView2 CDP, and invokes real native commands. Every export is written to disk and probed with `ffprobe`.

| Check | Final result |
| --- | --- |
| TEST 1 — import, trim/source-offset, export | `1.50 s`, `h264 852x480`, `aac`, 40,588 bytes |
| TEST 2 — two clips + transition, export | `3.00 s`, `h264 852x480`, `aac`, 41,672 bytes |
| TEST 3 — music, volume keyframes, audio fades, export | `3.00 s`, `h264 852x480`, `aac`, 70,820 bytes |
| TEST 4 — styled/animating text over image, export | `2.00 s`, `h264 852x480`, `aac`, 39,256 bytes |
| TEST 5 — keyframed scale/position/opacity + saturation, export | `2.00 s`, `h264 852x480`, `aac`, 34,752 bytes |
| TEST 6 — save, rotating backup, deliberate corruption, recovery, restore | 12 backups; recovered `Backup Test` from `%APPDATA%\QumenX\backups\...bak`; restored name/contents correctly |
| TEST 6b — full 4-track/4-clip project close and reopen | `signatureMatch: true`, expected/actual signature length `1627`; 4 tracks and 4 clips restored |
| TEST 7 — two additions, two undos, two redos via real UI buttons | clip counts `4 → 5 → 6 → 5 → 4 → 5 → 6`; history diag past `4`, future `0` |
| TEST 8 — mid-clip freeze hold/export | `1.80 s`, `h264 852x480`, `aac`, 44,601 bytes; hold SSIM `0.99974`, post-hold motion SSIM `0.91048` |
| TEST 9 — static scale preview/export parity | content centroid `yFull=41`, `yHalf=16`; both exports `852x480` |
| TEST 10 — proxy generation and preview use | proxy created, source unchanged, proxy stream `video:h264:960x540`, preview used `%LOCALAPPDATA%\QumenX\proxies\f601b477609b7a26.mp4` |
| TEST 11 — no-op undo, modal shortcut isolation, replay at end | `before=0`, `afterClick=0`, `afterDrag=1`, `playingInModal=false`, `playingOutside=true`, replay `time=0`, `playing=true` |
| TEST 12 — ripple delete/trim, insert, overwrite, close gaps, markers | ripple moved `c3: 2→1`; insert `1.0s` pushed `c3: 2.2s`; overwrite replaced the inserted clip; ripple trim set `c1: 0.6s` and shifted followers; close gaps compacted `c3: 3→1.8`; marker/color label persisted; export `3.00 s`, `h264 852x480`, `aac` |
| TEST 13 — timeline render isolation | waveform rendered as `1` SVG path and `0` rectangles; 24 playhead updates produced `0` clip DOM mutations while playhead moved `20px → 80px` |
| TEST 14 — SRT/VTT captions | 2 cues parsed with multi-line text and inline tags stripped; imported as frame-snapped clips at `0–1s`/`1.5–2.5s` with `fontSize=24`, bottom offset `163px`; SRT/VTT files round-tripped byte-for-byte; manual caption at `2.0s/0.5s`; 3 captions survived save/reopen; export `2.50 s`, `h264 852x480`, `aac` |
| TEST 15 — project templates | built-in apply produced a 3-track, 2-title, 2-marker 1080p project; custom template saved/listed/applied/deleted through native IPC; Templates UI exposed Apply and Save current; export `4.00 s`, `h264 1920x1080`, `aac` |
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
| `test14-captions.mp4` | 2.500000 | h264:852x480 | aac | 57,181 |
| `test15-templates.mp4` | 4.000000 | h264:1920x1080 | aac | 35,394 |

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
- **Timeline:** real multi-track move/trim/cross-track drag, split, duplicate, delete, ripple delete, frame-accurate ripple trim, insert and overwrite at the playhead, close gaps, group, multi-select, snapping, frame quantization, zoom presets, fit-to-project, waveforms, keyframe diamonds, markers, color labels, track resize, playhead, and visibility/mute/lock controls. Locked tracks block clip and keyframe edits and do not create no-op undo entries.
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

## Stability pass (post-v1.0.0)

Verified with `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (2/2), and the full native E2E suite (17/17).

- Backup rotation now uses millisecond stamps with collision avoidance, so two quick saves cannot overwrite the same `.bak`; `project_list_backups` still reads legacy second-stamped backups.
- Import failures outside the per-file probe can no longer leave the Import dialog stuck: `importing` is always cleared in `finally`.
- App keyboard shortcuts are ignored while an `aria-modal` dialog is open; Escape remains owned by the dialog.
- Timeline clip drags, keyframe drags and track resizes push an undo entry only after the first real change; simple selection clicks no longer consume an undo slot or clear redo.
- Window drag listeners are removed on unmount, preventing stale closures after HMR or panel changes.
- Reopening Export returns to the normal form instead of showing a stale “Export complete” screen; export now serializes live project state.
- Pressing Play at the end of the timeline replays from 0 instead of immediately stopping.
- Flash notices clear only their own timer, so a newer message is not hidden early.
- Waveform peak bucketing is clamped to the decoded sample buffer; two Rust unit tests cover short and empty sources.

## Timeline editing pass (post-Milestone 1)

Verified with `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (2/2), and the full native E2E suite (17/17).

- Ripple delete closes gaps only on the affected unlocked tracks; unrelated audio tracks stay in sync instead of being shifted unexpectedly.
- Ripple trim moves upstream clips for start-edge trims and downstream clips for end-edge trims, preserving keyframe timing, source offsets, effect state and freeze ranges wherever they remain valid.
- Insert splits a clip under the playhead and pushes the right-hand segment forward; overwrite replaces only the overlapped timeline range and keeps non-overlapping material.
- Timeline markers are real v2 project data: add with `M`/toolbar, seek by click, rename by double-click, delete by right-click.
- Clip color labels, zoom presets, fit-to-project, `Shift+Del` ripple delete, and media-library Insert/Overwrite controls are wired to actual store operations.
- No IPC command names, E2E selectors, FFmpeg filters or export semantics changed in this pass.

## Timeline performance pass (post-Milestone 2)

Verified with `npm run build`, `npm run lint` (warnings only), and the full native E2E suite (17/17).

- The timeline chrome uses a shallow Zustand selector that intentionally omits `playheadTime`; per-frame playback ticks no longer re-render every track header, clip block and keyframe diamond.
- The playhead is an isolated subscriber to `playheadTime`/`zoom`, so only its `left` style changes during playback.
- Waveform peaks are requested with 96 buckets and drawn with one `<path>` element per audio clip instead of one `<rect>` per bucket.
- TEST 13 uses a `MutationObserver` to confirm the clip DOM is untouched across 24 playhead updates while the playhead itself moves.

## Caption pass (post-Milestone 3)

Verified with `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (3/3), and the full native E2E suite (17/17).

- The Text workspace now offers SRT/VTT import, SRT/VTT export, and a one-click caption at the playhead. All file access is local through the new `subtitles_read`/`subtitles_write` native commands.
- The parser accepts SRT and WebVTT timing formats, cue identifiers, VTT headers/cue settings, inline styling tags, HTML entities, and multi-line cue text. Serializers emit numbered SRT or standard `WEBVTT` output with stable `HH:MM:SS,mmm`/`HH:MM:SS.mmm` timestamps.
- Imported cues become real bottom-anchored text clips on a Captions track with resolution-aware font size, outline, shadow, and semi-transparent background. Their timings are snapped to the project frame rate, and `Clip.caption` makes them round-trip through project save/open.
- Caption text uses the existing `whiteSpace: pre-wrap` preview renderer and the existing FFmpeg `drawtext` `\\n` escape, so multi-line captions render consistently in preview and exported MP4s.
- TEST 14 exercises the full path from an SRT file on disk to a real FFmpeg export, including byte-for-byte SRT/VTT export round-trips, manual caption insertion and save/reopen preservation.

## Template pass (post-Milestone 4)

Verified with `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (4/4), and the full native E2E suite (17/17).

- The Templates workspace ships four built-in project setups that create real tracks, markers and styled text clips; applying one replaces the current project undoably and clears its saved path so the original project file is not overwritten.
- Custom templates are saved as local JSON under the QumenX app-data directory through `template_list`, `template_save` and `template_delete`. No account, network access or cloud storage is involved.
- The Rust `template_save` command uses `rename_all = "snake_case"`, matching `project_save`/`ffmpeg_export`, so the frontend `template_json` argument is accepted by Tauri v2 while all public IPC command names remain unchanged.
- The project schema is unchanged (version `2`), and templates use the existing preview and FFmpeg text/export pipelines.
- TEST 15 covers built-in application, custom template save/list/apply/delete, Templates UI controls and a real FFmpeg export of the applied template, probed with `ffprobe`.

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
                                                # full 17-check native IPC + real export E2E
powershell -NoProfile -ExecutionPolicy Bypass -File run-release-progress.ps1
                                                # release-binary export/progress smoke test
```

Legacy QA helpers still present: `run-e2e.ps1`/`cdp-e2e.mjs`, `run-ui.ps1`/`cdp-ui.mjs`, `run-progress.ps1`/`cdp-progress.mjs`, `run-release-progress*.ps1`, `cdp.mjs`.
