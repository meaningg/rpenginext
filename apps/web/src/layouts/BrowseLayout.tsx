import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { COPY } from "../shared/config/copy.ts";
import { cn } from "../shared/lib/cn.ts";

/**
 * Shell for catalog / sessions screens.
 */
export function BrowseLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0c]" />
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.08),transparent_70%)]" />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-10 pt-4 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <NavLink to="/" className="group flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-sm font-semibold text-white">
              R
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-100 group-hover:text-white">
              {COPY.app.name}
            </span>
          </NavLink>

          <nav className="flex items-center gap-1 text-sm">
            <BrowseNavLink to="/" end>
              {COPY.nav.stories}
            </BrowseNavLink>
            <BrowseNavLink to="/sessions">
              {COPY.nav.sessions}
            </BrowseNavLink>
          </nav>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function BrowseNavLink({
  to,
  end,
  children,
}: {
  readonly to: string;
  readonly end?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "rounded-lg px-3 py-1.5 transition",
          isActive
            ? "bg-white/[0.06] text-zinc-50"
            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200",
        )
      }
    >
      {children}
    </NavLink>
  );
}
