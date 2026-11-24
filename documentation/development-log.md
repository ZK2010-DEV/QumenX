# QumenX development log

This log records completed development milestones for QumenX. Entries are added only after the change has been implemented, tested, committed, pushed to `origin/main`, and verified with Git.

## Baseline — v1.0.0

- **Commit:** `0669a8d40c0c573e55caebeb0a3a0c36dbd76885`
- **Message:** `Add QumenX v1.0.0 editor, release pipeline, and documentation`
- **Date:** 2026-11-24
- **Scope:** First verified desktop release for Windows 10/11 x64. The existing `QumenX/` project was extended in place into a Tauri 2 + React 19 + TypeScript desktop video editor with a real FFmpeg export pipeline, versioned project persistence with rotating backups and recovery, multi-track timeline editing, layered preview/proxies, text/effects/transitions/audio tooling, and a local MSI/NSIS release pipeline.
- **Verification:** `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, debug and release builds, 12/12 native E2E checks, UI selector contract, release-binary export progress smoke test reaching `percent: 100`, `ffprobe` validation of all generated media, and 3/3 release checksums verified.
- **Distribution:** Windows installers and standalone executable kept under `releases/`; no large build artifacts uploaded to GitHub.
- **Repository state after baseline:** `main...origin/main` clean; remote `origin/main` matched the baseline commit.

## Milestone 1 — stability and editing correctness pass

- **Scope:** Addressed low-risk, high-impact reliability issues found in the post-v1.0.0 audit: millisecond backup stamps with collision avoidance and backward-compatible backup listing, guaranteed Import dialog cleanup on unexpected errors, modal-aware global shortcuts, lazy undo history for drag/resize gestures, unmount-safe window drag listeners, fresh Export dialog state and live project serialization, replay-at-end playback, non-clobbering flash notices, and panic-free waveform peak bucketing with Rust unit tests.
- **Verification:** `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (2/2), and the full native E2E suite (13/13 after adding TEST 11 for no-op undo, modal shortcut isolation and replay-at-end).
- **Notes:** The E2E runner now waits briefly for Vite to warm up before launching WebView2; this changes only the QA harness. No E2E-critical selectors, IPC command names or export behavior were changed.

## Milestone 2 — professional timeline editing primitives

- **Commit:** `f1d4b4b9598bed2f6541c1eeab1d8159df24da5e`
- **Message:** `Add professional timeline editing primitives`
- **Date:** 2026-11-24
- **Scope:** Added real ripple delete, frame-accurate ripple trim, insert and overwrite at the playhead, close gaps, timeline markers with seek/rename/delete, clip color labels, timeline zoom presets and fit-to-project, plus media-library Insert/Overwrite actions and keyboard shortcuts. Operations preserve clip keyframes, effects, source offsets, speed, freeze state and undo history, and respect locked tracks.
- **Verification:** `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (2/2), and the full native E2E suite (14/14). TEST 12 verifies ripple deletion, insertion, overwrite replacement, ripple trimming, gap compaction, markers, color labels, and a real FFmpeg export of the edited timeline.
- **Notes:** Additive only: project version stays `2`, all existing E2E selectors/IPC command names/export behavior are unchanged, and no FFmpeg graph changes were needed.

## Milestone 3 — timeline rendering performance

- **Commit:** `2379fa94b5eed70ba5bfc260c98a9de400fc7d44`
- **Message:** `Reduce timeline render work during playback`
- **Date:** 2026-11-24
- **Scope:** Replaced the timeline's whole-store subscription with a shallow selector that excludes per-frame playhead time, moved the playhead into an isolated component, and collapsed waveform rendering to a single SVG path per audio clip with 96 buckets instead of 160+ rectangles.
- **Verification:** `npm run build`, `npm run lint` (warnings only), and the full native E2E suite (15/15). TEST 13 advances the playhead 24 frames and verifies zero mutations inside the audio clip DOM while the playhead visually moves.
- **Notes:** No editing behavior, project schema, IPC command, or FFmpeg export behavior changed.

## Milestone 4 — SRT/VTT caption import and export

- **Commit:** `PENDING`
- **Message:** `Add real SRT and VTT caption import/export`
- **Date:** 2026-11-24
- **Scope:** Added a local SRT/WebVTT parser and serializer, native `subtitles_read`/`subtitles_write` commands, store actions for importing cues as styled bottom-anchored caption clips, adding a caption at the playhead, and exporting caption clips back to SRT/VTT, plus Caption tools in the Text workspace. Captions are real project data (`Clip.caption`) and render through the existing preview and FFmpeg `drawtext` pipelines.
- **Verification:** `npm run build`, `npm run lint` (warnings only), `cargo-gnu.cmd check`, `cargo-gnu.cmd build`, `cargo-gnu.cmd test` (3/3), and the full native E2E suite (16/16). TEST 14 covers SRT parsing with multi-line text and inline tags, frame-snapped timing, caption style/timings, SRT/VTT file round-trips, manual caption insertion, project save/reopen preservation, UI controls, and a real FFmpeg export probed with `ffprobe`.
- **Notes:** Adds two native IPC commands and one optional `Clip.caption` field; project version remains `2`. No source media is modified, and no paid or cloud service is used.
