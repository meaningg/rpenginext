import type { ReactNode } from "react";

import { cn } from "../../design-system/index.ts";
import { AppAmbient } from "./AppAmbient.tsx";
import { AppSidebar } from "./AppSidebar.tsx";

export type AppShellVariant = "browse" | "immersive";

/**
 * Unified product chrome for catalog and play.
 *
 * - browse: padded content canvas (stories/sessions)
 * - immersive: full-height main column (play)
 */
export function AppShell({
  children,
  variant = "browse",
  className,
}: {
  readonly children: ReactNode;
  readonly variant?: AppShellVariant;
  readonly className?: string;
}) {
  return (
    <div className={cn("relative min-h-dvh bg-bg", className)}>
      <AppAmbient />

      <div className="flex min-h-dvh w-full">
        <AppSidebar />

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            variant === "immersive" && "h-dvh min-h-0 overflow-hidden",
          )}
        >
          {variant === "browse" ? (
            <main className="flex-1 px-4 py-6 sm:px-8 lg:px-10 xl:px-12 2xl:px-16">
              <div className="mx-auto w-full max-w-[var(--content-max)]">
                {children}
              </div>
            </main>
          ) : (
            <main className="flex min-h-0 flex-1 flex-col bg-bg">
              {children}
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
