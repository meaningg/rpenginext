import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Keyboard shortcut chip.
 */
export function Kbd({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg-muted px-1 font-mono text-[10px] font-medium text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
