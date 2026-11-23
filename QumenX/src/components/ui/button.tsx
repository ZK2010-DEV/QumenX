import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost" | "secondary" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "qx-button qx-button-primary",
      destructive: "qx-button qx-button-danger",
      outline: "qx-button qx-button-secondary",
      ghost: "qx-button qx-button-ghost",
      secondary: "qx-button qx-button-secondary",
      link: "text-editor-accent underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-8 px-3",
      sm: "h-7 px-2.5 text-[11px]",
      lg: "h-10 px-5 text-sm",
      icon: "h-8 w-8 px-0",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent disabled:pointer-events-none disabled:opacity-40",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
