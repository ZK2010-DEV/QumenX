import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "qx-input file:border-0 file:bg-transparent file:text-xs disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn("text-sm font-medium text-editor-textMuted peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
));
Label.displayName = "Label";

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {}
const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(({ className, ...props }, ref) => (
  <hr ref={ref} className={cn("my-4 h-px bg-editor-border", className)} {...props} />
));
Separator.displayName = "Separator";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "qx-input min-h-[80px] resize-none py-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-editor-accent text-white",
    secondary: "bg-editor-surfaceHover text-editor-text border border-editor-border",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-editor-border bg-transparent",
  };
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:border-editor-accent/30",
        variants[variant],
        className
      )}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Input, Label, Separator, Textarea, Badge };
