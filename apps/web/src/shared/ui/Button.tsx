import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn.ts";

type ButtonVariant = "primary" | "ghost" | "soft" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-orange-500 text-white hover:bg-orange-400 disabled:bg-orange-500/40",
  ghost:
    "bg-transparent text-zinc-300 hover:bg-white/5 hover:text-zinc-50 disabled:text-zinc-600",
  soft: "bg-white/4 text-zinc-100 border border-white/8 hover:bg-white/7 hover:border-white/14 disabled:opacity-40",
  danger:
    "bg-rose-500/15 text-rose-100 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-40",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-11 px-5 text-sm rounded-xl gap-2",
  icon: "h-10 w-10 rounded-xl justify-center",
};

/**
 * Minimal dark-theme button.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0c] disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}
