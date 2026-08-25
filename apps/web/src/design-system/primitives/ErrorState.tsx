import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Inline error surface.
 */
export function ErrorState({
  message,
  className,
  action,
}: {
  readonly message: string;
  readonly className?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-danger/25 bg-danger-muted px-3.5 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p>{message}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** @deprecated use ErrorState */
export const ErrorBanner = ErrorState;
