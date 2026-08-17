import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Centered empty/placeholder block.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-6 py-14 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {body ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
