import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}
const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);
  if (!open) return null;
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onOpenChange(false);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleBackdrop} />
      <div className="relative w-full max-w-lg m-4 flex flex-col">
        <div className="relative rounded-xl border border-editor-border bg-editor-surface shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
          {children}
          <button
            type="button"
            className="absolute right-3 top-3 rounded-sm p-1.5 text-editor-textMuted hover:bg-editor-surfaceHover hover:text-editor-text"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}
const Sheet = ({ open, onOpenChange, children }: SheetProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur" />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-[420px] flex flex-col border-l border-editor-border bg-editor-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-editor-border">
          <button
            type="button"
            className="rounded-sm p-1.5 text-editor-textMuted hover:bg-editor-surfaceHover hover:text-editor-text"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};

interface DropdownMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}
const DropdownMenu = ({ open, onOpenChange, children }: DropdownMenuProps) => {
  if (!open) return null;
  return (
    <div className="z-50" onClick={(e) => e.stopPropagation()}>
      <div className="fixed inset-0" onClick={() => onOpenChange(false)} />
      <div className="relative z-50">{children}</div>
    </div>
  );
};

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}
const DropdownMenuContent = ({ align = "start", className, ...props }: DropdownMenuContentProps) => (
  <div
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border border-editor-border bg-editor-surface p-1 text-base shadow-lg",
      align === "start" ? "origin-top-left" : "origin-top-right",
      className
    )}
    {...props}
  />
);

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  onSelect?: () => void;
  disabled?: boolean;
}
const DropdownMenuItem = ({ onSelect, disabled, className, ...props }: DropdownMenuItemProps) => (
  <div
    role="menuitem"
    aria-disabled={disabled}
    onClick={() => !disabled && onSelect?.()}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
      disabled ? "text-editor-textMuted" : "text-editor-text hover:bg-editor-surfaceHover",
      className
    )}
    {...props}
  />
);

export { Dialog, Sheet, DropdownMenu, DropdownMenuContent, DropdownMenuItem };
