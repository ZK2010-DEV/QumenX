# Contributing to QumenX

Thanks for helping improve QumenX. The project is a Tauri v2 desktop app with a React 19 frontend; everything runs locally and exports use real FFmpeg.

## Ground rules

- Keep the editor offline and local-first. Do not add telemetry, accounts, cloud rendering, watermarks or simulated exports.
- Never modify a user's source media. Derived caches (proxies, thumbnails, waveforms) are disposable.
- Preserve the existing installer filenames and the toolchain wrappers in `QumenX/*.cmd`; they encode this machine's GNU toolchain and space-free Cargo target path.
- Do not commit generated artifacts: `node_modules/`, `dist/`, `target/`, logs, installers, standalone executables or test media. Checksums, manifests and release notes **are** tracked.

## Setup

```powershell
cd QumenX
npm install
cmd /c dev-tauri.cmd
```

You need Node.js/npm, Rust `stable-x86_64-pc-windows-gnu` with WinLibs MinGW, and FFmpeg/FFprobe on `PATH`. Windows 10/11 x64 is supported.

## Workflow

1. Create a focused branch from `main`.
2. Make changes in `QumenX/src` (React/Zustand) or `QumenX/src-tauri/src` (Rust commands).
3. Run checks from `QumenX/`:

   ```powershell
   npm run build
   npm run lint
   cd src-tauri && cmd /c cargo-gnu.cmd check
   ```

4. Smoke-test the native app with `cmd /c dev-tauri.cmd`, then run the relevant QA script:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File run-qmenx-e2e.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File run-release-progress.ps1
   ```

5. Work through [documentation/verification-checklist.md](documentation/verification-checklist.md) before proposing a release.

## Changing the export pipeline

Export filter graphs are assembled in `src-tauri/src/commands/export.rs` and invoked from `src/lib/ffmpeg.ts`. When touching FFmpeg expressions, verify with `ffprobe` that the output is real media with the expected duration, streams and dimensions. Be aware that the backend cancel flag is process-wide: concurrent native exports are not supported.

## Releasing

```powershell
cd QumenX
cmd /c build-tauri.cmd
```

The wrapper performs the Tauri build and then runs `organize-build.ps1`, which copies artifacts without renaming them, writes `SHA256SUMS.txt`, updates `releases/latest/latest.json`, and mirrors `dist` into `builds/production`. Do not commit the copied binaries; commit only manifests, checksums and notes. Full results belong in `documentation/verification-report.md`.

## Reporting issues

Open an issue at https://github.com/ZK2010-DEV/QumenX/issues with your Windows version, FFmpeg version, steps to reproduce, and the relevant log from `%APPDATA%\QumenX\` or the QA scripts. Remove private file paths from logs before posting.

By contributing you agree that your work is licensed under the [MIT License](LICENSE).
