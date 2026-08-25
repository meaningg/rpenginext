import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { COPY } from "../../shared/config/copy.ts";
import { cn } from "../lib/cn.ts";
import { Button } from "./Button.tsx";

/**
 * Accessible modal dialog.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-bg-surface p-5 shadow-pop outline-none data-[state=open]:animate-fade-in",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight text-fg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm leading-relaxed text-fg-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={COPY.common.close}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
