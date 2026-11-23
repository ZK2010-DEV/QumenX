import * as React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePreviewStore } from "@/stores/previewStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  Play, Pause, Maximize, Minimize, Volume2, VolumeX, SkipBack, SkipForward,
  Magnet, PanelRight, ScanLine, Gauge,
} from "lucide-react";
import { Slider } from "@/components/ui/scrollarea";
import { Select } from "@/components/ui/tabs";
import {
  ASPECT_RATIOS, RESOLUTIONS, keyframeValue, clipCssFilter, clipVignette, snapTimeToFrame,
  type Clip, type Asset, type TextStyle, type Track,
} from "@/types/project";
import { cn } from "@/lib/utils";
import { IconButton, Segmented } from "@/components/ui/primitives";

interface RenderLayer {
  clip: Clip;
  asset?: Asset;
  track: Track;
}

function isClipFrozen(clip: Clip, local: number): boolean {
  const f = clip.freeze;
  return !!f?.enabled && f.duration > 0 && local >= f.at && local < f.at + f.duration;
}

/** Map timeline-local time to source time, including reverse and freeze holds. */
function clipSourceTime(clip: Clip, asset: Asset | undefined, local: number): number {
  const speed = clip.speed || 1;
  const effectiveLocal = isClipFrozen(clip, local)
    ? Math.max(0, clip.freeze?.at ?? local)
    : local;
  const span = asset?.duration || clip.duration;
  const mapped = speed < 0
    ? clip.sourceOffset + Math.max(0, clip.duration - effectiveLocal) * Math.abs(speed)
    : clip.sourceOffset + effectiveLocal * Math.abs(speed);
  const limit = Math.max(0, span - 0.04);
  return Math.max(0, Math.min(limit, mapped));
}

/** Low/medium preview quality uses generated proxy files when available. */
function previewSource(asset: Asset, useProxy: boolean): string {
  return convertFileSrc(useProxy && asset.proxyPath ? asset.proxyPath : asset.path);
}

export function PreviewPanel() {
  const {
    isPlaying, currentTime, duration, volume, muted, playbackRate,
    aspectRatio, fitToScreen, fullscreen, showSafeZones,
    setCurrentTime, setDuration, togglePlay,
    setVolume, setMuted, setPlaybackRate, setAspectRatio,
    toggleFitToScreen, toggleFullscreen, toggleSafeZones,
  } = usePreviewStore();
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const project = useProjectStore((s) => s.project);
  const assets = useMediaStore((s) => s.assets);
  const snapToClip = useTimelineStore((s) => s.snapToClip);
  const toggleSnapToClip = useTimelineStore((s) => s.toggleSnapToClip);
  const inspectorCollapsed = useWorkspaceStore((s) => s.inspectorCollapsed);
  const toggleInspector = useWorkspaceStore((s) => s.toggleInspector);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const mediaRefs = React.useRef<Map<string, HTMLMediaElement>>(new Map());
  const [stageScale, setStageScale] = React.useState(1);

  const aspect = ASPECT_RATIOS.find((a) => a.value === aspectRatio) ?? ASPECT_RATIOS[0];
  const designW = aspect.w;
  const designH = aspect.h;

  const projectDuration = React.useMemo(
    () => project.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0),
    [project.clips]
  );

  React.useEffect(() => {
    if (projectDuration > 0 && Math.abs(duration - projectDuration) > 0.05) {
      setDuration(projectDuration);
    }
  }, [projectDuration, duration, setDuration]);

  /** Master playback clock. Drives playhead, videos and audio together. */
  React.useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    let lastCommit = 0;
    let accumulated = 0;
    const fps = project.settings.fps || 30;
    const minInterval = 1000 / fps;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      accumulated += dt;
      if (now - lastCommit >= minInterval) {
        lastCommit = now;
        const advance = accumulated;
        accumulated = 0;
        usePreviewStore.getState().advanceBy(advance, usePreviewStore.getState().duration);
        const state = usePreviewStore.getState();
        useTimelineStore.getState().setPlayheadTime(state.currentTime);
        if (!state.isPlaying) return;
      }
      syncMedia(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // syncMedia is intentionally read from refs each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  /** Keep every active media element at the correct source time / volume. */
  const syncMedia = (now: number) => {
    const preview = usePreviewStore.getState();
    const tl = useTimelineStore.getState().playheadTime;
    const proj = useProjectStore.getState().project;
    const mediaAssets = useMediaStore.getState().assets;
    const assetMap = new Map(mediaAssets.map((a) => [a.id, a]));
    const trackMap = new Map(proj.tracks.map((t) => [t.id, t]));
    const frameTolerance = 1 / (proj.settings.fps || 30);

    for (const clip of proj.clips) {
      const el = mediaRefs.current.get(clip.id);
      if (!el) continue;
      const track = trackMap.get(clip.trackId);
      const active = tl >= clip.start && tl < clip.start + clip.duration && track?.visible !== false;
      const local = Math.max(0, tl - clip.start);
      const asset = assetMap.get(clip.assetId);

      if (!active) {
        if (!el.paused) el.pause();
        continue;
      }

      const frozen = isClipFrozen(clip, local);
      const sourceTime = clipSourceTime(clip, asset, local);
      const speed = clip.speed || 1;
      const needsSeek = frozen || speed < 0;

      if (asset && asset.type !== "audio") {
        if (needsSeek) {
          // HTML media cannot play backwards or hold a still while running.
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - sourceTime) > frameTolerance) {
            try { el.currentTime = sourceTime; } catch { /* not seekable yet */ }
          }
        } else {
          // The master clock already applies preview.playbackRate; media only
          // follows the clip's own speed to avoid double-rate drift.
          const desiredRate = Math.max(0.0625, Math.min(16, Math.abs(speed)));
          if (Math.abs(el.playbackRate - desiredRate) > 0.01) el.playbackRate = desiredRate;
          if (preview.isPlaying) {
            if (Math.abs(el.currentTime - sourceTime) > 0.3) {
              try { el.currentTime = sourceTime; } catch { /* not seekable yet */ }
            }
            if (el.paused) void el.play().catch(() => { /* user gesture required */ });
          } else {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - sourceTime) > frameTolerance) {
              try { el.currentTime = sourceTime; } catch { /* not seekable yet */ }
            }
          }
        }
      } else if (asset?.type === "audio") {
        if (needsSeek) {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - sourceTime) > frameTolerance) {
            try { el.currentTime = sourceTime; } catch { /* not seekable yet */ }
          }
        } else {
          const desiredRate = Math.max(0.0625, Math.min(16, Math.abs(speed)));
          if (Math.abs(el.playbackRate - desiredRate) > 0.01) el.playbackRate = desiredRate;
          if (Math.abs(el.currentTime - sourceTime) > 0.3) {
            try { el.currentTime = sourceTime; } catch { /* not seekable yet */ }
          }
          if (preview.isPlaying) {
            if (el.paused) void el.play().catch(() => {});
          } else if (!el.paused) el.pause();
        }
      }

      // Volume keyframes, mute and fades are applied continuously.
      const baseVolume = keyframeValue(clip, "volume", local, clip.volume);
      let gain = preview.muted || clip.muted || track?.muted ? 0 : baseVolume * preview.volume;
      const fadeIn = clip.audioFadeIn ?? 0;
      const fadeOut = clip.audioFadeOut ?? 0;
      if (fadeIn > 0 && local < fadeIn) gain *= local / fadeIn;
      if (fadeOut > 0 && local > clip.duration - fadeOut) gain *= Math.max(0, (clip.duration - local) / fadeOut);
      el.muted = gain <= 0.001;
      el.volume = Math.max(0, Math.min(1, gain));
    }
    void now;
  };

  /** External playhead changes (ruler, inspector, keyboard) resync paused media. */
  React.useEffect(() => {
    if (!isPlaying) syncMedia(performance.now());
    // syncMedia intentionally reads live state from the stores on each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadTime, isPlaying, project, assets]);

  /** Single seek operation keeps preview store and timeline playhead in sync. */
  const seek = React.useCallback((time: number) => {
    const raw = Math.max(0, Math.min(duration || projectDuration, time));
    const t = snapTimeToFrame(raw, project.settings.fps || 30);
    setCurrentTime(t);
    useTimelineStore.getState().setPlayheadTime(t);
    requestAnimationFrame(() => syncMedia(performance.now()));
  }, [duration, projectDuration, project.settings.fps, setCurrentTime]);

  // Resize observer keeps the design-space compositor scaled to the visible stage.
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setStageScale(Math.min(rect.width / designW, rect.height / designH));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designW, designH, fullscreen]);

  const trackMap = React.useMemo(
    () => new Map(project.tracks.map((t) => [t.id, t])),
    [project.tracks]
  );
  const assetMap = React.useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets]
  );

  const layers: RenderLayer[] = React.useMemo(() => {
    return project.clips
      .filter((c) => playheadTime >= c.start && playheadTime < c.start + c.duration)
      .filter((c) => trackMap.get(c.trackId)?.visible !== false)
      .filter((c) => trackMap.get(c.trackId)?.type !== "audio")
      .map((c) => ({ clip: c, asset: assetMap.get(c.assetId), track: trackMap.get(c.trackId)! }))
      .filter((l) => !!l.track)
      .sort((a, b) => (a.clip.zIndex - b.clip.zIndex) || (a.track.order - b.track.order));
  }, [project.clips, playheadTime, trackMap, assetMap]);

  const audioSources = React.useMemo(() => project.clips.filter((c) => {
    const a = assetMap.get(c.assetId);
    return a?.type === "audio" && playheadTime >= c.start && playheadTime < c.start + c.duration;
  }), [project.clips, assetMap, playheadTime]);

  const stageStyle: React.CSSProperties = {
    aspectRatio: `${designW} / ${designH}`,
    ...(fitToScreen
      ? { maxHeight: "100%", maxWidth: "100%" }
      : { width: designW / 4, height: designH / 4 }),
  };

  // Keep store state aligned when the user leaves fullscreen with Esc.
  React.useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && usePreviewStore.getState().fullscreen) toggleFullscreen();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [toggleFullscreen]);

  const toggleFullscreenEl = () => {
    const el = document.querySelector<HTMLElement>("[data-preview-stage]");
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().then(() => toggleFullscreen()).catch(() => {});
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().then(() => toggleFullscreen()).catch(() => {});
    }
  };

  const resolutionLabel = RESOLUTIONS.find((r) => r.value === project.settings.resolution)?.label ?? project.settings.resolution;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--qx-bg)" }}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--qx-border)", background: "rgba(12,14,20,.72)" }}>
        <span className="qx-section-label">Preview</span>
        <span className="qx-chip">{aspect.value} · {resolutionLabel}</span>
        <span className="qx-chip">{project.settings.fps} FPS</span>
        <div className="flex-1" />
        <IconButton tooltip={showSafeZones ? "Hide safe zones" : "Show safe zones"} active={showSafeZones}
          onClick={toggleSafeZones} aria-label="Safe zones"><ScanLine className="h-3.5 w-3.5" /></IconButton>
        <IconButton tooltip={fitToScreen ? "Actual size" : "Fit to screen"} active={fitToScreen}
          onClick={toggleFitToScreen} aria-label="Fit to screen">
          {fitToScreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton tooltip="Fullscreen preview" onClick={toggleFullscreenEl} aria-label="Fullscreen preview">
          <Maximize className="h-3.5 w-3.5" />
        </IconButton>
        <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}
          className="h-7 w-24 text-[10px]" aria-label="Aspect ratio">
          {ASPECT_RATIOS.map((a) => <option key={a.value} value={a.value}>{a.value}</option>)}
        </Select>
        <IconButton tooltip={inspectorCollapsed ? "Show inspector" : "Hide inspector"} onClick={toggleInspector}
          active={!inspectorCollapsed} aria-label="Toggle inspector"><PanelRight className="h-3.5 w-3.5" /></IconButton>
      </div>

      <div className="qx-stage-grid relative flex min-h-0 flex-1 items-center justify-center p-4">
        <div
          data-preview-stage
          className={cn(
            "relative overflow-hidden rounded-xl border bg-black shadow-panel flex items-center justify-center",
            fullscreen && "fixed inset-0 z-40 rounded-none border-0"
          )}
          style={{
            ...stageStyle,
            borderColor: "var(--qx-border-strong)",
            boxShadow: "var(--qx-shadow)",
          }}
        >
          <div
            ref={stageRef}
            className="absolute inset-0"
            style={{ containerType: "size" }}
          >
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: designW,
                height: designH,
                transform: `translate(-50%, -50%) scale(${stageScale})`,
                transformOrigin: "center",
                background: "#000",
              }}
            >
              {layers.map((layer) => (
                <PreviewLayerView
                  key={layer.clip.id}
                  layer={layer}
                  playheadTime={playheadTime}
                  designW={designW}
                  designH={designH}
                  registerRef={(el) => {
                    if (el) mediaRefs.current.set(layer.clip.id, el);
                    else mediaRefs.current.delete(layer.clip.id);
                  }}
                />
              ))}
              {showSafeZones && (
                <div className="pointer-events-none absolute inset-[10%] border-2 border-white/30"
                  style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0)" }}>
                  <div className="absolute inset-[10%] border-2 border-dashed border-white/20" />
                </div>
              )}
            </div>
          </div>

          {layers.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Play className="h-5 w-5 text-editor-textMuted" />
              </div>
              <p className="text-xs font-medium text-editor-text">Nothing at the playhead</p>
              <p className="max-w-[260px] text-[11px] leading-relaxed text-editor-textMuted">
                Import media, then add a clip to the timeline to see it here.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 z-10 bg-transparent hover:bg-white/5"
            aria-label={isPlaying ? "Pause" : "Play"}
          />
          {!isPlaying && layers.length > 0 && (
            <div className="absolute z-20 flex items-center justify-center pointer-events-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                <Play className="ml-0.5 h-6 w-6" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden audio elements are kept mounted only while their clip is active. */}
      <div className="hidden" aria-hidden>
        {audioSources.map((clip) => {
          const asset = assetMap.get(clip.assetId);
          if (!asset) return null;
          return (
            <audio
              key={clip.id}
              ref={(el) => {
                if (el) mediaRefs.current.set(clip.id, el);
                else mediaRefs.current.delete(clip.id);
              }}
              src={convertFileSrc(asset.path)}
              preload="auto"
            />
          );
        })}
      </div>

      <div className="flex h-[72px] shrink-0 items-center gap-3 border-t px-4"
        style={{ borderColor: "var(--qx-border)", background: "rgba(12,14,20,.85)" }}>
        <div className="flex items-center gap-0.5">
          <IconButton tooltip={isPlaying ? "Pause" : "Play"} shortcut="Space" onClick={togglePlay}
            className="!h-9 !w-9 !rounded-full" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </IconButton>
          <IconButton tooltip="Back 1 second" onClick={() => seek(currentTime - 1)} aria-label="Back 1 second">
            <SkipBack className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Forward 1 second" onClick={() => seek(currentTime + 1)} aria-label="Forward 1 second">
            <SkipForward className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--qx-accent)" }}>{formatTime(currentTime)}</span>
            <div
              className="group relative h-1.5 flex-1 cursor-pointer rounded-full"
              style={{ background: "#303745" }}
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const at = (x: number) => seek(((x - rect.left) / rect.width) * (duration || projectDuration));
                at(e.clientX);
                const move = (ev: MouseEvent) => at(ev.clientX);
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            >
              <div className="absolute left-0 top-0 h-full rounded-full" style={{
                width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
                background: "var(--qx-accent)",
              }} />
              <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow"
                style={{ left: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`, borderColor: "var(--qx-accent)" }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-editor-textMuted">{formatTime(duration)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <IconButton tooltip={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} active={muted}
              aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </IconButton>
            <Slider value={Math.round(volume * 100)} min={0} max={100}
              onValueChange={(v) => setVolume(v / 100)} className="w-24" aria-label="Volume" />
            <span className="w-8 text-[10px] tabular-nums text-editor-textMuted">{Math.round((muted ? 0 : volume) * 100)}%</span>
            <IconButton tooltip="Snap to clip edges" active={snapToClip} onClick={toggleSnapToClip} aria-label="Snap to clip edges">
              <Magnet className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Gauge className="h-3.5 w-3.5 text-editor-textMuted" />
          <Segmented
            ariaLabel="Playback speed"
            value={String(playbackRate)}
            onChange={(v) => setPlaybackRate(Number(v))}
            options={[{ value: "0.5", label: "0.5×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewLayerView({ layer, playheadTime, designW, designH, registerRef }: {
  layer: RenderLayer;
  playheadTime: number;
  designW: number;
  designH: number;
  registerRef: (el: HTMLMediaElement | null) => void;
}) {
  const { clip, asset } = layer;
  const local = Math.max(0, playheadTime - clip.start);
  const t = clip.transform;
  const baseW = Math.max(1, t.width || designW);
  const baseH = Math.max(1, t.height || designH);

  const x = keyframeValue(clip, "positionX", local, t.position?.x ?? 0);
  const y = keyframeValue(clip, "positionY", local, t.position?.y ?? 0);
  const scale = keyframeValue(clip, "scale", local, t.scale ?? 1);
  const rotation = keyframeValue(clip, "rotation", local, t.rotation ?? 0);
  const opacity = Math.max(0, Math.min(1, keyframeValue(clip, "opacity", local, clip.opacity ?? t.opacity ?? 1)));
  const crop = {
    top: keyframeValue(clip, "cropTop", local, clip.crop?.top ?? 0),
    right: keyframeValue(clip, "cropRight", local, clip.crop?.right ?? 0),
    bottom: keyframeValue(clip, "cropBottom", local, clip.crop?.bottom ?? 0),
    left: keyframeValue(clip, "cropLeft", local, clip.crop?.left ?? 0),
  };

  // Transition envelope: incoming and outgoing fades/moves.
  let transitionAlpha = 1;
  let transitionX = 0;
  let transitionScale = 1;
  let transitionBlur = 0;
  const tin = clip.transitionIn;
  if (tin && local < tin.duration && tin.duration > 0) {
    const p = Math.max(0, Math.min(1, local / tin.duration));
    transitionAlpha = p;
    if (tin.kind === "slide" || tin.kind === "wipe") transitionX = (1 - p) * -designW * 0.5;
    if (tin.kind === "zoom") transitionScale = 0.5 + 0.5 * p;
    if (tin.kind === "blur") transitionBlur = (1 - p) * 12;
  }
  const tout = clip.transitionOut;
  if (tout && local > clip.duration - tout.duration && tout.duration > 0) {
    const p = Math.max(0, Math.min(1, (clip.duration - local) / tout.duration));
    transitionAlpha = Math.min(transitionAlpha, p);
    if (tout.kind === "slide" || tout.kind === "wipe") transitionX = (1 - p) * designW * 0.5;
    if (tout.kind === "zoom") transitionScale = 0.5 + 0.5 * p;
    if (tout.kind === "blur") transitionBlur = (1 - p) * 12;
  }
  const vf = clip.fadeIn ?? 0;
  const vo = clip.fadeOut ?? 0;
  let videoFade = 1;
  if (vf > 0 && local < vf) videoFade = Math.min(videoFade, local / vf);
  if (vo > 0 && local > clip.duration - vo) videoFade = Math.min(videoFade, (clip.duration - local) / vo);

  const filter = [clipCssFilter(clip), transitionBlur ? `blur(${transitionBlur}px)` : ""]
    .filter(Boolean).join(" ");
  const vignette = clipVignette(clip) ? (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)" }}
    />
  ) : null;

  const transform = `translate(calc(-50% + ${x + transitionX}px), calc(-50% + ${y}px)) rotate(${rotation}deg) scale(${scale * transitionScale})`;
  const clipPath = (crop.top || crop.right || crop.bottom || crop.left)
    ? `inset(${crop.top}px ${crop.right}px ${crop.bottom}px ${crop.left}px)`
    : undefined;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: designW / 2,
    top: designH / 2,
    transform,
    transformOrigin: "center",
    opacity: opacity * transitionAlpha * videoFade,
    filter: filter || undefined,
    clipPath,
    mixBlendMode: clip.blendMode && clip.blendMode !== "normal" ? clip.blendMode : undefined,
    pointerEvents: "none",
  };

  if (clip.text) {
    return (
      <div style={baseStyle}>
        <TextView
          style={clip.text}
          local={local}
          duration={clip.duration}
          designW={designW}
        />
      </div>
    );
  }

  if (!asset) return null;

  if (asset.type === "image") {
    return (
      <div style={{ ...baseStyle, width: baseW, height: baseH }}>
        <img
          src={convertFileSrc(asset.path)}
          alt={clip.name}
          draggable={false}
          style={{
            width: "100%", height: "100%", objectFit: "contain",
            transform: `${clip.flipH ? "scaleX(-1) " : ""}${clip.flipV ? "scaleY(-1)" : ""}`.trim() || undefined,
          }}
        />
        {vignette}
      </div>
    );
  }

  if (asset.type === "video") {
    const settings = useProjectStore.getState().project.settings;
    const useProxy = settings.proxyEnabled !== false
      && (settings.previewQuality === "low" || settings.previewQuality === "medium");
    return (
      <div style={{ ...baseStyle, width: baseW, height: baseH }}>
        <video
          ref={registerRef}
          src={previewSource(asset, useProxy)}
          onError={(e) => {
            // A proxy can be evicted from the cache; fall back to the original.
            if (useProxy && asset.proxyPath && e.currentTarget.dataset.proxyFallback !== "1") {
              e.currentTarget.dataset.proxyFallback = "1";
              e.currentTarget.src = convertFileSrc(asset.path);
            }
          }}
          preload={settings.previewQuality === "low" ? "metadata" : "auto"}
          playsInline
          style={{
            width: "100%", height: "100%", objectFit: "contain",
            transform: `${clip.flipH ? "scaleX(-1) " : ""}${clip.flipV ? "scaleY(-1)" : ""}`.trim() || undefined,
          }}
        />
        {vignette}
      </div>
    );
  }

  // Audio-only assets do not render a picture.
  return null;
}

function TextView({ style, local, duration, designW }: {
  style: TextStyle;
  local: number;
  duration: number;
  designW: number;
}) {
  let alpha = 1;
  let dx = 0;
  let scale = 1;
  const ad = Math.max(0.01, style.animationDuration);
  switch (style.animation) {
    case "fadeIn": alpha = Math.min(1, local / ad); break;
    case "fadeOut": alpha = Math.min(1, (duration - local) / ad); break;
    case "slideIn": dx = -(1 - Math.min(1, local / ad)) * designW * 0.25; alpha = Math.min(1, local / ad); break;
    case "slideOut": dx = (1 - Math.min(1, (duration - local) / ad)) * designW * 0.25; alpha = Math.min(1, (duration - local) / ad); break;
    case "zoomIn": scale = 0.4 + 0.6 * Math.min(1, local / ad); alpha = Math.min(1, local / ad); break;
    case "zoomOut": scale = 1.6 - 0.6 * Math.min(1, (duration - local) / ad); alpha = Math.min(1, (duration - local) / ad); break;
    case "typewriter": break;
    default: break;
  }
  let text = style.text;
  if (style.animation === "typewriter") {
    const chars = Math.floor((local / ad) * text.length);
    text = text.slice(0, Math.max(0, chars));
  }

  return (
    <div
      style={{
        width: designW * 0.9,
        transform: `translateX(${dx}px) scale(${scale})`,
        opacity: alpha,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        textAlign: style.align,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineSpacing,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: style.background ? style.backgroundPadding : 0,
        background: style.background ? style.backgroundColor : undefined,
        borderRadius: style.background ? 12 : undefined,
        WebkitTextStroke: style.outlineWidth ? `${style.outlineWidth}px ${style.outlineColor}` : undefined,
        textShadow: style.shadow ? `${style.shadowColor} 0 ${style.shadowBlur}px ${style.shadowBlur}px` : undefined,
      }}
    >
      {text}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}
