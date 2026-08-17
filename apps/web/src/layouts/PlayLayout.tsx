import type { ReactNode } from "react";

/**
 * Full-viewport shell for the reading experience.
 */
export function PlayLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-[#0a0a0c]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.05),transparent_55%)]" />
      <div className="mx-auto flex h-dvh w-full max-w-[90rem] flex-col">
        {children}
      </div>
    </div>
  );
}
