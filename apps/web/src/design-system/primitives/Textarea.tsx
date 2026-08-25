import type { TextareaHTMLAttributes } from "react";

import { cn } from "../lib/cn.ts";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Multiline field for dark product UI.
 */
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-fg outline-none transition placeholder:text-fg-faint focus:border-accent/40 focus:ring-2 focus:ring-accent-ring disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
