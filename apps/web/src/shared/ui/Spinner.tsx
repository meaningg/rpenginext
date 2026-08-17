import { cn } from "../lib/cn.ts";

/**
 * Inline spinner.
 */
export function Spinner({ className }: { readonly className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-r-transparent",
        className,
      )}
      aria-hidden
    />
  );
}
