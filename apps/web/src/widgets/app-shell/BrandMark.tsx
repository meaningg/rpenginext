import { NavLink } from "react-router-dom";

import { cn } from "../../design-system/index.ts";
import { COPY } from "../../shared/config/copy.ts";

/**
 * Product wordmark used in chrome.
 */
export function BrandMark({
  compact = false,
  className,
}: {
  readonly compact?: boolean;
  readonly className?: string;
}) {
  return (
    <NavLink
      to="/"
      className={cn("group flex items-center gap-2.5", className)}
    >
      <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-accent-fg shadow-[0_0_0_1px_rgb(232_184_109_/_0.3)]">
        <span className="translate-y-px">R</span>
        <span className="absolute inset-0 rounded-md bg-[linear-gradient(180deg,rgb(255_255_255_/_0.18),transparent)]" />
      </span>
      <span
        className={cn(
          "text-sm font-semibold tracking-tight text-fg transition group-hover:text-white",
          compact && "sr-only sm:not-sr-only",
        )}
      >
        {COPY.app.name}
      </span>
    </NavLink>
  );
}
