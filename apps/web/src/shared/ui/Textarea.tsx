import type { TextareaHTMLAttributes } from "react";

import { cn } from "../lib/cn.ts";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Multiline field for dark minimal UI.
 */
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-400/40 focus:ring-2 focus:ring-orange-500/15 disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
