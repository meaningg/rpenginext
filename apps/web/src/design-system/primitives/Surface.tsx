import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Elevated surface card.
 */
export function Surface({
  children,
  className,
  interactive = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg-surface/90 shadow-surface",
        interactive &&
          "transition duration-150 hover:border-border-strong hover:bg-bg-muted/80",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** @deprecated use Surface */
export const Card = Surface;
