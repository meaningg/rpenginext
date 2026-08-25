import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Accessible tooltip.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delayDuration = 200,
}: {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly delayDuration?: number;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-xs animate-fade-in rounded-md border border-border bg-bg-muted px-2.5 py-1.5 text-xs text-fg shadow-pop",
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-bg-muted" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
