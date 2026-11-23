import { ffmpeg, type MediaMetadata } from "@/lib/ffmpeg";
import { useMediaStore } from "@/stores/mediaStore";
import { useProjectStore } from "@/stores/projectStore";
import { newAsset } from "@/types/project";

export interface ImportResult {
  imported: number;
  failed: Array<{ name: string; error: string }>;
}

/** Import original media paths. FFmpeg only reads them; source files are never modified. */
export async function importMediaPaths(
  paths: string[],
  onProgress?: (progress: number, name: string) => void
): Promise<ImportResult> {
  const unique = [...new Set(paths.filter(Boolean))];
  const failed: ImportResult["failed"] = [];
  let imported = 0;
  const proxyEnabled = useProjectStore.getState().project.settings.proxyEnabled ?? true;

  for (let index = 0; index < unique.length; index += 1) {
    const path = unique[index];
    const name = path.split(/[/\\]/).pop() || path;
    onProgress?.((index / unique.length) * 100, name);
    try {
      const meta = await ffmpeg.probe(path);
      const thumbPath = await makeThumbnail(path, meta);
      const type = detectType(path, meta);
      let proxyPath: string | undefined;
      if (proxyEnabled && type === "video") {
        try {
          proxyPath = (await ffmpeg.proxy(path)).path;
        } catch {
          // Proxies are an optimization; import still succeeds without one.
        }
      }
      const asset = newAsset({
        name,
        type,
        path,
        duration: meta.duration || 5,
        width: meta.width,
        height: meta.height,
        fps: meta.fps || 30,
        size: meta.size,
        thumbPath,
        proxyPath,
        hasAudio: meta.hasAudio,
      });
      useMediaStore.getState().addAsset(asset);
      useProjectStore.getState().addAsset(asset);
      imported += 1;
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  onProgress?.(100, "");
  return { imported, failed };
}

async function makeThumbnail(path: string, meta: MediaMetadata): Promise<string | undefined> {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext);
  if (meta.width <= 0 && !isImage) return undefined;
  const time = isImage ? 0 : Math.min(1, Math.max(0, (meta.duration || 2) / 2));
  try {
    return (await ffmpeg.thumbnail(path, time, 240)).path;
  } catch {
    return undefined;
  }
}

function detectType(path: string, meta: MediaMetadata): "video" | "audio" | "image" {
  const ext = path.split(".").pop()?.toLowerCase();
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext ?? "")) return "audio";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext ?? "")) return "image";
  return meta.hasAudio || meta.width > 0 ? "video" : "audio";
}
