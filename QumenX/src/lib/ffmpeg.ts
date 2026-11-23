import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface MediaMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
  format: string;
  codec: string;
  hasAudio: boolean;
}

export interface ThumbnailResult {
  path: string;
}

export interface ExportProgressEvent {
  percent: number;
  estimatedRemainingMs?: number;
  speed?: string;
}

export class FFmpegError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "FFmpegError";
    this.code = code;
  }
}

async function tauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "Unknown Tauri error");
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    throw new FFmpegError(message, code);
  }
}

export const ffmpeg = {
  probe: (path: string): Promise<MediaMetadata> => tauri("ffmpeg_probe", { path }),

  thumbnail: (path: string, time: number, width = 320): Promise<ThumbnailResult> =>
    tauri("ffmpeg_thumbnail", { path, time, width }),

  thumbnails: (
    path: string,
    times: number[],
    width: number
  ): Promise<Array<{ time: number; path: string }>> =>
    tauri("ffmpeg_thumbnails", { path, times, width }),

  waveform: (path: string, samples: number): Promise<number[]> =>
    tauri("ffmpeg_waveform", { path, samples }),

  /** Generate a cached low-resolution preview copy without touching the source. */
  proxy: (path: string): Promise<{ path: string }> =>
    tauri("ffmpeg_proxy", { path }),

  capabilities: (): Promise<{
    h264: boolean;
    h265: boolean;
    vp9: boolean;
    av1: boolean;
    hwaccel: string[];
  }> => tauri("ffmpeg_capabilities", {}),

  export: (
    projectJson: string,
    outputPath: string
  ): Promise<{ outputPath: string; durationMs: number }> =>
    tauri("ffmpeg_export", { project_json: projectJson, output_path: outputPath }),

  cancelExport: (): Promise<void> => tauri("ffmpeg_cancel_export", {}),

  onProgress: (cb: (e: ExportProgressEvent) => void) =>
    listen<ExportProgressEvent>("ffmpeg-export-progress", (event) => cb(event.payload)),

  onExportComplete: (cb: (e: { outputPath: string }) => void) =>
    listen<{ outputPath: string }>("ffmpeg-export-complete", (event) => cb(event.payload)),
};
