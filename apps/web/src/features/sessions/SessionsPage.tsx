import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  ensurePlayer,
  listSessions,
  type SessionSummary,
} from "../../shared/api/client.ts";

/**
 * Resume list for the local player.
 */
export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const player = await ensurePlayer();
        setSessions(await listSessions(player));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  return (
    <div className="space-y-7">
      <div className="space-y-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-300/85">
          Continue
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-50">
          My sessions
        </h1>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {sessions.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
          <p className="text-sm text-stone-400">No sessions yet.</p>
          <Link
            to="/"
            className="mt-3 inline-flex text-sm text-violet-300 transition hover:text-violet-200"
          >
            Start a story →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <Link
                to={`/play/${session.sessionId}`}
                className="block rounded-2xl border border-white/[0.08] bg-zinc-900/45 px-4 py-3.5 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.8)] transition hover:border-violet-400/30 hover:bg-zinc-900/70"
              >
                <div className="font-medium tracking-tight text-stone-100">
                  {session.title}
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {session.templateId} · updated{" "}
                  {formatWhen(session.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
