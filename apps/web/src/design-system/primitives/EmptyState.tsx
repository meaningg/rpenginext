import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Centered empty/placeholder block.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-bg-muted text-fg-subtle">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {body ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-subtle">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
