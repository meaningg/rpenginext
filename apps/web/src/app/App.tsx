import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { HomePage } from "../features/templates/HomePage.tsx";
import { SessionPage } from "../features/session/SessionPage.tsx";
import { SessionsPage } from "../features/sessions/SessionsPage.tsx";

/**
 * Root application shell and routes.
 */
export function App() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-zinc-950" />
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]" />
      </div>

      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-6 pt-4 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-xl">
          <Link
            to="/"
            className="group flex items-center gap-2.5 text-zinc-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-sm font-bold text-white shadow-md shadow-violet-900/40">
              R
            </span>
            <span className="text-[15px] font-semibold tracking-tight group-hover:text-white">
              RP Engine
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/">Stories</NavLink>
            <NavLink to="/sessions">Sessions</NavLink>
          </nav>
        </header>

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/play/:sessionId" element={<SessionPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function NavLink({
  to,
  children,
}: {
  readonly to: string;
  readonly children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="rounded-full px-3 py-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
    >
      {children}
    </Link>
  );
}
