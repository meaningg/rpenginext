import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createSession,
  ensurePlayer,
  listTemplates,
  type StoryTemplateSummary,
} from "../../shared/api/client.ts";

/**
 * Story template gallery and session start.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<StoryTemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await ensurePlayer();
        setTemplates(await listTemplates());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  const start = async (templateId: string) => {
    setBusyId(templateId);
    setError(null);
    try {
      const player = await ensurePlayer();
      const created = await createSession(player, templateId);
      navigate(`/play/${created.session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-7">
      <div className="space-y-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-300/85">
          Interactive fiction
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
          Choose a story
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-stone-400">
          Free-text roleplay in a calm reading view. One action at a time — the
          narrator answers in prose.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3.5">
        {templates.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-stone-500">
            Loading stories…
          </div>
        ) : null}

        {templates.map((template) => (
          <article
            key={template.id}
            className="group rounded-2xl border border-white/[0.08] bg-zinc-900/45 p-5 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.85)] backdrop-blur-sm transition hover:border-violet-400/30 hover:bg-zinc-900/70"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <h2 className="text-lg font-semibold tracking-tight text-stone-50 transition group-hover:text-white">
                  {template.title}
                </h2>
                <p className="text-[14.5px] leading-relaxed text-stone-400">
                  {template.synopsis}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-stone-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={busyId === template.id}
                onClick={() => void start(template.id)}
                className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-950/40 transition hover:brightness-110 disabled:opacity-50"
              >
                {busyId === template.id ? "Starting…" : "Begin"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
