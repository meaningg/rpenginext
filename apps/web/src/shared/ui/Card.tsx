import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Elevated surface card.
 */
export function Card({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.07] bg-[#121216]/80 p-5 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.85)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
