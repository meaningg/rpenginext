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
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300/80">
          Continue
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
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
          <p className="text-sm text-zinc-400">No sessions yet.</p>
          <Link
            to="/"
            className="mt-3 inline-flex text-sm text-violet-300 hover:text-violet-200"
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
                className="block rounded-2xl border border-white/10 bg-zinc-900/50 px-4 py-3.5 shadow-lg shadow-black/15 transition hover:border-violet-400/30 hover:bg-zinc-900/80"
              >
                <div className="font-medium text-zinc-100">{session.title}</div>
                <p className="mt-1 text-xs text-zinc-500">
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
