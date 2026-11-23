import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-7 w-7", className)} aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#151827" stroke="#2d3350" />
      <path d="M11 12.5v15l12-7.5-12-7.5Z" fill="#8f75ff" />
      <path d="M24 12.5v15l6-3.75v-7.5L24 12.5Z" fill="#c4b5fd" opacity="0.92" />
      <circle cx="29.5" cy="9.5" r="2" fill="#7c5cff" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      {!compact ? (
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-editor-text">QumenX</div>
          <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-editor-textMuted">Create Without Limits</div>
        </div>
      ) : null}
    </div>
  );
}
