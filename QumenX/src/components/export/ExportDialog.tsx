import * as React from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle, Check, Film, FolderOpen, HardDrive, Loader2,
  RefreshCw, Sparkles,
} from "lucide-react";
import { useExportStore } from "@/stores/exportStore";
import { useProjectStore } from "@/stores/projectStore";
import { ffmpeg } from "@/lib/ffmpeg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/scrollarea";
import { Collapsible, Field, Modal } from "@/components/ui/primitives";
import { serializeProject, showInFolder } from "@/lib/project";
import { RESOLUTIONS, FRAME_RATES, type ProjectSettings } from "@/types/project";
import { cn } from "@/lib/utils";

type Format = "mp4" | "mov" | "mkv" | "webm";
type PresetId = "fast" | "balanced" | "high" | "social" | "archive" | "custom";
type PresetValues = {
  resolution: ProjectSettings["resolution"];
  fps: number;
  codec: ProjectSettings["codec"];
  crf: number;
  audioBitrate: number;
};

const FORMATS: Array<{ value: Format; label: string }> = [
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WebM" },
];

const PRESETS: Array<{
  id: Exclude<PresetId, "custom">;
  label: string;
  description: string;
  values: PresetValues;
}> = [
  { id: "fast", label: "Fast", description: "720p · 30 fps", values: { resolution: "720p", fps: 30, codec: "h264", crf: 28, audioBitrate: 128 } },
  { id: "balanced", label: "Balanced", description: "1080p · 30 fps", values: { resolution: "1080p", fps: 30, codec: "h264", crf: 23, audioBitrate: 128 } },
  { id: "high", label: "High quality", description: "1080p · 60 fps", values: { resolution: "1080p", fps: 60, codec: "h264", crf: 18, audioBitrate: 192 } },
  { id: "social", label: "Social", description: "1080p · vertical ready", values: { resolution: "1080p", fps: 30, codec: "h264", crf: 23, audioBitrate: 128 } },
  { id: "archive", label: "Archive", description: "4K · efficient", values: { resolution: "4K", fps: 30, codec: "h265", crf: 18, audioBitrate: 192 } },
];

function defaultFolder(projectPath?: string): string {
  if (!projectPath) return "";
  const sep = projectPath.includes("/") && !projectPath.includes("\\") ? "/" : "\\";
  const idx = projectPath.lastIndexOf(sep);
  return idx > 0 ? projectPath.slice(0, idx) : "";
}

function safeFileName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "QumenX_Export";
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(megabytes: number): string {
  return megabytes >= 1024
    ? `~${(megabytes / 1024).toFixed(1)} GB`
    : `~${Math.max(1, Math.round(megabytes))} MB`;
}

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const project = useProjectStore((s) => s.project);
  const activeJobId = useExportStore((s) => s.activeJobId);
  const addJob = useExportStore((s) => s.addJob);
  const updateJob = useExportStore((s) => s.updateJob);
  const isExporting = useExportStore((s) =>
    s.jobs.some((j) => j.status === "queued" || j.status === "encoding")
  );
  const activeJob = useExportStore((s) => s.jobs.find((j) => j.id === activeJobId));

  const [preset, setPreset] = React.useState<PresetId>("balanced");
  const [format, setFormat] = React.useState<Format>("mp4");
  const [resolution, setResolution] = React.useState<ProjectSettings["resolution"]>(project.settings.resolution);
  const [fps, setFps] = React.useState<number>(project.settings.fps);
  const [codec, setCodec] = React.useState<ProjectSettings["codec"]>(project.settings.codec);
  const [crf, setCrf] = React.useState<number>(project.settings.crf ?? 23);
  const [audioBitrate, setAudioBitrate] = React.useState<number>(project.settings.audioBitrate ?? 128);
  const [fileName, setFileName] = React.useState(() => `${safeFileName(project.name)}_export`);
  const [outputPath, setOutputPath] = React.useState(() => defaultFolder(project.path));
  const [lastOutputPath, setLastOutputPath] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "exporting" | "done" | "error" | "cancelled">("idle");
  const [error, setError] = React.useState("");

  const unlisteners = React.useRef<Array<() => void | Promise<void>>>([]);
  const cancelledRef = React.useRef(false);
  const runningRef = React.useRef(false);

  const duration = React.useMemo(
    () => project.clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0),
    [project.clips]
  );
  const resolutionInfo = RESOLUTIONS.find((r) => r.value === resolution) ?? RESOLUTIONS[2];
  const estimatedSize = React.useMemo(() => {
    const pixelFactor = (resolutionInfo.w * resolutionInfo.h) / (1920 * 1080);
    const frameFactor = fps / 30;
    const codecFactor = codec === "h265" ? 0.7 : codec === "av1" || codec === "vp9" ? 0.62 : 1;
    const qualityFactor = crf <= 18 ? 12 : crf <= 23 ? 8 : crf <= 30 ? 5 : 3;
    const videoMbps = Math.max(0.5, pixelFactor * frameFactor * codecFactor * qualityFactor);
    return ((videoMbps + audioBitrate / 1000) * duration) / 8;
  }, [resolutionInfo, fps, codec, crf, audioBitrate, duration]);

  const cleanupListeners = React.useCallback(async () => {
    const list = unlisteners.current;
    unlisteners.current = [];
    await Promise.all(list.map((fn) => Promise.resolve().then(() => fn())));
  }, []);

  React.useEffect(() => () => { void cleanupListeners(); }, [cleanupListeners]);

  const chooseFolder = async () => {
    const sel = await openFolderDialog({ directory: true, multiple: false });
    if (typeof sel === "string") setOutputPath(sel);
    else if (Array.isArray(sel) && sel[0]) setOutputPath(sel[0]);
  };

  const applyPreset = (values: PresetValues, id: PresetId) => {
    setPreset(id);
    setResolution(values.resolution);
    setFps(values.fps);
    setCodec(values.codec);
    setCrf(values.crf);
    setAudioBitrate(values.audioBitrate);
  };

  const runExport = async () => {
    if (!outputPath) {
      setError("Please choose an output folder");
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    cancelledRef.current = false;
    const sep = outputPath.includes("/") && !outputPath.includes("\\") ? "/" : "\\";
    const out = `${outputPath.replace(/[\\/]+$/, "")}${sep}${safeFileName(fileName)}.${format}`;
    const settings: ProjectSettings = {
      ...project.settings,
      resolution,
      fps,
      codec,
      crf,
      audioBitrate,
      aspectRatio: project.settings.aspectRatio,
    };
    const projectJson = serializeProject({ ...project, settings });

    setStatus("exporting");
    setError("");
    const job = {
      id: crypto.randomUUID(),
      status: "encoding" as const,
      progress: 0,
      outputPath: out,
      startedAt: Date.now(),
    };
    setLastOutputPath(out);
    addJob(job);

    await cleanupListeners();
    unlisteners.current.push(await ffmpeg.onProgress((e) => {
      updateJob(job.id, { progress: e.percent, estimatedRemainingMs: e.estimatedRemainingMs });
      if (e.percent >= 100 && !cancelledRef.current) {
        setStatus("done");
        updateJob(job.id, { status: "completed", progress: 100, completedAt: Date.now() });
      }
    }));
    unlisteners.current.push(await ffmpeg.onExportComplete(() => {
      if (!cancelledRef.current) {
        setStatus("done");
        updateJob(job.id, { status: "completed", progress: 100, completedAt: Date.now() });
      }
    }));

    try {
      await ffmpeg.export(projectJson, out);
      if (!cancelledRef.current) {
        setStatus("done");
        updateJob(job.id, { status: "completed", progress: 100, completedAt: Date.now() });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (cancelledRef.current) {
        setStatus("cancelled");
        updateJob(job.id, { status: "cancelled", completedAt: Date.now() });
      } else {
        setStatus("error");
        setError(message);
        updateJob(job.id, { status: "failed", error: message });
      }
    } finally {
      runningRef.current = false;
      await cleanupListeners();
    }
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    if (activeJob) updateJob(activeJob.id, { status: "cancelled", completedAt: Date.now() });
    setStatus("cancelled");
    try {
      await ffmpeg.cancelExport();
    } catch {
      // Export may already have finished; the status flag above is authoritative.
    }
  };

  const revealOutput = () => {
    const path = lastOutputPath || activeJob?.outputPath;
    if (!path) return;
    const sep = path.includes("/") && !path.includes("\\") ? "/" : "\\";
    const idx = path.lastIndexOf(sep);
    void showInFolder(idx > 0 ? path.slice(0, idx) : path);
  };

  if (!open) return null;

  const outputLabel = outputPath || "Choose an output folder";
  const progress = Math.min(100, Math.max(0, activeJob?.progress ?? 0));
  const canExport = Boolean(outputPath && fileName.trim()) && !isExporting;
  const closeDialog = () => { if (status !== "exporting") onOpenChange(false); };

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="Export video"
      description="Render your timeline with real FFmpeg. Nothing is uploaded or watermarked."
      width="max-w-3xl"
      footer={
        status === "exporting" ? (
          <div className="w-full">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-2 font-medium text-editor-text">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-editor-accent" /> Encoding…
              </span>
              <span className="font-mono tabular-nums text-editor-textMuted">{Math.round(progress)}%</span>
            </div>
            <div className="qx-progress">
              <div className="qx-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[10px] text-editor-textMuted">
                {activeJob?.estimatedRemainingMs
                  ? `About ${Math.max(1, Math.ceil(activeJob.estimatedRemainingMs / 1000))}s remaining`
                  : "This can take a few moments"}
              </span>
              <Button variant="outline" onClick={() => void handleCancel()}>Cancel export</Button>
            </div>
          </div>
        ) : status === "done" ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium text-[var(--qx-success)]">
                <Check className="h-4 w-4" /> Export complete
              </p>
              <p className="mt-0.5 truncate text-[10px] text-editor-textMuted">
                {lastOutputPath || activeJob?.outputPath}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={revealOutput}><FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Show in folder</Button>
            </div>
          </div>
        ) : status === "cancelled" || status === "error" ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className={cn("flex items-center gap-2 text-xs", status === "error" ? "text-[var(--qx-danger)]" : "text-[var(--qx-warning)]")}>
              {status === "error" ? <AlertTriangle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {status === "error" ? error || "Export failed" : "Export cancelled."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStatus("idle"); setError(""); }}>Back</Button>
              <Button onClick={() => void runExport()} disabled={!canExport}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[10px] text-editor-textMuted">
              <Sparkles className="h-3.5 w-3.5 text-editor-accent" />
              Rendered locally with your FFmpeg installation.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => void runExport()} disabled={!canExport} className="px-5">
                <Film className="mr-1.5 h-3.5 w-3.5" /> Export video
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <section>
          <h3 className="qx-section-label mb-2">Quick presets</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.values, item.id)}
                data-active={preset === item.id}
                className={cn("qx-card qx-card-hover p-2.5 text-left", preset === item.id && "border-editor-accent")}
                style={preset === item.id ? { background: "var(--qx-accent-soft)", borderColor: "var(--qx-accent)" } : undefined}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-editor-text">{item.label}</span>
                  {preset === item.id ? <Check className="h-3 w-3 text-editor-accent" /> : null}
                </span>
                <span className="mt-1 block text-[9px] leading-snug text-editor-textMuted">{item.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="qx-section-label mb-2">Container</h3>
          <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--qx-border)", background: "rgba(10,12,17,.45)" }}>
            {FORMATS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFormat(item.value)}
                aria-pressed={format === item.value}
                className={cn("h-7 rounded px-3 text-[10px] font-semibold transition-colors",
                  format === item.value ? "text-white" : "text-editor-textMuted hover:text-editor-text")}
                style={format === item.value ? { background: "var(--qx-accent)" } : undefined}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="qx-card p-3">
          <h3 className="qx-section-label mb-2">Output</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="File name" hint={`.${format}`}>
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.currentTarget.value.replace(/[<>:"/\\|?*]/g, "_"))}
                aria-label="Export file name"
              />
            </Field>
            <Field label="Folder">
              <div className="flex gap-2">
                <Input value={outputLabel} readOnly aria-label="Output folder" className="min-w-0 flex-1 text-[11px]" />
                <Button variant="outline" onClick={() => void chooseFolder()} title="Choose output folder">
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryChip icon={<HardDrive className="h-3 w-3" />} label="Estimated size" value={formatSize(estimatedSize)} />
            <SummaryChip icon={<Film className="h-3 w-3" />} label="Duration" value={formatTime(duration)} />
            <SummaryChip label="Resolution" value={`${resolutionInfo.w}×${resolutionInfo.h}`} />
            <SummaryChip label="Frame rate" value={`${fps} fps`} />
          </div>
        </section>

        <Collapsible title="Advanced settings" defaultOpen={false} className="qx-card">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Resolution">
              <Select value={resolution} onValueChange={(v) => { setResolution(v as typeof resolution); setPreset("custom"); }}>
                {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Frame rate">
              <Select value={String(fps)} onValueChange={(v) => { setFps(Number(v)); setPreset("custom"); }}>
                {FRAME_RATES.map((f) => <option key={f} value={String(f)}>{f} FPS</option>)}
              </Select>
            </Field>
            <Field label="Video encoder">
              <Select value={codec} onValueChange={(v) => { setCodec(v as typeof codec); setPreset("custom"); }}>
                <option value="h264">H.264 — widest compatibility</option>
                <option value="h265">H.265 / HEVC</option>
                <option value="vp9">VP9</option>
                <option value="av1">AV1</option>
              </Select>
            </Field>
            <Field label="Audio bitrate">
              <Select value={String(audioBitrate)} onValueChange={(v) => { setAudioBitrate(Number(v)); setPreset("custom"); }}>
                {[96, 128, 192, 256, 320].map((rate) => <option key={rate} value={String(rate)}>{rate} kbps</option>)}
              </Select>
            </Field>
            <Field label="Quality" hint={`CRF ${crf} · ${crf <= 18 ? "high" : crf <= 25 ? "balanced" : "small file"}`}>
              <Slider
                value={crf}
                min={0}
                max={51}
                step={1}
                onValueChange={(v) => { setCrf(v); setPreset("custom"); }}
                aria-label="Export quality CRF"
              />
              <div className="mt-1 flex justify-between text-[9px] text-editor-textMuted">
                <span>Higher quality</span><span>Smaller file</span>
              </div>
            </Field>
            <div className="flex items-end">
              <p className="rounded-md border p-2 text-[10px] leading-relaxed text-editor-textMuted"
                style={{ borderColor: "var(--qx-border)" }}>
                Exports always use reliable software encoders. Hardware acceleration in the capability panel is informational only.
              </p>
            </div>
          </div>
        </Collapsible>
      </div>
    </Modal>
  );
}

function SummaryChip({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--qx-border)", background: "rgba(10,12,17,.4)" }}>
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-editor-textMuted">
        {icon}{label}
      </p>
      <p className="mt-1 truncate text-[11px] font-semibold text-editor-text">{value}</p>
    </div>
  );
}
