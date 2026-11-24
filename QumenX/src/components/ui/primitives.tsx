import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lightweight tooltip that does not add a dependency or a portal. */
export function Tooltip({
  label,
  shortcut,
  children,
  side = "bottom",
}: {
  label: React.ReactNode;
  shortcut?: string;
  children: React.ReactElement;
  side?: "top" | "bottom";
}) {
  return (
    <span className="qx-tooltip-anchor relative inline-flex">
      {children}
      <span
        role="tooltip"
        data-visible="true"
        className={cn(
          "qx-tooltip",
          side === "bottom" ? "left-1/2 top-full mt-1.5 -translate-x-1/2" : "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
        )}
      >
        {label}
        {shortcut ? <span className="ml-2 opacity-60">{shortcut}</span> : null}
      </span>
    </span>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  shortcut?: string;
  active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, shortcut, active, className, children, ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type="button"
        title={tooltip}
        data-active={active ? "true" : undefined}
        className={cn("qx-icon-button", className)}
        {...props}
      >
        {children}
      </button>
    );
    if (!tooltip) return button;
    return <Tooltip label={tooltip} shortcut={shortcut}>{button}</Tooltip>;
  }
);
IconButton.displayName = "IconButton";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-md border p-0.5", className)}
      style={{ borderColor: "var(--qx-border)", background: "rgba(10,12,17,.45)" }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded px-2 text-[10px] font-medium transition-colors",
            value === option.value ? "text-white" : "text-editor-textMuted hover:text-editor-text"
          )}
          style={value === option.value ? { background: "var(--qx-accent)" } : undefined}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-center justify-between gap-2">
        <span className="qx-section-label">{label}</span>
        {hint ? <span className="text-[10px] text-editor-textMuted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = true,
  right,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className={cn("overflow-hidden rounded-lg border", className)} style={{ borderColor: "var(--qx-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-editor-surfaceHover"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold text-editor-text">{title}</span>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown className={cn("h-3.5 w-3.5 text-editor-textMuted transition-transform", !open && "-rotate-90")} />
        </span>
      </button>
      {open ? <div className="border-t px-3 py-3" style={{ borderColor: "var(--qx-border)" }}>{children}</div> : null}
    </section>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button aria-label="Close dialog" className="absolute inset-0 cursor-default bg-black/65" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={cn("relative flex max-h-[86vh] w-full flex-col overflow-hidden rounded-xl border shadow-2xl animate-qx-scale-in", width)} style={{ borderColor: "var(--qx-border-strong)", background: "var(--qx-panel)" }}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--qx-border)" }}>
          <div>
            <h2 className="text-base font-semibold text-editor-text">{title}</h2>
            {description ? <p className="mt-1 text-xs text-editor-textMuted">{description}</p> : null}
          </div>
          <IconButton tooltip="Close" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="qx-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--qx-border)" }}>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="qx-empty">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--qx-accent-soft)", color: "var(--qx-accent)" }}>
        {icon}
      </div>
      <p className="text-xs font-medium text-editor-text">{title}</p>
      <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-editor-textMuted">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
