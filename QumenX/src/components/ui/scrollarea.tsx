import * as React from "react";
import { cn } from "@/lib/utils";

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("qx-scroll relative rounded-md border", className)}
      {...props}
    >
      <div className="absolute inset-0 overflow-auto rounded-md">{children}</div>
    </div>
  )
);
ScrollArea.displayName = "ScrollArea";

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

function Switch({ checked = false, onCheckedChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props["aria-label"]}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-editor-accent" : "bg-editor-border",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

interface SliderProps {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, defaultValue, min = 0, max = 100, step = 1, onValueChange, className, disabled, ...props }, ref) => {
    const current = value ?? defaultValue ?? min;
    const progress = max === min ? 0 : ((current - min) / (max - min)) * 100;
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        aria-label={props["aria-label"]}
        onChange={(e) => onValueChange?.(Number(e.currentTarget.value))}
        style={{ "--range-progress": `${Math.max(0, Math.min(100, progress))}%` } as React.CSSProperties}
        className={cn(
          "qx-range flex h-1 w-full cursor-pointer appearance-none rounded-full accent-editor-accent disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
    );
  }
);
Slider.displayName = "Slider";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full border border-editor-border bg-editor-border", className)}
      {...props}
    >
      <div
        className="h-full bg-editor-accent transition-all duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
);
Progress.displayName = "Progress";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
}

const Tooltip = ({ content, children }: TooltipProps) => {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="absolute top-full left-0 z-50 mt-1 whitespace-nowrap rounded border border-editor-border bg-[#0f1115] px-2 py-1 text-xs text-white shadow">
          {content}
        </span>
      )}
    </span>
  );
};

export { ScrollArea, Switch, Slider, Progress, Tooltip };
