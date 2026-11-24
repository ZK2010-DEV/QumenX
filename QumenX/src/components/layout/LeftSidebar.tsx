import * as React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Film, Music, Type, Smile, Zap, Link2, SlidersHorizontal, Layout,
  Box, Plus, Search, Grid2X2, List, Upload, Folder, Clock, Maximize2,
  Sparkles, Gauge, Circle, Square, Triangle, ArrowRight, Info,
} from "lucide-react";
import { useMediaStore } from "@/stores/mediaStore";
import { useProjectStore } from "@/stores/projectStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useWorkspaceStore, type NavSection } from "@/stores/workspaceStore";
import {
  type Asset, type EffectKind, type TextStyle, type TransitionKind,
  DEFAULT_TEXT, ASPECT_RATIOS, RESOLUTIONS, FRAME_RATES,
} from "@/types/project";
import { cn } from "@/lib/utils";
import { ffmpeg } from "@/lib/ffmpeg";
import { importMediaPaths } from "@/lib/mediaImport";
import { Button } from "@/components/ui/button";
import { Input, Badge } from "@/components/ui/input";
import { Select } from "@/components/ui/tabs";
import { Switch, Slider } from "@/components/ui/scrollarea";
import { Field, IconButton, Segmented, EmptyState } from "@/components/ui/primitives";
import { AssetCard, AssetListRow, formatDuration } from "@/components/media/AssetCard";

const sections: Array<{ id: NavSection; label: string; icon: React.ElementType }> = [
  { id: "media", label: "Media", icon: Film },
  { id: "audio", label: "Audio", icon: Music },
  { id: "text", label: "Text", icon: Type },
  { id: "stickers", label: "Stickers", icon: Smile },
  { id: "effects", label: "Effects", icon: Zap },
  { id: "transitions", label: "Transitions", icon: Link2 },
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "speed", label: "Speed", icon: Gauge },
  { id: "templates", label: "Templates", icon: Layout },
  { id: "elements", label: "Elements", icon: Box },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
];

const TEXT_PRESETS: Array<{ label: string; style: Partial<TextStyle> }> = [
  { label: "Heading", style: { fontSize: 84, fontWeight: 700, text: "Your heading" } },
  { label: "Subtitle", style: { fontSize: 44, color: "#d1d5db", text: "Subtitle" } },
  { label: "Caption", style: { fontSize: 34, background: true, backgroundColor: "#000000", text: "Caption" } },
  { label: "Outline", style: { fontSize: 72, outlineWidth: 3, outlineColor: "#000000", text: "Outline" } },
  { label: "Neon glow", style: { fontSize: 76, color: "#38bdf8", shadow: true, shadowColor: "#38bdf8", text: "Glow" } },
];

const STICKERS = ["⭐", "🔥", "❤️", "👍", "🎉", "💯", "✨", "😂", "🚀", "⚡", "🎯", "🌈", "💎", "☀️", "🎵", "🏆"];

const ELEMENTS = [
  { label: "Circle", glyph: "●", icon: Circle },
  { label: "Square", glyph: "■", icon: Square },
  { label: "Triangle", glyph: "▲", icon: Triangle },
  { label: "Arrow", glyph: "→", icon: ArrowRight },
  { label: "Star", glyph: "★", icon: Sparkles },
  { label: "Sparkle", glyph: "✦", icon: Sparkles },
];

const EFFECT_OPTIONS: Array<{ kind: EffectKind; label: string; value: number }> = [
  { kind: "brightness", label: "Brightness", value: 0.2 },
  { kind: "contrast", label: "Contrast", value: 0.2 },
  { kind: "saturation", label: "Saturation", value: 0.3 },
  { kind: "exposure", label: "Exposure", value: 0.2 },
  { kind: "temperature", label: "Warmth", value: 0.3 },
  { kind: "tint", label: "Tint", value: 0.2 },
  { kind: "sharpness", label: "Sharpen", value: 0.5 },
  { kind: "blur", label: "Blur", value: 0.4 },
  { kind: "vignette", label: "Vignette", value: 1 },
  { kind: "grayscale", label: "Grayscale", value: 1 },
  { kind: "sepia", label: "Sepia", value: 0.7 },
];

const TRANSITIONS: Array<{ kind: TransitionKind; label: string }> = [
  { kind: "fade", label: "Fade" }, { kind: "dissolve", label: "Dissolve" },
  { kind: "crossfade", label: "Crossfade" }, { kind: "slide", label: "Slide" },
  { kind: "zoom", label: "Zoom" }, { kind: "wipe", label: "Wipe" },
  { kind: "blur", label: "Blur" },
];

const FILTERS: Array<{ label: string; effects: Array<{ kind: EffectKind; value: number }> }> = [
  { label: "Cinematic", effects: [{ kind: "contrast", value: 0.18 }, { kind: "saturation", value: -0.12 }, { kind: "vignette", value: 1 }] },
  { label: "Vintage", effects: [{ kind: "sepia", value: 0.55 }, { kind: "contrast", value: -0.08 }, { kind: "saturation", value: -0.2 }] },
  { label: "Noir", effects: [{ kind: "grayscale", value: 1 }, { kind: "contrast", value: 0.3 }] },
  { label: "Vibrant", effects: [{ kind: "saturation", value: 0.35 }, { kind: "contrast", value: 0.12 }] },
  { label: "Soft light", effects: [{ kind: "exposure", value: 0.14 }, { kind: "blur", value: 0.25 }] },
  { label: "Clear", effects: [] },
];

const SPEEDS = [
  { label: "0.25×", value: 0.25 }, { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 }, { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2 }, { label: "Reverse", value: -1 },
];

const TITLE_TEMPLATES: Array<{ label: string; style: Partial<TextStyle> }> = [
  { label: "Fade in title", style: { text: "Title", fontSize: 82, fontWeight: 700, animation: "fadeIn", animationDuration: 0.8 } },
  { label: "Typewriter", style: { text: "Type your story", fontSize: 60, animation: "typewriter", animationDuration: 1.5 } },
  { label: "Zoom in", style: { text: "Boom!", fontSize: 90, fontWeight: 700, animation: "zoomIn", animationDuration: 0.6 } },
  { label: "Lower third", style: { text: "Name · Role", fontSize: 42, align: "left", background: true, backgroundColor: "#000000", animation: "slideIn" } },
  { label: "End card", style: { text: "Thanks for watching", fontSize: 64, animation: "fadeIn", animationDuration: 1 } },
];

interface LeftSidebarProps {
  showImport: () => void;
  onAddAsset: (asset: Asset) => void;
  assetCount: number;
}

export function LeftSidebar({ showImport, onAddAsset, assetCount }: LeftSidebarProps) {
  const active = useWorkspaceStore((s) => s.activeSection);
  const setActive = useWorkspaceStore((s) => s.setActiveSection);
  const collapsed = useWorkspaceStore((s) => s.libraryCollapsed);
  const toggleLibrary = useWorkspaceStore((s) => s.toggleLibrary);
  const leftWidth = useWorkspaceStore((s) => s.leftWidth);
  const setLeftWidth = useWorkspaceStore((s) => s.setLeftWidth);
  const [resizing, setResizing] = React.useState(false);

  const choose = (id: NavSection) => {
    if (collapsed) toggleLibrary();
    setActive(id);
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = collapsed ? 56 : leftWidth;
    const move = (ev: MouseEvent) => setLeftWidth(startWidth + ev.clientX - startX);
    const up = () => {
      setResizing(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <aside
      className="relative flex shrink-0 border-r"
      style={{ width: collapsed ? 56 : leftWidth, borderColor: "var(--qx-border)", background: "var(--qx-panel)" }}
    >
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-2" style={{ borderColor: "var(--qx-border)" }}>
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => choose(section.id)}
              className={cn("qx-nav-item !h-12 w-11 flex-col justify-center gap-1 !px-0 text-center", active === section.id && !collapsed && "text-editor-text")}
              data-active={active === section.id}
              title={section.label}
            >
              <Icon className="h-4 w-4" />
              <span className={cn("text-[9px] leading-none", collapsed && "sr-only")}>{section.label}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <IconButton tooltip={collapsed ? "Expand library" : "Collapse library"} onClick={toggleLibrary} aria-label="Toggle library">
          <Grid2X2 className="h-3.5 w-3.5" />
        </IconButton>
      </nav>

      {!collapsed ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: "var(--qx-border)" }}>
            <span className="qx-section-label">{sections.find((s) => s.id === active)?.label}</span>
            <Badge variant="outline" className="text-[9px]">{assetCount} assets</Badge>
          </div>
          <div className="qx-scroll min-h-0 flex-1 overflow-y-auto">
            {active === "media" || active === "audio" ? (
              <MediaLibrary audioOnly={active === "audio"} showImport={showImport} onAddAsset={onAddAsset} />
            ) : null}
            {active === "text" || active === "stickers" || active === "templates" || active === "elements" ? (
              <TextWorkspace section={active} />
            ) : null}
            {(active === "effects" || active === "filters" || active === "speed" || active === "transitions") ? (
              <ClipWorkspace section={active} />
            ) : null}
            {active === "settings" ? <SettingsWorkspace /> : null}
          </div>
        </div>
      ) : null}

      <div
        className="qx-resizer-x"
        data-dragging={resizing ? "true" : undefined}
        onMouseDown={startResize}
        title="Drag to resize library"
      />
    </aside>
  );
}

/* ------------------------------ media library ------------------------------ */

function MediaLibrary({ audioOnly, showImport, onAddAsset }: {
  audioOnly: boolean;
  showImport: () => void;
  onAddAsset: (asset: Asset) => void;
}) {
  const assets = useMediaStore((s) => s.assets);
  const query = useMediaStore((s) => s.query);
  const setQuery = useMediaStore((s) => s.setQuery);
  const filterType = useMediaStore((s) => s.filterType);
  const setFilterType = useMediaStore((s) => s.setFilterType);
  const sort = useMediaStore((s) => s.sort);
  const setSort = useMediaStore((s) => s.setSort);
  const mediaView = useWorkspaceStore((s) => s.mediaView);
  const setMediaView = useWorkspaceStore((s) => s.setMediaView);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState("");
  const [dragging, setDragging] = React.useState(false);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const type = audioOnly ? "audio" : filterType;
    return assets
      .filter((a) => (type === "all" || a.type === type))
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "duration") return b.duration - a.duration;
        if (sort === "size") return b.size - a.size;
        return b.dateAdded - a.dateAdded;
      });
  }, [assets, query, filterType, audioOnly, sort]);

  const selected = visible.find((a) => a.id === selectedId) ?? visible[0] ?? null;

  const placeAtPlayhead = (mode: "insert" | "overwrite", asset: Asset) => {
    const projectState = useProjectStore.getState();
    const timeline = useTimelineStore.getState();
    const selectedClip = projectState.project.clips.find((c) => c.id === timeline.selectedClipId);
    const time = usePreviewStore.getState().currentTime;
    const id = mode === "insert"
      ? projectState.insertAssetAtPlayhead(asset.id, time, selectedClip?.trackId)
      : projectState.overwriteAssetAtPlayhead(asset.id, time, selectedClip?.trackId);
    if (id) timeline.setSelectedClip(id);
  };

  const columns = mediaView === "grid" ? 2 : 1;
  const rowHeight = mediaView === "grid" ? 142 : 52;
  const [listRef, scrollTop] = useScrollTop<HTMLDivElement>();
  const viewportHeight = 420;
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endRow = Math.ceil((scrollTop + viewportHeight) / rowHeight) + 2;
  const start = startRow * columns;
  const end = Math.min(visible.length, endRow * columns);
  const windowed = visible.slice(start, end);

  const handleDrop = async (files: FileList) => {
    const paths = Array.from(files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p));
    if (!paths.length) return;
    setImporting(true);
    setImportError("");
    const result = await importMediaPaths(paths);
    setImporting(false);
    if (result.failed.length) setImportError(result.failed.map((f) => `${f.name}: ${f.error}`).join("\n"));
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-2.5 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-editor-textMuted" />
            <Input value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search media…" aria-label="Search media" className="pl-8" />
          </div>
          <IconButton tooltip="Import media" onClick={showImport} aria-label="Import media"><Upload className="h-3.5 w-3.5" /></IconButton>
        </div>

        <div className="flex items-center gap-1.5">
          {(audioOnly ? ["audio"] : ["all", "video", "audio", "image"]).map((type) => (
            <button
              key={type}
              type="button"
              className="qx-chip capitalize"
              data-active={filterType === type || (audioOnly && type === "audio")}
              onClick={() => setFilterType(type as typeof filterType)}
            >
              {type === "all" ? <Folder className="h-3 w-3" /> : null}
              {type === "all" ? "All files" : `${type}s`}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)} className="h-7 w-28 text-[10px]" aria-label="Sort media">
            <option value="date">Newest</option>
            <option value="name">Name</option>
            <option value="duration">Duration</option>
            <option value="size">Size</option>
          </Select>
          <Segmented
            ariaLabel="Media view"
            value={mediaView}
            onChange={setMediaView}
            options={[
              { value: "grid", label: "Grid", icon: <Grid2X2 className="h-3 w-3" /> },
              { value: "list", label: "List", icon: <List className="h-3 w-3" /> },
            ]}
          />
        </div>

        {selected ? (
          <div className="qx-card flex gap-2 p-2">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-black/50">
              {selected.thumbPath ? (
                <img src={convertFileSrc(selected.thumbPath)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center"><Music className="h-5 w-5 text-editor-accent" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-editor-text">{selected.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[9px] text-editor-textMuted">
                <Clock className="h-2.5 w-2.5" /> {formatDuration(selected.duration)}
                <Maximize2 className="ml-1 h-2.5 w-2.5" /> {selected.width || "—"}×{selected.height || "—"}
              </p>
              <p className="truncate text-[9px] text-editor-textMuted">{(selected.size / 1024 / 1024).toFixed(1)} MB · {selected.type}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <IconButton tooltip="Add to timeline" onClick={() => onAddAsset(selected)} aria-label="Add selected media"><Plus className="h-3.5 w-3.5" /></IconButton>
              <IconButton tooltip="Insert at playhead" onClick={() => placeAtPlayhead("insert", selected)} aria-label="Insert selected media at playhead">
                <span className="text-[10px] font-bold">I</span>
              </IconButton>
              <IconButton tooltip="Overwrite at playhead" onClick={() => placeAtPlayhead("overwrite", selected)} aria-label="Overwrite at playhead with selected media">
                <span className="text-[10px] font-bold">O</span>
              </IconButton>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={cn("qx-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3", dragging && "rounded-lg outline outline-1 outline-editor-accent")}
        style={{ height: Math.min(viewportHeight, Math.max(220, visible.length * (mediaView === "grid" ? rowHeight / 2 : rowHeight))) }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleDrop(e.dataTransfer.files); }}
        ref={listRef}
      >
        {importing ? <p className="mb-2 text-[10px] text-editor-accent">Importing files…</p> : null}
        {importError ? <pre className="mb-2 whitespace-pre-wrap text-[9px] text-red-300">{importError}</pre> : null}
        {visible.length === 0 ? (
          <EmptyState
            icon={<Film className="h-5 w-5" />}
            title={query ? "No matching media" : "Your library is empty"}
            description={query ? "Try a different search or filter." : "Import a video, audio file or image to begin."}
            action={<Button size="sm" variant="outline" onClick={showImport}>Import media</Button>}
          />
        ) : (
          <>
            <div style={{ height: start * (mediaView === "grid" ? rowHeight / columns : rowHeight) }} />
            <div className={mediaView === "grid" ? "grid grid-cols-2 gap-2" : "space-y-1"}>
              {windowed.map((asset) => mediaView === "grid" ? (
                <AssetCard key={asset.id} asset={asset} selected={selected?.id === asset.id}
                  onSelect={() => setSelectedId(asset.id)} onAdd={() => onAddAsset(asset)} />
              ) : (
                <AssetListRow key={asset.id} asset={asset} selected={selected?.id === asset.id}
                  onSelect={() => setSelectedId(asset.id)} onAdd={() => onAddAsset(asset)} />
              ))}
            </div>
            <div style={{ height: Math.max(0, visible.length - end) * (mediaView === "grid" ? rowHeight / columns : rowHeight) }} />
          </>
        )}
      </div>
    </div>
  );
}

function useScrollTop<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [top, setTop] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return [ref, top];
}

/* --------------------------- text / sticker panels -------------------------- */

function TextWorkspace({ section }: { section: NavSection }) {
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const currentTime = usePreviewStore((s) => s.currentTime);
  const setSelectedClip = useTimelineStore((s) => s.setSelectedClip);

  const addTitle = (style: Partial<TextStyle>) => {
    const id = addTextClip(currentTime, 3, { ...DEFAULT_TEXT, ...style });
    setSelectedClip(id);
  };

  const heading = section === "text" ? "Text presets" : section === "stickers" ? "Emoji stickers" : section === "templates" ? "Title templates" : "Elements";

  return (
    <div className="space-y-3 p-3">
      <div>
        <h3 className="text-sm font-semibold text-editor-text">{heading}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-editor-textMuted">
          Added at the playhead ({currentTime.toFixed(2)}s). Select the clip to restyle it in the Inspector.
        </p>
      </div>
      <div className={cn("grid gap-2", section === "stickers" || section === "elements" ? "grid-cols-4" : "grid-cols-2")}>
        {section === "text" ? TEXT_PRESETS.map((preset) => (
          <Button key={preset.label} variant="outline" className="justify-start text-[11px]" onClick={() => addTitle(preset.style)}>
            {preset.label}
          </Button>
        )) : null}
        {section === "stickers" ? STICKERS.map((emoji) => (
          <button key={emoji} type="button" className="flex h-11 items-center justify-center rounded-md border text-xl transition-colors hover:bg-editor-surfaceHover"
            style={{ borderColor: "var(--qx-border)" }}
            onClick={() => addTitle({ text: emoji, fontSize: 96, outlineWidth: 2, outlineColor: "#000000" })}
            aria-label={`Add ${emoji} sticker`}>{emoji}</button>
        )) : null}
        {section === "templates" ? TITLE_TEMPLATES.map((tpl) => (
          <Button key={tpl.label} variant="outline" className="justify-start text-[11px]" onClick={() => addTitle(tpl.style)}>{tpl.label}</Button>
        )) : null}
        {section === "elements" ? ELEMENTS.map((el) => {
          const Icon = el.icon;
          return (
            <button key={el.label} type="button" title={el.label}
              className="flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-lg transition-colors hover:bg-editor-surfaceHover"
              style={{ borderColor: "var(--qx-border)" }}
              onClick={() => addTitle({ text: el.glyph, fontSize: 96, color: "#ffffff" })}>
              <Icon className="h-3.5 w-3.5 text-editor-textMuted" />
              <span className="text-[9px] text-editor-textMuted">{el.label}</span>
            </button>
          );
        }) : null}
      </div>
    </div>
  );
}

/* ----------------------------- clip tool panels ----------------------------- */

function ClipWorkspace({ section }: { section: NavSection }) {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const setSelectedClip = useTimelineStore((s) => s.setSelectedClip);
  const [transitionSide, setTransitionSide] = React.useState<"in" | "out">("in");
  const selectedClip = project.clips.find((c) => c.id === selectedClipId);

  const applyEffect = (kind: EffectKind, value: number) => {
    if (!selectedClip) return;
    const active = selectedClip.effects.find((e) => e.kind === kind && e.enabled);
    useProjectStore.getState().setEffect(selectedClip.id, kind, active ? 0 : value, !active);
  };

  const applyFilter = (effects: Array<{ kind: EffectKind; value: number }>) => {
    if (!selectedClip) return;
    useProjectStore.getState().updateClip(selectedClip.id, {
      effects: effects.map((e) => ({ id: `${selectedClip.id}-${e.kind}`, kind: e.kind, value: e.value, enabled: true })),
    });
  };

  if (!selectedClip) {
    return (
      <div className="p-3">
        <EmptyState icon={<Zap className="h-5 w-5" />} title="Select a clip first"
          description={`Choose a clip on the timeline to apply ${section}.`} />
      </div>
    );
  }

  const heading = section === "effects" ? "Effects" : section === "filters" ? "Filters" : section === "speed" ? "Speed" : "Transitions";

  return (
    <div className="space-y-3 p-3">
      <div className="qx-card flex items-center gap-2 p-2">
        <span className="h-1.5 w-1.5 rounded-full bg-editor-accent" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-editor-text" title={selectedClip.name}>{selectedClip.name}</span>
        <Badge variant="outline" className="text-[9px]">Selected</Badge>
      </div>
      <h3 className="qx-section-label">{heading}</h3>

      {section === "effects" ? (
        <div className="grid grid-cols-2 gap-2">
          {EFFECT_OPTIONS.map((opt) => {
            const enabled = selectedClip.effects.some((e) => e.kind === opt.kind && e.enabled);
            return (
              <Button key={opt.kind} size="sm" variant={enabled ? "default" : "outline"} className="justify-start text-[11px]"
                onClick={() => applyEffect(opt.kind, opt.value)}>
                {enabled ? <Zap className="mr-1 h-3 w-3" /> : null}{opt.label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {section === "filters" ? (
        <div className="grid grid-cols-2 gap-2">
          {FILTERS.map((filter) => (
            <Button key={filter.label} size="sm" variant="outline" className="justify-start text-[11px]"
              onClick={() => applyFilter(filter.effects)}>{filter.label}</Button>
          ))}
        </div>
      ) : null}

      {section === "speed" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {SPEEDS.map((speed) => (
              <Button key={speed.label} size="sm"
                variant={Math.abs(selectedClip.speed - speed.value) < 0.001 ? "default" : "outline"}
                onClick={() => useProjectStore.getState().updateClip(selectedClip.id, { speed: speed.value })}>
                {speed.label}
              </Button>
            ))}
          </div>
          <Field label="Fine speed" hint={`${Math.abs(selectedClip.speed).toFixed(2)}×`}>
            <Slider min={0.25} max={4} step={0.05} value={Math.abs(selectedClip.speed)}
              onValueChange={(v) => useProjectStore.getState().updateClip(selectedClip.id, {
                speed: selectedClip.speed < 0 ? -v : v,
              })} aria-label="Clip speed" />
          </Field>
        </>
      ) : null}

      {section === "transitions" ? (
        <div className="space-y-3">
          <Segmented value={transitionSide} onChange={setTransitionSide} ariaLabel="Transition side"
            options={[{ value: "in", label: "Transition in" }, { value: "out", label: "Transition out" }]} />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => useProjectStore.getState().setTransition(selectedClip.id, transitionSide, null)}>None</Button>
            {TRANSITIONS.map((t) => (
              <Button key={t.kind} size="sm" variant="outline" className="justify-start text-[11px]"
                onClick={() => useProjectStore.getState().setTransition(selectedClip.id, transitionSide, { kind: t.kind, duration: 0.5 })}>
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <Button size="sm" variant="ghost" className="w-full" onClick={() => setSelectedClip(null)}>Clear selection</Button>
    </div>
  );
}

/* --------------------------------- settings -------------------------------- */

function SettingsWorkspace() {
  const project = useProjectStore((s) => s.project);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const [capabilities, setCapabilities] = React.useState<{
    h264: boolean; h265: boolean; vp9: boolean; av1: boolean; hwaccel: string[];
  } | null>(null);

  React.useEffect(() => {
    let live = true;
    ffmpeg.capabilities().then((caps) => { if (live) setCapabilities(caps); }).catch(() => { if (live) setCapabilities(null); });
    return () => { live = false; };
  }, []);

  return (
    <div className="space-y-4 p-3">
      <div>
        <h3 className="text-sm font-semibold text-editor-text">Project settings</h3>
        <p className="mt-1 text-[11px] text-editor-textMuted">Applies to this project and the default export settings.</p>
      </div>
      <Field label="Aspect ratio">
        <Select value={project.settings.aspectRatio}
          onValueChange={(v) => updateSettings({ aspectRatio: v as typeof project.settings.aspectRatio })}>
          {ASPECT_RATIOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
      </Field>
      <Field label="Resolution">
        <Select value={project.settings.resolution}
          onValueChange={(v) => updateSettings({ resolution: v as typeof project.settings.resolution })}>
          {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
      </Field>
      {(project.settings.aspectRatio === "custom" || project.settings.resolution === "custom") ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" min={2} placeholder="Width" value={project.settings.customWidth ?? 1920}
            onChange={(e) => updateSettings({ customWidth: Number(e.currentTarget.value) })} />
          <Input type="number" min={2} placeholder="Height" value={project.settings.customHeight ?? 1080}
            onChange={(e) => updateSettings({ customHeight: Number(e.currentTarget.value) })} />
        </div>
      ) : null}
      <Field label="Frame rate">
        <Select value={String(project.settings.fps)} onValueChange={(v) => {
          const fps = Number(v);
          updateSettings({ fps });
          useTimelineStore.getState().setFps(fps);
        }}>
          {FRAME_RATES.map((f) => <option key={f} value={String(f)}>{f} FPS</option>)}
        </Select>
      </Field>
      <Field label="Export codec">
        <Select value={project.settings.codec} onValueChange={(v) => updateSettings({ codec: v as typeof project.settings.codec })}>
          <option value="h264">H.264</option><option value="h265">H.265</option>
          <option value="vp9">VP9</option><option value="av1">AV1</option>
        </Select>
      </Field>
      <Field label="Preview quality">
        <Select value={project.settings.previewQuality ?? "medium"}
          onValueChange={(v) => updateSettings({ previewQuality: v as "low" | "medium" | "high" })}>
          <option value="low">Low — fastest</option>
          <option value="medium">Medium — balanced</option>
          <option value="high">High — original media</option>
        </Select>
      </Field>
      <Field label="Output quality" hint={`CRF ${project.settings.crf ?? 23}`}>
        <Slider min={0} max={51} value={project.settings.crf ?? 23}
          onValueChange={(v) => updateSettings({ crf: v })} aria-label="Output CRF" />
      </Field>
      <label className="flex items-start gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--qx-border)" }}>
        <Switch checked={project.settings.proxyEnabled ?? true}
          onCheckedChange={(v) => updateSettings({ proxyEnabled: v })} aria-label="Use preview proxies" />
        <span>
          <span className="block text-[11px] font-medium text-editor-text">Preview proxies</span>
          <span className="block text-[10px] text-editor-textMuted">Generate lighter copies for responsive editing.</span>
        </span>
      </label>
      <div className="rounded-lg border p-2.5 text-[10px]" style={{ borderColor: "var(--qx-border)" }}>
        <div className="mb-2 flex items-center gap-1.5 font-medium text-editor-text">
          <Info className="h-3 w-3 text-editor-accent" /> FFmpeg capability
        </div>
        <div className="flex flex-wrap gap-1">
          {(["h264", "h265", "vp9", "av1"] as const).map((codec) => (
            <Badge key={codec} variant={capabilities?.[codec] ? "default" : "outline"} className="text-[9px]">
              {codec.toUpperCase()}: {capabilities ? capabilities[codec] ? "yes" : "no" : "…"}
            </Badge>
          ))}
        </div>
        <p className="mt-2 leading-relaxed text-editor-textMuted">
          Hardware: {capabilities?.hwaccel.length ? capabilities.hwaccel.join(", ") : "software fallback"}. Exports use reliable software encoders.
        </p>
      </div>
    </div>
  );
}
