import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Small tag/chip.
 */
export function Badge({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-white/7 bg-white/3 px-2.5 py-0.5 text-[11px] text-zinc-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
