import type { ReactNode } from "react";
import { useEffect } from "react";

import { COPY } from "../config/copy.ts";
import { cn } from "../lib/cn.ts";
import { Button } from "./Button.tsx";

/**
 * Simple centered modal dialog.
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  className,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={COPY.common.close}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full max-w-md rounded-2xl border border-white/8 bg-[#121216] p-5 shadow-2xl shadow-black/50",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-zinc-50">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {COPY.common.close}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
