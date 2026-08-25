import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "../lib/cn.ts";

/**
 * Visual divider.
 */
export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
}: {
  readonly className?: string;
  readonly orientation?: "horizontal" | "vertical";
  readonly decorative?: boolean;
}) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}
