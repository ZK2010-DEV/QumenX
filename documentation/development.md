# QumenX development and release guide

This document describes how to run, build, test and package QumenX from the repository root at `D:\OpenCode Projects\AppDevelopment`. The application lives in `QumenX/`; there is no second app tree.

## Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri v2 (Webview2 on Windows) |
| UI | React 19, TypeScript, Tailwind, lucide icons |
| State | Zustand stores for project, media, timeline, preview, export and workspace |
| Native layer | Rust commands in `QumenX/src-tauri/src/commands` |
| Media | Local FFmpeg/FFprobe CLI; no remote services |

See [architecture.md](architecture.md) for the command surface and data flow.

## Prerequisites

- Windows 10 or 11 x64.
- WebView2 Runtime (included with Windows 11; install separately on older systems).
- Node.js and npm (Node 24 was used for v1.0.0 verification).
- Rust `stable-x86_64-pc-windows-gnu` plus the WinLibs MinGW linker. On this machine, `QumenX/src-tauri/cargo-gnu.cmd` encodes the toolchain paths.
- FFmpeg and FFprobe on `PATH` at runtime and for QA, e.g. `winget install Gyan.FFmpeg.Essentials`.
- Python or another static file server is not required; Vite is pinned to `http://127.0.0.1:5173`.

## Run from source

```powershell
cd "D:\OpenCode Projects\AppDevelopment\QumenX"
npm install
cmd /c dev-tauri.cmd
```

Frontend-only check:

```powershell
npm run dev
# or
npm run build
npm run preview
```

Use `dev-tauri.cmd`, not a bare `npm run tauri dev`, on this machine. The wrapper sets `RUSTUP_TOOLCHAIN`, the MinGW linker path and a space-free `CARGO_TARGET_DIR` (`C:\Users\Gamer\capcut-target`) required by `windres`. The IPv4 dev URL also avoids the localhost IPv6 timeout that otherwise produced a blank window.

## Checks

Run from `QumenX/`:

```powershell
npm run build
npm run lint
cd src-tauri
cmd /c cargo-gnu.cmd check
```

`npm run build` runs `tsc -b` then Vite. `npm run lint` uses Oxlint; v1.0.0 has no errors, only non-blocking warnings in legacy QA helpers and a few unused imports. The GNU toolchain may print `.rsrc merge failure: multiple non-default manifests`; this is non-fatal and the binary still works.

## Native and E2E QA

The main suite launches Vite plus the real debug binary and drives it over WebView2 CDP, invoking real Tauri commands and probing exported media with `ffprobe`:

```powershell
cd "D:\OpenCode Projects\AppDevelopment\QumenX"
powershell -NoProfile -ExecutionPolicy Bypass -File run-qmenx-e2e.ps1
```

Machine-readable results are written to `C:\Users\Gamer\AppData\Local\Temp\qumenx-e2e\results.json`; the final `ffprobe` table is in `...\ffprobe-final.txt` in the same folder.

Release-binary progress smoke test:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File run-release-progress.ps1
```

Other legacy helpers are still present (`run-e2e.ps1`/`cdp-e2e.mjs`, `run-ui.ps1`/`cdp-ui.mjs`, `run-progress.ps1`/`cdp-progress.mjs`, `run-release-progress-long.ps1`, `cdp-probe.js`). Their hard-coded project root was normalized to `D:\OpenCode Projects\AppDevelopment\QumenX`. Keep future QA scripts on that root rather than the old `capcut-editor` path.

All 12 v1.0.0 checks passed; see [verification-report.md](verification-report.md) and the pre-ship [verification-checklist.md](verification-checklist.md).

## Build and organize a release

```powershell
cd "D:\OpenCode Projects\AppDevelopment\QumenX"
cmd /c build-tauri.cmd
```

`build-tauri.cmd`:

1. Sets the GNU toolchain, MinGW linker path and space-free `CARGO_TARGET_DIR`.
2. Links `src-tauri\target\release` to that target directory so Tauri’s bundler can find the GNU-built binary.
3. Runs `node_modules\.bin\tauri.cmd build --runner "src-tauri\cargo-gnu.cmd" %*`; the explicit runner is required because Tauri otherwise falls back to the MSVC linker on this machine.
4. If the build succeeds, calls `organize-build.ps1 -TargetDir "%CARGO_TARGET_DIR%"`.
5. Preserves the Tauri exit code; organizer failures are reported but do not change the build result.

`organize-build.ps1` can also be run on its own to re-organize existing artifacts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File organize-build.ps1
```

The organizer:

- copies the freshest MSI and NSIS artifacts into `releases/windows/installers/`;
- copies portable `.zip`/`.7z` archives into `releases/windows/portable/` when present;
- copies the raw release `qumenx.exe` into `releases/windows/executables/`;
- **never renames artifacts** — installer filenames are referenced by release metadata;
- regenerates `releases/windows/checksums/SHA256SUMS.txt` with `Get-FileHash`;
- refreshes `releases/latest/latest.json` with relative paths, hashes, byte sizes and the existing release date;
- creates a starter note at `releases/release-notes/v<version>.md` only if one does not exist;
- mirrors `QumenX/dist` into `builds/production/`.

Missing artifact categories are warnings, not build failures. The script uses only PowerShell and reads the version from `QumenX/package.json`; override it with `-Version` if needed.

## Version bump checklist

Update every metadata location together:

- `QumenX/package.json` and `package-lock.json`
- `QumenX/src-tauri/Cargo.toml` and `Cargo.lock`
- `QumenX/src-tauri/tauri.conf.json`
- `QumenX/index.html`

Then rebuild, regenerate checksums/manifests, add curated notes under `releases/release-notes/`, and update [verification-report.md](verification-report.md). Do not rename installer files by hand.

## Repository hygiene

Large generated binaries are intentionally **untracked**:

- `node_modules/`, `dist/`, `target/`, caches and logs
- installers, standalone executables and portable archives
- `rustup-init.exe`
- local credentials and temporary media

Directories remain in the repository using `.gitkeep`. The following are tracked:

- source under `QumenX/src` and `QumenX/src-tauri/src`
- build and QA scripts, docs, `.gitignore` files
- `SHA256SUMS.txt`, `latest.json` and release notes
- source SVG/brand assets

The root `.gitignore` and `QumenX/.gitignore` implement this policy. Do not commit generated binaries or local FFmpeg/test media.

## Known environment and product limits

- The `*.cmd` wrappers are required here because Cargo/rustup and MinGW are not on the default PATH.
- `CARGO_TARGET_DIR` must remain space-free for `windres`.
- A non-fatal `.rsrc merge failure: multiple non-default manifests` warning can appear.
- FFmpeg/FFprobe must be on `PATH` for import and export.
- Export is serialized because the Rust cancel flag is process-wide.
- Hardware/codec capability UI is informational; exports use software encoders.
- Source media is read-only. Proxies, thumbnails and waveforms are disposable caches.

## Commit policy

This repository is managed deliberately: do not commit generated artifacts, and do not rewrite remote history. Release notes and verification evidence should be reviewed before any commit or tag is created.
