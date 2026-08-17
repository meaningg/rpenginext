import type { InputHTMLAttributes } from "react";

import { cn } from "../lib/cn.ts";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

/**
 * Text field for dark minimal UI.
 */
export function Input({ className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-white/8 bg-white/3 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-400/40 focus:ring-2 focus:ring-orange-500/15 disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
