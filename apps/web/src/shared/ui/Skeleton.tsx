import { cn } from "../lib/cn.ts";

/**
 * Loading placeholder block.
 */
export function Skeleton({ className }: { readonly className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-white/[0.05]",
        className,
      )}
      aria-hidden
    />
  );
}
