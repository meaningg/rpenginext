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
    <div className="relative min-h-dvh overflow-x-hidden font-sans">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#07070a]" />
        <div className="absolute -left-40 top-[-6rem] h-[28rem] w-[28rem] rounded-full bg-violet-600/18 blur-3xl" />
        <div className="absolute -right-28 top-32 h-[22rem] w-[22rem] rounded-full bg-fuchsia-600/12 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/3 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.045),transparent_58%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(7,7,10,0.55))]" />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-6 pt-4 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-zinc-950/55 px-4 py-3 shadow-[0_10px_40px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <Link
            to="/"
            className="group flex items-center gap-2.5 text-stone-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-sm font-bold tracking-tight text-white shadow-md shadow-violet-900/40">
              R
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-stone-100 group-hover:text-white">
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
      className="rounded-full px-3 py-1.5 text-stone-400 transition hover:bg-white/[0.05] hover:text-stone-100"
    >
      {children}
    </Link>
  );
}
