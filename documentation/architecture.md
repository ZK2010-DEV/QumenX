# QumenX architecture

QumenX is a desktop video editor: a React 19 frontend rendered in a Tauri v2 WebView, backed by a small Rust command layer that talks to local FFmpeg. There is no server component and no remote rendering.

## Layers at a glance

```text
React UI (QumenX/src)
  App.tsx + components/{layout,media,export,ui}
        │  state actions / selectors
        ▼
Zustand stores (QumenX/src/stores)
  project │ media │ timeline │ preview │ export │ workspace
        │  typed project model (types/project.ts, v2 schema)
        ▼
Frontend helpers (QumenX/src/lib)
  ffmpeg.ts (Tauri invoke wrapper) │ project.ts │ mediaImport.ts
        │  Tauri IPC
        ▼
Rust commands (QumenX/src-tauri/src/commands)
  media.rs │ project.rs │ export.rs
        │  std::process / FFmpeg CLI
        ▼
Local files: source media, project JSON, backups, proxies, thumbnails, waveforms
```

## Frontend

- `src/App.tsx` composes the shell: top bar, left sidebar, preview, timeline and inspector, plus import/export and backup dialogs.
- `src/components/layout/` contains the main work surfaces (`PreviewPanel`, `TimelinePanel`, `InspectorPanel`, `LeftSidebar`, `TopBar`, `Brand`).
- `src/components/media/` handles import and asset cards; `src/components/export/ExportDialog.tsx` drives export settings and progress.
- `src/stores/` holds application state with Zustand. `projectStore` owns the version-2 document; `timelineStore` owns clip/track operations and history; `previewStore` owns playhead and composition state; `mediaStore` owns assets and derived caches; `exportStore` tracks progress/cancellation; `workspaceStore` holds UI state.
- `src/types/project.ts` defines the serializable project: tracks, clips, assets, keyframes, effects, transitions, text styling, crop/flip, fades and grouping. Version 1 documents are normalized on load.
- `src/lib/ffmpeg.ts` is the single IPC wrapper around native commands. `src/lib/project.ts` implements save/open/backup/recent helpers. `src/lib/mediaImport.ts` turns probe results into assets.

## Native command surface

Registered in `src-tauri/src/main.rs`:

| File | Commands | Responsibility |
| --- | --- | --- |
| `commands/media.rs` | `ffmpeg_probe`, `ffmpeg_thumbnail`, `ffmpeg_thumbnails`, `ffmpeg_waveform`, `ffmpeg_proxy`, `ffmpeg_capabilities` | Metadata, cached thumbnails/waveforms, low-resolution preview proxies, capability detection. |
| `commands/project.rs` | `project_save`, `project_open`, `project_list_backups`, `project_restore_backup`, `project_recent`, `project_add_recent`, `open_path` | Validated JSON, atomic writes, rotating backups, recovery and OS file opening. |
| `commands/export.rs` | `ffmpeg_export`, `ffmpeg_cancel_export` | Build and run the FFmpeg filter graph, emit progress, cancel. |

Tauri's asset protocol is enabled with a broad local scope (`**`) so previewed media can be loaded from disk; the app itself makes no network requests.

## Data flow

### Import and preview

1. The native file dialog returns source paths. `ffmpeg_probe` supplies duration, streams and dimensions.
2. Assets are added to `mediaStore`; thumbnails, waveforms and a low-resolution proxy are generated once and cached. A proxy is keyed by source path plus modification time.
3. Timeline clips reference an asset and a **source-time** range. Preview maps playhead time through speed, reverse and freeze settings, then composites visible/unmuted tracks in z-order.
4. If a proxy has been evicted or is unreadable, preview falls back to the original source. Editing never renders a full-resolution frame.

### Save and recovery

The project is serialized to version-2 JSON and sent to `project_save`. The Rust side writes atomically (restore the original if replacement fails), maintains up to 12 timestamped backups under `%APPDATA%\QumenX\backups\`, and records the file in the recent list. `project_open` validates the schema and reports corruption with a user-visible recovery path; `project_restore_backup` copies a chosen backup over the target. Older version-1 files are migrated with defaults. A one-time migration also reads the legacy `capcut-editor` data folder.

### Export

`ffmpeg_export` receives the serialized project and an output path. The Rust backend:

- resolves each clip to its source (or proxy where appropriate), applying trim, speed, reverse and freeze source-time mapping;
- respects track order plus hidden/muted flags;
- renders crop, rotation, flip, scale/position/opacity and volume keyframes, effects, fades, transitions, styled `drawtext` (including typewriter emulation), and audio mixing;
- exposes resolution, aspect, FPS, codec and CRF controls;
- clamps scale expressions to `0.05..20` so bad Inspector values cannot create an enormous canvas or invert a crop;
- emits real `ffmpeg-export-progress` events and includes the generated filter graph in FFmpeg error messages for diagnosis.

Only real FFmpeg software encoders are used. Capability UI is informational. The cancel mechanism is a process-wide flag, so **concurrent native exports are not supported**; the UI serializes exports.

## Caches and data locations

| Data | Location | Disposable? |
| --- | --- | --- |
| Projects / recent list | `%APPDATA%\QumenX\` | No — user data |
| Backups (max 12) | `%APPDATA%\QumenX\backups\` | No — user data |
| Preview proxies | `%LOCALAPPDATA%\QumenX\proxies\` | Yes |
| Thumbnails / waveforms | QumenX cache directories | Yes |

Source media is always opened read-only; QumenX never modifies it.

## Release topology

`QumenX/build-tauri.cmd` runs the Tauri build and then `QumenX/organize-build.ps1`. The organizer copies MSI/NSIS/archives/raw exe into `releases/windows/{installers,portable,executables}` without renaming, writes `SHA256SUMS.txt`, updates `releases/latest/latest.json`, and mirrors `QumenX/dist` into `builds/production`. Large binaries are intentionally untracked; `.gitkeep`, checksums, manifests and notes are tracked.

## Constraints and known issues

- FFmpeg/FFprobe must be on `PATH` at runtime; the app is otherwise fully offline.
- The GNU toolchain can emit a non-fatal `.rsrc merge failure: multiple non-default manifests` linker warning.
- This environment requires the `*.cmd` wrappers because Cargo/rustup and the MinGW linker are not on the default PATH, and `CARGO_TARGET_DIR` must be space-free for `windres`.
- Dev server is pinned to `http://127.0.0.1:5173` to avoid localhost IPv6 timeouts.
