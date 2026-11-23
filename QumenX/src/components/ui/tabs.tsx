import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}
const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex size-full", className)} {...props} />
));
Tabs.displayName = "Tabs";

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}
const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("inline-flex h-10 items-center justify-center rounded-lg border border-editor-border bg-background p-1 text-sm font-medium", className)} {...props} />
));
TabsList.displayName = "TabsList";

interface TabsTriggerProps {
  value: string;
  disabled?: boolean;
}
const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps & React.HTMLAttributes<HTMLButtonElement>>(
  ({ className, value, disabled, ...props }, ref) => (
    <button
      type="button"
      role="tab"
      aria-selected={true}
      disabled={disabled}
      ref={ref}
      className={cn(
        "relative flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-editor-accent data-[state=active]:text-white data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
);
TabsTrigger.displayName = "TabsTrigger";

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}
const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ className, value, ...props }, ref) => (
  <div ref={ref} className={cn("mt-2 focus-visible:outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  onValueChange?: (value: string) => void;
}
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, onValueChange, ...props }, ref) => (
  <select
    ref={ref}
    onChange={(e) => onValueChange?.(e.currentTarget.value)}
    className={cn("qx-input flex w-full items-center justify-between py-1.5 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props}
  />
));
Select.displayName = "Select";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
const Checkbox = ({ checked = false, onCheckedChange, className, ...props }: CheckboxProps) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded border-editor-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
);

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}
const Skeleton = ({ className, ...props }: SkeletonProps) => (
  <div className={cn("animate-pulse rounded-md bg-editor-surface", className)} {...props} />
);

export { Tabs, TabsList, TabsTrigger, TabsContent, Select, Checkbox, Skeleton };
