import { cn } from "../lib/cn.ts";

/**
 * Inline error surface.
 */
export function ErrorBanner({
  message,
  className,
}: {
  readonly message: string;
  readonly className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100",
        className,
      )}
    >
      {message}
    </div>
  );
}
