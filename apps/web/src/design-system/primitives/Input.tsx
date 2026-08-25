import type { InputHTMLAttributes } from "react";

import { cn } from "../lib/cn.ts";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

/**
 * Text field for dark product UI.
 */
export function Input({ className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-white/[0.03] px-3 text-sm text-fg outline-none transition placeholder:text-fg-faint focus:border-accent/40 focus:ring-2 focus:ring-accent-ring disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
