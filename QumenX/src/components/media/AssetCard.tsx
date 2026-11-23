import * as React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Play, Film, Music, Image as ImageIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asset } from "@/types/project";

interface AssetCardProps {
  asset: Asset;
  onAdd: () => void;
  onSelect?: () => void;
  selected?: boolean;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  video: Film,
  audio: Music,
  image: ImageIcon,
};

export const AssetCard = React.memo(function AssetCard({ asset, onAdd, onSelect, selected }: AssetCardProps) {
  const Icon = TYPE_ICONS[asset.type] || ImageIcon;
  return (
    <div
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg border transition-colors",
        selected ? "border-editor-accent ring-1 ring-editor-accent/40" : "border-editor-border hover:border-editor-borderStrong"
      )}
      style={{ background: "var(--qx-panel-raised)" }}
      onClick={() => onSelect?.()}
      onDoubleClick={onAdd}
      title={`${asset.name} — click to preview, double-click to add`}
    >
      <div className="relative aspect-video overflow-hidden bg-black/40">
        {asset.thumbPath ? (
          <img src={convertFileSrc(asset.thumbPath)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : asset.type === "audio" ? (
          <div className="flex h-full w-full items-center justify-center"><Music className="h-7 w-7 text-editor-accent/70" /></div>
        ) : (
          <div className="flex h-full w-full items-center justify-center"><Icon className="h-7 w-7 text-editor-textMuted" /></div>
        )}
        <div className="absolute inset-0 bg-black/10 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
          {formatDuration(asset.duration)}
        </span>
        <button
          type="button"
          title="Add to timeline"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/65 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-editor-accent"
        >
          <Play className="h-3 w-3 text-white" />
        </button>
      </div>
      <div className="p-2">
        <p className="truncate text-[11px] font-medium text-editor-text" title={asset.name}>{asset.name}</p>
        <div className="mt-1 flex items-center justify-between text-[9px] text-editor-textMuted">
          <span className="flex items-center gap-1"><Icon className="h-3 w-3" /> {asset.type}</span>
          <span>{asset.width > 0 ? `${asset.width}×${asset.height}` : "audio"}</span>
        </div>
      </div>
    </div>
  );
});

export const AssetListRow = React.memo(function AssetListRow({ asset, onAdd, onSelect, selected }: AssetCardProps) {
  const Icon = TYPE_ICONS[asset.type] || ImageIcon;
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
        selected ? "border-editor-accent bg-editor-accentSoft" : "border-transparent hover:bg-editor-surfaceHover"
      )}
      onClick={() => onSelect?.()}
      onDoubleClick={onAdd}
      title={`${asset.name} — click to preview, double-click to add`}
    >
      <div className="h-8 w-12 shrink-0 overflow-hidden rounded bg-black/40">
        {asset.thumbPath ? (
          <img src={convertFileSrc(asset.thumbPath)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center"><Icon className="h-3.5 w-3.5 text-editor-textMuted" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-editor-text">{asset.name}</p>
        <p className="text-[9px] text-editor-textMuted">{formatDuration(asset.duration)} · {asset.width || "—"}×{asset.height || "—"}</p>
      </div>
      <Plus className="h-3.5 w-3.5 text-editor-textMuted opacity-0 group-hover:opacity-100" />
    </div>
  );
});

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
