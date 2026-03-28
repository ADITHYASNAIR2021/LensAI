import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

type BadgeVariant = "default" | "secondary" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    background: "rgba(124, 58, 237, 0.2)",
    border: "1px solid rgba(124, 58, 237, 0.4)",
    color: "#A855F7",
  },
  secondary: {
    background: "rgba(15, 22, 41, 0.8)",
    border: "1px solid #1E2D4A",
    color: "#94A3B8",
  },
  outline: {
    background: "transparent",
    border: "1px solid #1E2D4A",
    color: "#F8FAFC",
  },
};

export function Badge({
  className,
  variant = "default",
  style,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full",
        className
      )}
      style={{ ...variantStyles[variant], ...style }}
      {...props}
    />
  );
}
