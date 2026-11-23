# QumenX user guide

QumenX is a local video editor for Windows 10/11 x64. This guide covers the full editing workflow: import, edit, save and export. Nothing is uploaded, and your source media is never rewritten.

## Before you start

1. Install **FFmpeg and FFprobe** and make sure `ffmpeg -version` and `ffprobe -version` work in a terminal.
   - Example: `winget install Gyan.FFmpeg.Essentials`
2. Install QumenX from an MSI/NSIS installer, or run the standalone `qumenx.exe`.
3. On first launch, confirm the window title reads **QumenX — Professional Video Editor**.

FFmpeg is required even for import: QumenX uses it to read metadata, create thumbnails/waveforms, build preview proxies and render exports. If it is missing, metadata can appear blank and export will fail.

## Import media

1. Choose **Import** in the app and select one or more video, image or audio files.
2. QumenX probes each file with FFprobe, adds it to the media panel and generates derived caches:
   - thumbnails for visual assets,
   - waveforms for audio,
   - a low-resolution proxy for video.
3. Select an asset in the media panel and add it to the timeline to create a clip.

The proxy is a disposable preview cache under `%LOCALAPPDATA%\QumenX\proxies\`. It is keyed by source path and modification time. If it goes missing, QumenX falls back to the original source. Deleting proxies is safe; it does not change your media.

> Keep your original files where they are. A QumenX project stores references, not embedded copies, so moving or deleting source media will break preview and export.

## Work with the timeline

The timeline is multi-track. Later/higher tracks composite over lower ones, and hidden or muted tracks are excluded from both preview and export.

Common operations:

- **Move and trim** clips directly on the timeline. Cross-track moves are supported.
- **Split** at the playhead, then **duplicate** or **delete** the result.
- **Group** and multi-select clips to move related edits together.
- **Snap** to frames (frame-rate aware) and zoom for precise trimming.
- **Resize tracks** and use the track **eye / speaker / lock** controls to hide, mute or lock a track. Locked tracks reject clip and keyframe edits without creating empty undo entries.
- Use **undo / redo** for labeled history. Multi-step actions are grouped into one predictable history entry.

Clips reference a **source-time range**. Trimming, speed, reverse and freeze change how the playhead maps into that range; they do not cut the source file.

## Preview and playback

The preview composites all visible tracks in real time at the current playhead position. It includes:

- overlays, opacity and z-order,
- text with styling and animation,
- transitions, effects and fades,
- keyframed scale, position, opacity and volume,
- speed, reverse and freeze behavior,
- aspect ratios, safe-zone guides, vignette and fullscreen.

Playback uses `requestAnimationFrame` and a synced playhead. Editing stays responsive because preview uses low-resolution proxies rather than full-resolution renders.

If preview looks soft, check the preview quality control or regenerate the proxy for that asset. Softness in the preview does not mean the export will be soft: export renders from the real source media.

## Edit clips and assets

The inspector and sidebar expose the real editing actions:

- **Transform:** crop, rotate, flip, scale and position.
- **Timing:** trim, split, speed, reverse and freeze/hold a frame.
- **Color and effects:** saturation and other visual effects.
- **Audio:** volume, mixing and fades; waveforms are shown on audio clips.
- **Text:** styled captions/titles with animation and typewriter emulation.
- **Keyframes:** add diamonds for animated properties and drag them on the timeline.

Values are validated before export. Scale factors are clamped to `0.05..20` so an accidental value cannot create an enormous canvas or invert a crop.

## Save, back up and recover projects

Projects are version-2 JSON documents saved to `%APPDATA%\QumenX\`.

- **Save** writes atomically: if replacement fails, the previous file is restored.
- Each save can create a timestamped backup in `%APPDATA%\QumenX\backups\`, with at most **12** rotating backups.
- **Open** validates the document. A corrupt file is reported with a recovery path rather than silently accepted.
- You can list, inspect and restore a backup from the app. Restoration overwrites the selected project target, so save any unsolved work first.
- **Recent projects** are remembered for quick reopening.
- Version-1 projects are normalized on load; a one-time migration also reads the older `capcut-editor` data folder.

Do not hand-edit a project file while QumenX has it open. Keep source media paths stable, and copy the media along with the project if you move the project to another machine.

## Export

1. Open the export dialog and choose the output path.
2. Set **resolution**, **aspect ratio**, **FPS**, **codec** and **CRF/quality**.
3. Start the export. QumenX builds a real FFmpeg filter graph from the project and runs FFmpeg locally.
4. Watch live progress events. **Cancel** is available while rendering.

Exports are genuine H.264/AAC media, probed during verification with `ffprobe`. No watermark is added and no simulated render is used.

### Export behavior to know

- Hidden and muted tracks are respected, and track z-order is preserved.
- Trim, speed, reverse, freeze, crop, rotation, flip, keyframes, effects, fades, transitions, text animation and audio mixing are all rendered into the output.
- The output path must be writable and should not be the same as a source file.
- A failed export shows the generated filter graph in the error so problems can be diagnosed.
- **Only one native export can run at a time.** The Rust backend uses a process-wide cancel flag, so the UI serializes exports. Wait for the current export to finish or cancel it before starting another.
- Hardware/codec capability indicators are informational; exports intentionally use reliable software encoders.
- Full-resolution export can take time on long timelines. Preview remains responsive because it uses proxies.

## Where QumenX stores data

| Data | Location | Safe to delete? |
| --- | --- | --- |
| Projects and recent list | `%APPDATA%\QumenX\` | No — user data |
| Rotating backups | `%APPDATA%\QumenX\backups\` | No — user data |
| Preview proxies | `%LOCALAPPDATA%\QumenX\proxies\` | Yes — regenerated |
| Thumbnails / waveforms | QumenX cache directories | Yes — regenerated |

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Blank metadata or "FFmpeg not found" | Install FFmpeg + FFprobe, verify both `-version` commands in the same terminal, then restart QumenX. |
| Soft or missing preview | Regenerate the proxy. QumenX should fall back to source media automatically. |
| Export fails immediately | Check that the output folder exists, FFmpeg is on `PATH`, and the error message's filter graph for clues. |
| Export is slow | This is a full-resolution FFmpeg render; check resolution/FPS/CRF settings. |
| Second export does nothing | Wait for the first export to finish or cancel it; concurrent native exports are unsupported. |
| Cannot open a project | Use the recovery notice or restore a backup from `%APPDATA%\QumenX\backups\`. |
| Timeline edit did nothing | The track may be locked. Unlock it and retry. |

For deeper architecture details, see [architecture.md](architecture.md). For release and build details, see [development.md](development.md).
