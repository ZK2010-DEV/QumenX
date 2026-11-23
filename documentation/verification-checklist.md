# QumenX pre-release verification checklist

Use this checklist before tagging or publishing a QumenX release. It reflects the v1.0.0 verification path: real Tauri IPC, real FFmpeg exports checked with `ffprobe`, real project save/recovery calls and a release-binary smoke test. Record results in [verification-report.md](verification-report.md), not in a binary artifact.

Run commands from `QumenX/` unless stated otherwise.

## 1. Environment

- [ ] Windows 10/11 x64 target confirmed.
- [ ] `ffmpeg -version` and `ffprobe -version` work on `PATH`; note the version.
- [ ] WebView2 Runtime is available.
- [ ] Rust `stable-x86_64-pc-windows-gnu` and WinLibs MinGW are available via `src-tauri/cargo-gnu.cmd`.
- [ ] `CARGO_TARGET_DIR` is space-free (`C:\Users\Gamer\capcut-target` on this machine).
- [ ] `dev-tauri.cmd` and `build-tauri.cmd` still set the toolchain, linker PATH and target dir, and still call `node_modules\.bin\tauri.cmd build %*`.

## 2. Static checks

- [ ] `npm run build` passes (`tsc -b` + Vite).
- [ ] `npm run lint` has no errors; note any non-blocking warnings.
- [ ] `cd src-tauri && cmd /c cargo-gnu.cmd check` passes.
- [ ] Version is consistent in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json` and `index.html`.
- [ ] Window/browser title is `QumenX — Professional Video Editor`.
- [ ] No `.rsrc merge failure` beyond the known non-fatal warning; if present, confirm the binary launches and exports.

## 3. Native app health

- [ ] `cmd /c dev-tauri.cmd` opens the real Tauri window at 1300×850.
- [ ] Dev server is `http://127.0.0.1:5173`; no localhost IPv6 blank-window issue.
- [ ] `window.__TAURI_INTERNALS__` is active in the WebView.
- [ ] CDP harness waits for a genuinely loaded page and dev store hook before testing.
- [ ] Zero console errors and zero uncaught exceptions.
- [ ] QA scripts reference `D:\OpenCode Projects\AppDevelopment\QumenX`, not the old `capcut-editor` root. Generated `target/` caches do not count.

## 4. Functional E2E

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File run-qmenx-e2e.ps1
```

Confirm all checks pass:

- [ ] Import + trim/source-offset export: real media, approx. 1.50 s, H.264 video and AAC audio.
- [ ] Two clips + transition export: approx. 3.00 s, correct streams.
- [ ] Music, volume keyframes and audio fades export: approx. 3.00 s.
- [ ] Styled/animating text over image export: approx. 2.00 s.
- [ ] Keyframed scale/position/opacity + saturation export: approx. 2.00 s.
- [ ] Save → rotating backup → deliberate corruption → recovery → restore: up to 12 backups; restored name/content correct.
- [ ] Multi-track project close/reopen: signature match, all tracks/clips restored.
- [ ] Undo/redo through the real UI buttons: labeled history advances and rewinds correctly.
- [ ] Freeze hold/export: hold is perceptually stable (`ssim` inside hold ≈ 0.99974; after hold ≈ 0.91048).
- [ ] Static scale preview/export parity: centroid changes with scale; exports remain at chosen resolution.
- [ ] Proxy generation and use: proxy created under `%LOCALAPPDATA%\QumenX\proxies\`, source unchanged, preview uses proxy with fallback available.
- [ ] App health: `errors: []`.

Every generated media file must be probed with `ffprobe`; check duration, video codec/dimensions, audio codec and byte size against the report.

## 5. Export pipeline special cases

- [ ] Export graph contains no empty filter (`No such filter: ''` regression).
- [ ] FFmpeg errors include the generated filter graph for diagnosis.
- [ ] Scale expressions use `clip()` and remain within `0.05..20`.
- [ ] `overlay` uses lowercase `t`; `geq` uses uppercase `T`.
- [ ] `colorchannelmixer=aa` has no time variable.
- [ ] `drawtext` uses a bold font file rather than unsupported `fontweight`, and letter spacing is emulated with spaces.
- [ ] Hidden/muted tracks are excluded from export.
- [ ] Cancel works for a long export.
- [ ] Starting a second export while one is active is prevented; concurrent native exports are unsupported.

## 6. Release build and packaging

- [ ] `cmd /c build-tauri.cmd` succeeds and produces fresh MSI + NSIS artifacts.
- [ ] Organizer runs automatically after a successful build; if the build fails, organization is skipped.
- [ ] Installer filenames are **unchanged**: `QumenX_1.0.0_x64_en-US.msi`, `QumenX_1.0.0_x64-setup.exe`.
- [ ] Raw executable copied to `releases/windows/executables/qumenx.exe` when present.
- [ ] Portable archives, when present, land in `releases/windows/portable/` without renaming.
- [ ] `QumenX/dist` is mirrored into `builds/production/`.
- [ ] `releases/windows/checksums/SHA256SUMS.txt` covers every organized binary.
- [ ] `releases/latest/latest.json` parses as JSON and its paths, hashes, sizes and release notes all resolve.
- [ ] Missing artifact categories only produce warnings, not failed builds.

## 7. Release binary smoke test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File run-release-progress.ps1
```

- [ ] Release window opens with the correct title.
- [ ] Real `ffmpeg-export-progress` events reach `percent: 100`.
- [ ] Exported file exists outside the project tree.
- [ ] `ffprobe` reports real H.264/AAC media with expected duration, dimensions and non-zero size.
- [ ] Standalone executable reports product/file version `1.0.0` (or the current release version).

## 8. Documentation and repository state

- [ ] README links resolve: architecture, user guide, development, verification checklist, verification report, legacy report.
- [ ] Release notes exist for the version and link back to the verification report.
- [ ] No root-level duplicate reports remain; reports live under `documentation/`.
- [ ] `.gitkeep` files still preserve empty release/build directories.
- [ ] No generated binaries, logs, caches, credentials or temporary media are staged.
- [ ] Checksums, manifests, notes and source assets remain trackable.
- [ ] `git status --short` reviewed; no unintended source changes. Do not commit or push without explicit approval.

## 9. Sign-off

| Field | Value |
| --- | --- |
| Version | |
| Build date | |
| FFmpeg / FFprobe version | |
| E2E result | /12 |
| Release smoke test | pass / fail |
| Checksums verified | yes / no |
| Reviewer | |
| Notes | |
