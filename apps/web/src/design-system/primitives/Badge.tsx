import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Small tag/chip.
 */
export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "neutral" &&
          "border-border bg-white/[0.03] text-fg-subtle",
        tone === "accent" &&
          "border-accent/20 bg-accent-muted text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}
