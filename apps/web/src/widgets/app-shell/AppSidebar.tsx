import { BookOpen, Library, Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

import { Button, cn } from "../../design-system/index.ts";
import { usePlayerQuery } from "../../entities/player/queries.ts";
import { COPY } from "../../shared/config/copy.ts";
import { BrandMark } from "./BrandMark.tsx";
import { CHROME_HEADER_CLASS, CHROME_PANEL_CLASS } from "./chrome.ts";

const NAV = [
  { to: "/", label: COPY.nav.stories, icon: Library, end: true },
  { to: "/sessions", label: COPY.nav.sessions, icon: BookOpen, end: false },
] as const;

/**
 * Product sidebar — shared across browse and play.
 */
export function AppSidebar() {
  const player = usePlayerQuery();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className={cn(CHROME_HEADER_CLASS, "justify-between px-3 lg:hidden")}>
        <BrandMark />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={mobileOpen ? COPY.common.close : COPY.nav.menu}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {mobileOpen ? (
        <div className={cn(CHROME_PANEL_CLASS, "border-b border-border px-3 py-3 lg:hidden")}>
          <SidebarBody
            displayName={player.data?.displayName}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      ) : null}

      <aside
        className={cn(
          CHROME_PANEL_CLASS,
          "sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border lg:flex",
        )}
      >
        <div className={cn(CHROME_HEADER_CLASS, "px-4")}>
          <BrandMark />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
          <SidebarBody displayName={player.data?.displayName} />
        </div>
      </aside>
    </>
  );
}

function SidebarBody({
  displayName,
  onNavigate,
}: {
  readonly displayName?: string;
  readonly onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <nav className="space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                isActive
                  ? "bg-accent-muted text-fg shadow-[inset_2px_0_0_0_var(--color-accent)]"
                  : "text-fg-muted hover:bg-white/[0.03] hover:text-fg",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0 opacity-80" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-lg border border-border bg-bg-surface/70 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            {COPY.nav.player}
          </p>
          <p className="mt-1 truncate text-sm text-fg-muted">
            {displayName ?? COPY.common.loading}
          </p>
        </div>
      </div>
    </div>
  );
}
