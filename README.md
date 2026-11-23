# QumenX

## Create Without Limits.

**QumenX** is a free, local-first desktop video editor for Windows. It combines a multi-track timeline, a layered preview and real FFmpeg exports in a single native app — no account, subscription, watermark, cloud service or simulated rendering.

[Windows 10/11 x64](https://www.microsoft.com/windows) · [Tauri v2](https://tauri.app/) · [React 19](https://react.dev/) · [FFmpeg](https://ffmpeg.org/) · [GitHub](https://github.com/ZK2010-DEV/QumenX)

---

## Features

- **Multi-track timeline** — move, trim, split, duplicate, delete, group, multi-select, snap to frames, zoom, resize tracks, and lock/mute/hide tracks. Locked tracks reject edits without polluting undo history.
- **Layered preview** — real-time composition with overlays, audio, text animation, transitions, effects, fades, keyframes, aspect ratios, safe zones, vignette and fullscreen. Low-resolution proxies keep editing responsive.
- **Editing tools** — crop, rotate, flip, resize, reverse, freeze, speed, color, transform, text styling, keyframes, audio mixing and fades.
- **Projects that survive mistakes** — validated version-2 JSON, atomic saves, up to 12 rotating backups, corrupt-file recovery, backup restore and a recent-projects list.
- **Real exports** — native FFmpeg filter graphs with resolution, aspect, FPS, codec and CRF controls, live progress events and cancellation. Exported files are genuine H.264/AAC media.
- **Undo/redo** — labeled history with predictable behavior across multi-operation edits.

QumenX never rewrites your source media. Proxies, thumbnails and waveforms are derived caches only.

## Local by design

Editing, metadata extraction, thumbnails, proxies and exports all run on your machine through the Rust backend and local FFmpeg binaries. There is no telemetry, upload or remote rendering.

| Data | Location (Windows) |
| --- | --- |
| Projects, recent list | `%APPDATA%\QumenX\` |
| Rotating backups | `%APPDATA%\QumenX\backups\` |
| Preview proxies | `%LOCALAPPDATA%\QumenX\proxies\` |

## Requirements

- **Windows 10 or 11, x64** with [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (included in Windows 11).
- **FFmpeg and FFprobe on `PATH`** for import metadata, thumbnails, proxies and export. Example: `winget install Gyan.FFmpeg.Essentials`.
- *To build from source only:* Node.js + npm, Rust `stable-x86_64-pc-windows-gnu` with WinLibs MinGW (see `QumenX/src-tauri/cargo-gnu.cmd`).

## Install and run

### Install a release

Grab an installer from the repository's GitHub Releases, or from `releases/windows/installers/` if binaries are available locally:

- `QumenX_1.0.0_x64_en-US.msi` — Windows Installer.
- `QumenX_1.0.0_x64-setup.exe` — NSIS setup wizard.

Standalone `qumenx.exe` lives in `releases/windows/executables/`. All three need FFmpeg on `PATH`. Verify downloads with `releases/windows/checksums/SHA256SUMS.txt`. Installer filenames are intentional and should not be renamed.

### Run from source

```powershell
cd QumenX
npm install
cmd /c dev-tauri.cmd          # Vite + native window (development)
```

Frontend-only preview: `npm run dev` or `npm run build && npm run preview`.

### Build

```powershell
cd QumenX
cmd /c build-tauri.cmd        # tauri build, then organize artifacts
```

`build-tauri.cmd` preserves the GNU toolchain, MinGW linker path and space-free `CARGO_TARGET_DIR`, then calls `organize-build.ps1`. The organizer copies fresh MSI/NSIS/archive/exe files into `releases/windows/...` **without renaming them**, regenerates SHA256 checksums, refreshes `releases/latest/latest.json`, and mirrors `QumenX/dist` into `builds/production`. Missing artifact categories are skipped with a warning.

Useful commands from `QumenX/`:

| Command | Purpose |
| --- | --- |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | Oxlint |
| `cd src-tauri && cmd /c cargo-gnu.cmd check` | Rust check (wrapper must run from `src-tauri/`) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File organize-build.ps1` | Re-organize existing artifacts only |
| `powershell -NoProfile -ExecutionPolicy Bypass -File run-qmenx-e2e.ps1` | 12-check native IPC + real-export E2E suite |

## Project layout

```text
.
├── QumenX/                     # the application (no second app tree)
│   ├── src/                    # React UI, Zustand stores, FFmpeg/IPC helpers
│   ├── src-tauri/              # Rust commands: media, project, export
│   ├── public/                 # static web assets (SVG icons)
│   ├── assets/                 # brand/source assets
│   ├── dist/                   # generated frontend build (ignored)
│   ├── build-tauri.cmd         # toolchain wrapper + organizer call
│   └── organize-build.ps1      # artifact/checksum/manifest organizer
├── documentation/              # architecture, guides, verification reports
├── releases/                   # Windows distribution tree + manifests
│   ├── latest/latest.json
│   ├── release-notes/
│   └── windows/{installers,portable,executables,checksums}
└── builds/{development,production}
```

Large binaries (installers, standalone exe, generated builds, caches) are **not tracked** in Git; the directories stay in the repository via `.gitkeep`, while checksums, manifests and release notes are tracked. See `documentation/development.md` for the release policy.

## Documentation

- [Architecture](documentation/architecture.md) — layers, data flow, native commands, export pipeline.
- [User guide](documentation/user-guide.md) — importing, editing, proxies, saving and exporting.
- [Development](documentation/development.md) — setup, builds, release organization and hygiene.
- [Verification checklist](documentation/verification-checklist.md) — what to check before shipping.
- [Verification report](documentation/verification-report.md) — detailed v1.0.0 results.
- [Legacy final report](documentation/legacy-final-report.md) — earlier rebrand-era report.

## Troubleshooting

- **"FFmpeg not found" / blank metadata** — install FFmpeg + FFprobe and confirm `ffmpeg -version` works in the same terminal before launching QumenX.
- **Preview is soft or a proxy goes missing** — proxies are disposable caches under `%LOCALAPPDATA%\QumenX\proxies\`; QumenX falls back to the original media. Regenerate proxies from the media panel.
- **Export is slow** — exports are full-resolution FFmpeg renders; editing itself stays responsive because previews use proxies.
- **Concurrent exports** — unsupported by design. The Rust backend uses a process-wide cancel flag, so the UI serializes exports; wait for one to finish before starting another.
- **Linker warning `.rsrc merge failure`** — non-fatal on the GNU toolchain; the binary still builds, launches and exports.
- **Blank dev window** — use `dev-tauri.cmd`; the dev server is pinned to `127.0.0.1:5173` to avoid localhost IPv6 timeouts.

## Contributing and license

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [verification checklist](documentation/verification-checklist.md). Released under the [MIT License](LICENSE).

**Repository:** https://github.com/ZK2010-DEV/QumenX
