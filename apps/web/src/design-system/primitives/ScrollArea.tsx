import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Accessible scroll container.
 */
export function ScrollArea({
  children,
  className,
  viewportClassName,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly viewportClassName?: string;
}) {
  return (
    <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)}>
      <ScrollAreaPrimitive.Viewport
        className={cn("h-full w-full rounded-[inherit]", viewportClassName)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex touch-none p-0.5 transition-colors select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2"
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-white/15" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
