import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

type Variant = "default" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const variantStyles: Record<Variant, string> = {
  default:
    "text-white font-semibold transition-all duration-200 hover:opacity-90 active:scale-[0.98]",
  outline:
    "bg-transparent text-white font-semibold border transition-all duration-200 hover:bg-white/5 active:scale-[0.98]",
  ghost:
    "bg-transparent text-white font-medium transition-all duration-200 hover:bg-white/5 active:scale-[0.98]",
};

const variantInlineStyles: Record<Variant, React.CSSProperties> = {
  default: {
    background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
    boxShadow: "0 0 20px rgba(124,58,237,0.35)",
  },
  outline: {
    borderColor: "#1E2D4A",
    color: "#F8FAFC",
  },
  ghost: {},
};

const sizeStyles: Record<Size, string> = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-7 py-3.5 text-base rounded-xl",
};

export function buttonVariants({
  variant = "default",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
    variantStyles[variant],
    sizeStyles[size],
    className
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "md", asChild = false, style, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        style={{ ...variantInlineStyles[variant], ...style }}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
