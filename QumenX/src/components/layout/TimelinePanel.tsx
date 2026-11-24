import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Volume2, VolumeX, Eye, EyeOff, Lock, Unlock, Trash2, ChevronUp, ChevronDown,
  Plus, Minus, Magnet, AudioLines, Type, Film, Diamond, Scissors, Copy, Grid3X3,
  Link2, X, PanelBottom, MapPin, Maximize2, Palette,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/input";
import { IconButton } from "@/components/ui/primitives";
import { ffmpeg } from "@/lib/ffmpeg";
import { formatDuration } from "@/components/media/AssetCard";
import { snapTimeToFrame, type Clip, type Track, type Asset, type TrackType, type KeyframeProperty } from "@/types/project";

const waveformCache = new Map<string, number[]>();
const KEYFRAME_PROPERTIES: Array<{ value: KeyframeProperty; label: string }> = [
  { value: "positionX", label: "Pos X" },
  { value: "positionY", label: "Pos Y" },
  { value: "scale", label: "Scale" },
  { value: "rotation", label: "Rotate" },
  { value: "opacity", label: "Opacity" },
  { value: "volume", label: "Volume" },
  { value: "cropTop", label: "Crop T" },
  { value: "cropRight", label: "Crop R" },
  { value: "cropBottom", label: "Crop B" },
  { value: "cropLeft", label: "Crop L" },
];
const COLOR_LABELS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Red", value: "#ef4444" },
  { label: "Purple", value: "#a855f7" },
];
const ZOOM_PRESETS = [25, 50, 100, 200, 400];

export function TimelinePanel({ onAddAsset }: { onAddAsset: (asset: Asset) => void }) {
  void onAddAsset;
  const project = useProjectStore((s) => s.project);
  const { tracks, clips } = project;
  // Subscribe only to fields the timeline chrome uses. Playhead time changes
  // every animation frame, so it is intentionally excluded and rendered by an
  // isolated component below.
  const tl = useTimelineStore(useShallow((s) => ({
    zoom: s.zoom,
    scrollLeft: s.scrollLeft,
    snapToGrid: s.snapToGrid,
    snapToClip: s.snapToClip,
    snapToPlayhead: s.snapToPlayhead,
    snapToFrames: s.snapToFrames,
    showWaveforms: s.showWaveforms,
    showKeyframes: s.showKeyframes,
    keyframeFilter: s.keyframeFilter,
    selectedClipId: s.selectedClipId,
    selectedClipIds: s.selectedClipIds,
    setZoom: s.setZoom,
    setScrollLeft: s.setScrollLeft,
    setPlayheadTime: s.setPlayheadTime,
    setSelectedClip: s.setSelectedClip,
    setSelectedClips: s.setSelectedClips,
    setKeyframeFilter: s.setKeyframeFilter,
    toggleSnapToGrid: s.toggleSnapToGrid,
    toggleSnapToClip: s.toggleSnapToClip,
    toggleSnapToPlayhead: s.toggleSnapToPlayhead,
    toggleSnapToFrames: s.toggleSnapToFrames,
    toggleWaveforms: s.toggleWaveforms,
    toggleKeyframes: s.toggleKeyframes,
    snapTime: s.snapTime,
  })));
  const setCurrentTime = usePreviewStore((s) => s.setCurrentTime);
  const assets = useMediaStore((s) => s.assets);
  const assetsById = React.useMemo(() => {
    const map: Record<string, Asset> = {};
    assets.forEach((a) => { map[a.id] = a; });
    return map;
  }, [assets]);

  const tracksSorted = React.useMemo(
    () => [...tracks].sort((a, b) => a.order - b.order),
    [tracks]
  );
  const trackOffsets = React.useMemo(() => tracksSorted.reduce<Array<{ track: Track; top: number; height: number }>>((rows, track) => {
    const previous = rows[rows.length - 1];
    const top = previous ? previous.top + previous.height : 0;
    rows.push({ track, top, height: track.height || 64 });
    return rows;
  }, []), [tracksSorted]);
  const totalTracksHeight = trackOffsets.reduce((sum, r) => sum + r.height, 0) + 24;

  const clipsByTrack = React.useMemo(() => {
    const map: Record<string, Clip[]> = {};
    tracksSorted.forEach((t) => { map[t.id] = []; });
    clips.forEach((c) => { (map[c.trackId] ??= []).push(c); });
    return map;
  }, [clips, tracksSorted]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const labelsRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const toggleTimeline = useWorkspaceStore((s) => s.toggleTimeline);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; clipId: string } | null>(null);

  const dragCleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => dragCleanup.current?.(), []);
  const listenWhileDragging = (move: (ev: MouseEvent) => void) => {
    dragCleanup.current?.();
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      dragCleanup.current = null;
    };
    dragCleanup.current = up;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  React.useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextMenu]);

  const maxEnd = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 30);
  const containerWidth = Math.max(1000, maxEnd * tl.zoom + 400);

  React.useEffect(() => {
    if (scrollRef.current && scrollRef.current.scrollLeft !== tl.scrollLeft) {
      scrollRef.current.scrollLeft = tl.scrollLeft;
    }
  }, [tl.scrollLeft]);

  React.useEffect(() => {
    useTimelineStore.getState().setFps(project.settings.fps || 30);
  }, [project.settings.fps]);

  const seekFromRuler = (clientX: number, rect: DOMRect) => {
    const t = snapTimeToFrame(Math.max(0, (clientX - rect.left) / tl.zoom), project.settings.fps || 30);
    tl.setPlayheadTime(t);
    setCurrentTime(t);
  };

  const selectClip = (clipId: string, additive: boolean) => {
    if (!additive) {
      tl.setSelectedClip(clipId);
      return;
    }
    const ids = tl.selectedClipIds.includes(clipId)
      ? tl.selectedClipIds.filter((id) => id !== clipId)
      : [...tl.selectedClipIds, clipId];
    tl.setSelectedClips(ids);
  };

  const startTrackResize = (e: React.MouseEvent, trackId: string, currentHeight: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    let pushed = false;
    const move = (ev: MouseEvent) => {
      const height = Math.max(32, Math.min(240, currentHeight + ev.clientY - startY));
      if (height === currentHeight) return;
      if (!pushed) {
        pushed = true;
        useProjectStore.getState().pushHistory("Resize track");
      }
      useProjectStore.getState().updateTrackLive(trackId, { height });
    };
    listenWhileDragging(move);
  };

  const selectedClip = clips.find((c) => c.id === tl.selectedClipId);
  const performTool = (tool: "split" | "duplicate" | "delete" | "rippleDelete") => {
    if (!selectedClip) return;
    const store = useProjectStore.getState();
    if (tool === "split") store.splitClip(selectedClip.id, usePreviewStore.getState().currentTime);
    if (tool === "duplicate") store.duplicateClip(selectedClip.id);
    if (tool === "delete") {
      store.removeClip(selectedClip.id);
      tl.setSelectedClip(null);
    }
    if (tool === "rippleDelete") {
      const ids = tl.selectedClipIds.length > 1 ? tl.selectedClipIds : [selectedClip.id];
      store.rippleDelete(ids);
      tl.setSelectedClip(null);
    }
  };

  const fitToProject = () => {
    const available = Math.max(240, (scrollRef.current?.clientWidth ?? 800) - 48);
    tl.setZoom(available / Math.max(1, maxEnd));
    tl.setScrollLeft(0);
  };

  const addMarkerAtPlayhead = () => {
    useProjectStore.getState().addMarker(usePreviewStore.getState().currentTime);
  };

  const contextClip = contextMenu ? clips.find((c) => c.id === contextMenu.clipId) ?? null : null;
  const contextTrack = contextClip ? tracks.find((t) => t.id === contextClip.trackId) : null;
  const contextLocked = Boolean(contextTrack?.locked);
  const playhead = usePreviewStore.getState().currentTime;
  const fps = project.settings.fps || 30;
  const canTrimStart = !!contextClip
    && playhead > contextClip.start + 1 / fps
    && playhead <= contextClip.start + contextClip.duration;
  const canTrimEnd = !!contextClip
    && playhead >= contextClip.start
    && playhead < contextClip.start + contextClip.duration - 1 / fps;

  const runContextAction = (
    action: "split" | "duplicate" | "delete" | "rippleDelete" | "rippleTrimStart"
      | "rippleTrimEnd" | "closeGaps" | "group" | "ungroup"
  ) => {
    if (!contextClip || contextLocked) return;
    const store = useProjectStore.getState();
    if (action === "split") store.splitClip(contextClip.id, playhead);
    if (action === "duplicate") store.duplicateClip(contextClip.id);
    if (action === "delete") {
      store.removeClip(contextClip.id);
      tl.setSelectedClip(null);
    }
    if (action === "rippleDelete") {
      const ids = tl.selectedClipIds.includes(contextClip.id) ? tl.selectedClipIds : [contextClip.id];
      store.rippleDelete(ids);
      tl.setSelectedClip(null);
    }
    if (action === "rippleTrimStart") store.rippleTrim(contextClip.id, "left", playhead);
    if (action === "rippleTrimEnd") store.rippleTrim(contextClip.id, "right", playhead);
    if (action === "closeGaps") store.closeGaps(contextClip.trackId);
    if (action === "group") { store.groupClips(tl.selectedClipIds); }
    if (action === "ungroup") { store.ungroupClips(tl.selectedClipIds.includes(contextClip.id) ? tl.selectedClipIds : [contextClip.id]); }
    setContextMenu(null);
  };

  const trackAtY = (clientY: number): Track | null => {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const y = clientY - rect.top;
    for (const row of trackOffsets) {
      if (y >= row.top && y < row.top + row.height) return row.track;
    }
    return null;
  };

  const addTrack = (type: TrackType) => {
    const count = project.tracks.filter((t) => t.type === type).length + 1;
    const names: Record<TrackType, string> = {
      video: "Video", audio: "Audio", text: "Text", overlay: "Overlay", image: "Image",
    };
    useProjectStore.getState().addTrack({
      name: `${names[type]} ${count}`,
      type,
      height: type === "audio" ? 48 : type === "text" ? 44 : 64,
    });
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden border-t"
      style={{ borderColor: "var(--qx-border)", background: "var(--qx-bg)" }}>
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b px-3"
        style={{ borderColor: "var(--qx-border)", background: "rgba(16,19,25,.92)" }}>
        <span className="qx-section-label mr-1">Timeline</span>

        <div className="flex items-center gap-0.5 rounded-md border p-0.5" style={{ borderColor: "var(--qx-border)" }}>
          <IconButton tooltip="Zoom out" onClick={() => tl.setZoom(tl.zoom / 1.4)} className="!h-6 !w-6">
            <Minus className="h-3 w-3" />
          </IconButton>
          <span className="w-12 text-center text-[10px] tabular-nums text-editor-textMuted">{Math.round(tl.zoom)}px/s</span>
          <IconButton tooltip="Zoom in" onClick={() => tl.setZoom(tl.zoom * 1.4)} className="!h-6 !w-6">
            <Plus className="h-3 w-3" />
          </IconButton>
        </div>

        <div className="hidden items-center gap-0.5 lg:flex">
          {ZOOM_PRESETS.map((z) => (
            <button key={z} type="button" onClick={() => tl.setZoom(z)}
              className="rounded px-1.5 py-0.5 text-[9px] tabular-nums text-editor-textMuted hover:bg-editor-surfaceHover hover:text-editor-text"
              style={{ color: Math.round(tl.zoom) === z ? "var(--qx-accent)" : undefined }}>
              {z}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          <IconButton tooltip="Snap to clips" active={tl.snapToClip} onClick={tl.toggleSnapToClip} className="!h-7 !w-7">
            <Magnet className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Snap to playhead" active={tl.snapToPlayhead} onClick={tl.toggleSnapToPlayhead} className="!h-7 !w-7">
            <span className="text-[10px] font-semibold">▶|</span>
          </IconButton>
          <IconButton tooltip="Snap to grid" active={tl.snapToGrid} onClick={tl.toggleSnapToGrid} className="!h-7 !w-7">
            <Grid3X3 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Snap to frames" active={tl.snapToFrames} onClick={tl.toggleSnapToFrames} className="!h-7 !w-7">
            <span className="text-[10px] font-semibold">F</span>
          </IconButton>
          <IconButton tooltip="Show waveforms" active={tl.showWaveforms} onClick={tl.toggleWaveforms} className="!h-7 !w-7">
            <AudioLines className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Show keyframes" active={tl.showKeyframes} onClick={tl.toggleKeyframes} className="!h-7 !w-7">
            <Diamond className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Fit project to timeline" onClick={fitToProject} className="!h-7 !w-7">
            <Maximize2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        {tl.showKeyframes ? (
          <select
            value={tl.keyframeFilter}
            onChange={(e) => tl.setKeyframeFilter(e.currentTarget.value as KeyframeProperty | "all")}
            title="Keyframe property filter"
            className="qx-input h-6 w-24 px-1 text-[10px]"
          >
            <option value="all">All keys</option>
            {KEYFRAME_PROPERTIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        ) : null}

        <Separator className="mx-1 h-4" />

        <div className="flex items-center gap-0.5">
          <IconButton tooltip="Split at playhead (S)" onClick={() => performTool("split")} disabled={!selectedClip} className="!h-7 !w-7">
            <Scissors className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Duplicate clip (D)" onClick={() => performTool("duplicate")} disabled={!selectedClip} className="!h-7 !w-7">
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Delete clip (Del)" onClick={() => performTool("delete")} disabled={!selectedClip} className="!h-7 !w-7 hover:!text-[var(--qx-danger)]">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Ripple delete selected (Shift+Del)" onClick={() => performTool("rippleDelete")} disabled={!selectedClip} className="!h-7 !w-7 hover:!text-[var(--qx-danger)]">
            <span className="text-[10px] font-bold">R</span>
          </IconButton>
          <IconButton tooltip="Close gaps on unlocked tracks" onClick={() => useProjectStore.getState().closeGaps()} className="!h-7 !w-7">
            <span className="text-[13px] leading-none">⇤</span>
          </IconButton>
          <IconButton tooltip="Add marker at playhead (M)" onClick={addMarkerAtPlayhead} className="!h-7 !w-7">
            <MapPin className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <IconButton tooltip="Add video track" onClick={() => addTrack("video")} className="!h-7 !w-7">
            <Film className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Add audio track" onClick={() => addTrack("audio")} className="!h-7 !w-7">
            <AudioLines className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton tooltip="Add text track" onClick={() => addTrack("text")} className="!h-7 !w-7">
            <Type className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <IconButton tooltip="Hide timeline" onClick={toggleTimeline} className="!h-7 !w-7">
          <PanelBottom className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Track headers */}
        <div className="flex w-44 shrink-0 flex-col border-r"
          style={{ borderColor: "var(--qx-border)", background: "rgba(16,19,25,.85)" }}>
          <div className="flex h-9 shrink-0 items-center justify-between border-b px-3"
            style={{ borderColor: "var(--qx-border)" }}>
            <span className="qx-section-label">Tracks</span>
            <span className="text-[10px] tabular-nums text-editor-textMuted">{tracks.length}</span>
          </div>
          <div className="qx-scroll min-h-0 flex-1 overflow-hidden" ref={labelsRef} onScroll={(e) => {
            if (scrollRef.current) scrollRef.current.scrollTop = e.currentTarget.scrollTop;
          }}>
            <div style={{ height: totalTracksHeight }}>
              {trackOffsets.map(({ track, height }) => (
                <TrackHeader key={track.id} track={track} height={height} tracks={tracksSorted} onResizeStart={startTrackResize} />
              ))}
            </div>
          </div>
        </div>

        {/* Ruler + clips */}
        <div
          className="qx-scroll min-w-0 flex-1 overflow-auto"
          ref={scrollRef}
          onScroll={(e) => {
            tl.setScrollLeft(e.currentTarget.scrollLeft);
            if (labelsRef.current) labelsRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div style={{ width: containerWidth, minHeight: "100%", position: "relative" }}>
            <div
              className="sticky top-0 z-20 h-9 cursor-crosshair border-b"
              style={{
                borderColor: "var(--qx-border)",
                background: "rgba(16,19,25,.96)",
                backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px)",
                backgroundSize: `${tl.zoom}px 100%`,
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                seekFromRuler(e.clientX, rect);
                listenWhileDragging((ev: MouseEvent) => seekFromRuler(ev.clientX, rect));
              }}
            >
              <div className="relative h-full">
                {Array.from({ length: Math.ceil(containerWidth / (5 * tl.zoom)) + 1 }).map((_, i) => (
                  <div key={i} className="absolute top-0 h-full" style={{ left: i * 5 * tl.zoom }}>
                    <div className="h-3 w-px" style={{ background: "var(--qx-border-strong)" }} />
                    <span className="-mt-0.5 block pl-1 text-[9px] tabular-nums text-editor-textMuted">{formatDuration(i * 5)}</span>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <div key={j} className="absolute top-0 h-1.5 w-px opacity-60" style={{ left: (j + 1) * tl.zoom, background: "var(--qx-border)" }} />
                    ))}
                  </div>
                ))}
                {project.markers.map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    className="absolute bottom-0.5 z-30 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-black/60 shadow hover:scale-125"
                    style={{ left: marker.time * tl.zoom, background: marker.color }}
                    title={`${marker.label} @ ${marker.time.toFixed(2)}s — click to seek, double-click to rename, right-click to delete`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      tl.setPlayheadTime(marker.time);
                      setCurrentTime(marker.time);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const next = window.prompt("Marker name", marker.label);
                      if (next !== null && next.trim()) {
                        useProjectStore.getState().updateMarker(marker.id, { label: next.trim() });
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      useProjectStore.getState().removeMarker(marker.id);
                    }}
                  />
                ))}
              </div>
            </div>

            <div ref={bodyRef} style={{ height: totalTracksHeight, position: "relative" }}>
              {trackOffsets.map(({ track, top, height }) => (
                <div
                  key={track.id}
                  className="absolute left-0 right-0 border-b"
                  style={{ top, height, borderColor: "rgba(36,42,53,.6)" }}
                >
                  {(clipsByTrack[track.id] ?? []).map((clip) => (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      asset={assetsById[clip.assetId]}
                      zoom={tl.zoom}
                      isSelected={tl.selectedClipId === clip.id}
                      showKeyframes={tl.showKeyframes}
                      keyframeFilter={tl.keyframeFilter}
                      showWaveforms={tl.showWaveforms && track.type === "audio"}
                      locked={track.locked}
                      selectedIds={tl.selectedClipIds}
                      allClips={clips}
                      onSelect={(e) => selectClip(clip.id, e.ctrlKey || e.metaKey)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectClip(clip.id, false);
                        setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id });
                      }}
                      onPreview={(patch) => useProjectStore.getState().updateClipLive(clip.id, patch)}
                      onBeginTransaction={() => useProjectStore.getState().pushHistory("Move/trim clip")}
                      snapTime={(t, excludeClipId) => tl.snapTime(t, excludeClipId ?? clip.id, clips)}
                      trackAtY={trackAtY}
                      fps={project.settings.fps || 30}
                    />
                  ))}
                  {track.locked ? (
                    <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.025)_8px,rgba(255,255,255,0.025)_16px)]" />
                  ) : null}
                </div>
              ))}

              {clips.length === 0 ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="text-[11px] text-editor-textMuted">
                    Add media to the timeline, or right-click a clip for quick actions.
                  </p>
                </div>
              ) : null}

              {/* Playhead is isolated so per-frame clock updates do not re-render all clips. */}
              <Playhead height={totalTracksHeight} />
            </div>
          </div>
        </div>
      </div>

      {contextMenu && contextClip ? (
        <>
          <div className="fixed inset-0 z-[75]" onMouseDown={() => setContextMenu(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="qx-menu fixed z-[76] w-60 animate-qx-scale-in py-1"
            style={{
              left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 250)),
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 360)),
            }}>
            <div className="truncate border-b px-3 pb-2 pt-1 text-[10px] text-editor-textMuted"
              style={{ borderColor: "var(--qx-border)" }} title={contextClip.name}>
              {contextClip.name || "Clip"}
            </div>
            <div className="pt-1">
              <ContextAction icon={<Scissors className="h-3.5 w-3.5" />} label="Split at playhead" shortcut="S"
                disabled={contextLocked} onClick={() => runContextAction("split")} />
              <ContextAction icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate" shortcut="D"
                disabled={contextLocked} onClick={() => runContextAction("duplicate")} />
              <ContextAction icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" shortcut="Del"
                disabled={contextLocked} onClick={() => runContextAction("delete")} />
              <ContextAction icon={<span className="text-[10px] font-bold">R</span>} label="Ripple delete" shortcut="⇧Del"
                disabled={contextLocked} onClick={() => runContextAction("rippleDelete")} />
              <ContextAction icon={<span className="text-[10px] font-bold">⇤</span>} label="Ripple trim start → playhead"
                disabled={contextLocked || !canTrimStart} onClick={() => runContextAction("rippleTrimStart")} />
              <ContextAction icon={<span className="text-[10px] font-bold">⇥</span>} label="Ripple trim end → playhead"
                disabled={contextLocked || !canTrimEnd} onClick={() => runContextAction("rippleTrimEnd")} />
              <ContextAction icon={<span className="text-[10px] font-bold">⇤</span>} label="Close gaps on this track"
                disabled={contextLocked} onClick={() => runContextAction("closeGaps")} />
              <Separator className="my-1" />
              <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-editor-textMuted">
                <Palette className="h-3.5 w-3.5" /> Color label
              </div>
              <div className="flex items-center gap-1.5 px-3 pb-1.5">
                {COLOR_LABELS.map((color) => (
                  <button key={color.value} type="button" title={color.label}
                    aria-label={`${color.label} color label`}
                    onClick={() => {
                      useProjectStore.getState().setClipColor(
                        contextClip.id,
                        contextClip.colorTag === color.value ? undefined : color.value
                      );
                      setContextMenu(null);
                    }}
                    className="h-4 w-4 rounded-full border border-white/25 transition-transform hover:scale-125"
                    style={{
                      background: color.value,
                      outline: contextClip.colorTag === color.value ? `2px solid ${color.value}` : undefined,
                      outlineOffset: 2,
                    }} />
                ))}
              </div>
              <Separator className="my-1" />
              <ContextAction icon={<Link2 className="h-3.5 w-3.5" />} label="Group selected" shortcut="Ctrl+G"
                disabled={contextLocked || tl.selectedClipIds.length < 2} onClick={() => runContextAction("group")} />
              <ContextAction icon={<X className="h-3.5 w-3.5" />} label="Ungroup"
                disabled={contextLocked || !contextClip.groupId} onClick={() => runContextAction("ungroup")} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Playhead({ height }: { height: number }) {
  const time = useTimelineStore((s) => s.playheadTime);
  const zoom = useTimelineStore((s) => s.zoom);
  return (
    <div
      data-testid="timeline-playhead"
      className="pointer-events-none absolute top-0 z-30 w-0.5"
      style={{ left: time * zoom, height, background: "var(--qx-playhead)", boxShadow: "0 0 8px var(--qx-playhead)" }}
    >
      <div className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45" style={{ background: "var(--qx-playhead)" }} />
    </div>
  );
}

function ContextAction({
  icon, label, shortcut, disabled, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="qx-menu-item text-[11px]">
      <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut ? <span className="qx-kbd">{shortcut}</span> : null}
    </button>
  );
}

function TrackHeader({ track, height, tracks, onResizeStart }: {
  track: Track;
  height: number;
  tracks: Track[];
  onResizeStart: (e: React.MouseEvent, trackId: string, currentHeight: number) => void;
}) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(track.name);
  const index = tracks.findIndex((t) => t.id === track.id);
  const color = track.type === "audio" ? "text-emerald-400" : track.type === "text" ? "text-amber-300" : "text-sky-400";

  return (
    <div className="relative flex items-center gap-0.5 border-b px-2"
      style={{ height, borderColor: "rgba(36,42,53,.6)" }}>
      <span className="mr-1 h-6 w-0.5 shrink-0 rounded-full" style={{
        background: track.type === "audio" ? "#34d399" : track.type === "text" ? "#fbbf24" : "#38bdf8",
      }} />
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { updateTrack(track.id, { name: name || track.type }); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="qx-input h-6 px-1 text-[10px]"
            aria-label="Track name"
          />
        ) : (
          <button
            className={cn("w-full truncate text-left text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-editor-text", color)}
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            {track.name || track.type}
          </button>
        )}
      </div>
      <IconButton tooltip={track.visible ? "Hide track" : "Show track"} active={!track.visible}
        onClick={() => updateTrack(track.id, { visible: !track.visible })} className="!h-6 !w-6">
        {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      </IconButton>
      <IconButton tooltip={track.locked ? "Unlock track" : "Lock track"} active={track.locked}
        onClick={() => updateTrack(track.id, { locked: !track.locked })} className="!h-6 !w-6">
        {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      </IconButton>
      <IconButton tooltip={track.muted ? "Unmute track" : "Mute track"} active={track.muted}
        onClick={() => updateTrack(track.id, { muted: !track.muted })} className="!h-6 !w-6">
        {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      </IconButton>
      <IconButton tooltip="Move up" disabled={index <= 0} onClick={() => reorderTrack(track.id, index - 1)} className="!h-6 !w-6">
        <ChevronUp className="h-3 w-3" />
      </IconButton>
      <IconButton tooltip="Move down" disabled={index >= tracks.length - 1} onClick={() => reorderTrack(track.id, index + 1)} className="!h-6 !w-6">
        <ChevronDown className="h-3 w-3" />
      </IconButton>
      <IconButton tooltip="Delete track" onClick={() => removeTrack(track.id)} className="!h-6 !w-6 hover:!text-[var(--qx-danger)]">
        <Trash2 className="h-3 w-3" />
      </IconButton>
      <div
        title="Drag to resize track"
        onMouseDown={(e) => onResizeStart(e, track.id, height)}
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-[var(--qx-accent)] hover:opacity-60"
      />
    </div>
  );
}

interface ClipBlockProps {
  clip: Clip;
  asset?: Asset;
  zoom: number;
  isSelected: boolean;
  showKeyframes: boolean;
  keyframeFilter: string;
  showWaveforms: boolean;
  locked: boolean;
  selectedIds: string[];
  allClips: Clip[];
  onSelect: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPreview: (patch: Partial<Clip>) => void;
  onBeginTransaction: () => void;
  snapTime: (t: number, excludeClipId?: string) => number;
  trackAtY: (clientY: number) => Track | null;
  fps: number;
}

function ClipBlock({
  clip, asset, zoom, isSelected, showKeyframes, keyframeFilter, showWaveforms, locked,
  selectedIds, allClips, onSelect, onContextMenu, onPreview, onBeginTransaction, snapTime, trackAtY, fps,
}: ClipBlockProps) {
  const dragCleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => dragCleanup.current?.(), []);
  const listenWhileDragging = (move: (ev: MouseEvent) => void) => {
    dragCleanup.current?.();
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      dragCleanup.current = null;
    };
    dragCleanup.current = up;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const palette = clip.text
    ? { top: "#f59e0b", bottom: "#92400e" }
    : asset?.type === "audio"
      ? { top: "#10b981", bottom: "#065f46" }
      : asset?.type === "image"
        ? { top: "#d946ef", bottom: "#86198f" }
        : { top: "#3b82f6", bottom: "#1e40af" };
  const [waveform, setWaveform] = React.useState<number[] | null>(() => {
    if (!showWaveforms || !asset || asset.type !== "audio") return null;
    const cached = waveformCache.get(asset.id) ?? asset.waveform;
    if (cached && cached.length > 0) {
      waveformCache.set(asset.id, cached);
      return cached;
    }
    return null;
  });

  React.useEffect(() => {
    if (!showWaveforms || !asset || asset.type !== "audio" || waveform) return;
    let cancelled = false;
    ffmpeg.waveform(asset.path, 96).then((peaks) => {
      if (!cancelled && peaks.length > 0) {
        waveformCache.set(asset.id, peaks);
        setWaveform(peaks);
        useMediaStore.getState().updateAsset(asset.id, { waveform: peaks });
      }
    }).catch(() => { /* waveform is best-effort */ });
    return () => { cancelled = true; };
  }, [asset, showWaveforms, waveform]);

  // One SVG path instead of one <rect> per bucket keeps long audio tracks cheap.
  const waveformPath = React.useMemo(() => {
    if (!waveform || waveform.length === 0) return "";
    return waveform
      .map((v, i) => `M${i} ${(50 - v * 48).toFixed(1)}V${(50 + v * 48).toFixed(1)}`)
      .join(" ");
  }, [waveform]);

  const startDrag = (e: React.MouseEvent, mode: "move" | "left" | "right") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(e);
    if (locked) return;
    e.preventDefault();
    const startX = e.clientX;
    const origStart = clip.start;
    const origDuration = clip.duration;
    const origOffset = clip.sourceOffset;
    const speedAbs = Math.max(0.01, Math.abs(clip.speed || 1));
    let pushed = false;
    // Selecting a clip is not an edit; only push history once it really moves.
    const ensureHistory = () => {
      if (pushed) return;
      pushed = true;
      onBeginTransaction();
    };

    // Ctrl/Cmd multi-selection moves together; otherwise a group moves as one.
    const moveIds = selectedIds.includes(clip.id)
      ? selectedIds.filter((id) => allClips.some((c) => c.id === id))
      : clip.groupId
        ? allClips.filter((c) => c.groupId === clip.groupId).map((c) => c.id)
        : [clip.id];

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      if (mode === "move") {
        const target = trackAtY(ev.clientY);
        const updates = moveIds.map((id) => {
          const source = allClips.find((c) => c.id === id) ?? clip;
          const nextStart = snapTime(Math.max(0, source.start + dx), clip.id);
          return {
            id,
            patch: {
              start: nextStart,
              ...(target && target.id !== source.trackId ? { trackId: target.id } : {}),
            },
          };
        });
        const changed = updates.some(({ id, patch }) => {
          const source = allClips.find((c) => c.id === id) ?? clip;
          return patch.start !== source.start
            || (patch.trackId !== undefined && patch.trackId !== source.trackId);
        });
        if (!changed) return;
        ensureHistory();
        useProjectStore.getState().updateClipsLive(updates);
      } else if (mode === "right") {
        const maxBySource = asset?.duration
          ? Math.max(0, (asset.duration - origOffset) / speedAbs)
          : origDuration + dx;
        const nextDuration = Math.max(1 / fps, Math.min(origDuration + dx, maxBySource));
        const patchedDuration = snapTime(origStart + nextDuration, clip.id) - origStart;
        if (Math.abs(patchedDuration - origDuration) < 1e-6) return;
        ensureHistory();
        onPreview({ duration: patchedDuration });
      } else {
        const nextStart = snapTime(Math.max(0, Math.min(origStart + dx, origStart + origDuration - 1 / fps)), clip.id);
        if (nextStart === origStart) return;
        const delta = nextStart - origStart;
        ensureHistory();
        onPreview({
          start: nextStart,
          duration: Math.max(1 / fps, origDuration - delta),
          sourceOffset: Math.max(0, origOffset + delta * speedAbs),
        });
      }
    };
    listenWhileDragging(onMove);
  };

  const startKeyframeDrag = (e: React.MouseEvent, keyframeId: string, originalTime: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (locked) return;
    const startX = e.clientX;
    let pushed = false;
    const onMove = (ev: MouseEvent) => {
      const raw = originalTime + (ev.clientX - startX) / zoom;
      const time = snapTimeToFrame(Math.max(0, Math.min(clip.duration, raw)), fps);
      if (time === originalTime) return;
      if (!pushed) {
        pushed = true;
        useProjectStore.getState().pushHistory("Move keyframe");
      }
      useProjectStore.getState().updateKeyframeLive(clip.id, keyframeId, { time });
    };
    listenWhileDragging(onMove);
  };

  const width = Math.max(24, clip.duration * zoom);
  const left = clip.start * zoom;

  return (
    <div
      className={cn(
        "group absolute top-1.5 h-[calc(100%-12px)] cursor-grab select-none overflow-hidden rounded-md border active:cursor-grabbing",
        isSelected && "z-10"
      )}
      style={{
        left,
        width,
        background: `linear-gradient(180deg, ${clip.colorTag ?? palette.top}cc 0%, ${palette.bottom}bb 100%)`,
        borderColor: isSelected ? "var(--qx-accent)" : clip.colorTag ?? "rgba(255,255,255,.12)",
        boxShadow: isSelected
          ? "0 0 0 2px var(--qx-accent), 0 8px 20px rgba(0,0,0,.38)"
          : "0 2px 7px rgba(0,0,0,.32)",
        opacity: locked ? 0.72 : 1,
      }}
      onMouseDown={(e) => startDrag(e, "move")}
      onContextMenu={onContextMenu}
      title={`${clip.name} — ${formatDuration(clip.duration)}`}
    >
      {waveformPath ? (
        <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none" viewBox={`0 0 ${waveform!.length} 100`}>
          <path d={waveformPath} stroke="#d1fae5" strokeWidth="0.8" fill="none" />
        </svg>
      ) : null}
      <div className="pointer-events-none relative flex h-full items-start justify-between px-1.5 pt-0.5">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold text-white">{clip.name || asset?.name || "Clip"}</div>
          <div className="text-[9px] tabular-nums text-white/70">{formatDuration(clip.duration)}</div>
        </div>
        {clip.muted ? <VolumeX className="h-3 w-3 text-white/70" /> : null}
      </div>
      {showKeyframes && clip.keyframes.length > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 h-3">
          {clip.keyframes
            .filter((k) => keyframeFilter === "all" || k.property === keyframeFilter)
            .map((k) => (
              <div
                key={k.id}
                title={`${k.property} @ ${k.time.toFixed(2)}s — drag to retime`}
                onMouseDown={(e) => startKeyframeDrag(e, k.id, k.time)}
                className="absolute bottom-0.5 h-2 w-2 rotate-45 cursor-ew-resize border bg-[var(--qx-warning)] hover:bg-white"
                style={{
                  left: `${Math.min(100, (k.time / Math.max(clip.duration, 0.001)) * 100)}%`,
                  borderColor: "rgba(0,0,0,.45)",
                }}
              />
            ))}
        </div>
      ) : null}
      <div className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/20"
        onMouseDown={(e) => startDrag(e, "left")} />
      <div className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/20"
        onMouseDown={(e) => startDrag(e, "right")} />
    </div>
  );
}
