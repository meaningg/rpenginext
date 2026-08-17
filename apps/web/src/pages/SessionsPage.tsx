import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { SessionCard } from "../features/sessions/components/SessionCard.tsx";
import { BrowseLayout } from "../layouts/BrowseLayout.tsx";
import {
  deleteSession,
  ensurePlayer,
  listSessions,
  listTemplates,
  renameSession,
  type PlayerCredentials,
  type SessionSummary,
  type StoryTemplateSummary,
} from "../shared/api/client.ts";
import { COPY } from "../shared/config/copy.ts";
import { clearTranscript } from "../shared/lib/chat-transcript.ts";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
} from "../shared/ui/index.ts";

/**
 * Resume list for the local player.
 */
export function SessionsPage() {
  const [player, setPlayer] = useState<PlayerCredentials | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [templates, setTemplates] = useState<StoryTemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await ensurePlayer();
    setPlayer(p);
    const [sessionList, templateList] = await Promise.all([
      listSessions(p),
      listTemplates().catch(() => [] as StoryTemplateSummary[]),
    ]);
    setSessions(sessionList);
    setTemplates(templateList);
  }, []);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setSessions([]);
    });
  }, [load]);

  const storyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.title);
    return map;
  }, [templates]);

  const onRename = async (sessionId: string, title: string) => {
    if (!player) return;
    const updated = await renameSession(player, sessionId, title);
    setSessions(
      (prev) =>
        prev?.map((s) =>
          s.sessionId === sessionId
            ? { ...s, title: updated.title, updatedAt: updated.updatedAt }
            : s,
        ) ?? null,
    );
  };

  const onDelete = async (sessionId: string) => {
    if (!player) return;
    await deleteSession(player, sessionId);
    clearTranscript(sessionId);
    setSessions(
      (prev) => prev?.filter((s) => s.sessionId !== sessionId) ?? null,
    );
  };

  return (
    <BrowseLayout>
      <div className="space-y-7">
        <PageHeader
          kicker={COPY.sessions.kicker}
          title={COPY.sessions.title}
          subtitle={COPY.sessions.subtitle}
        />

        {error ? <ErrorBanner message={error} /> : null}

        {sessions === null ? (
          <div className="space-y-2.5">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            title={COPY.sessions.emptyTitle}
            body={COPY.sessions.emptyBody}
            action={
              <Link
                to="/"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-medium text-white transition hover:bg-orange-400"
              >
                {COPY.sessions.emptyCta}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <SessionCard
                  session={session}
                  storyTitle={storyById.get(session.templateId)}
                  onRename={(title) => onRename(session.sessionId, title)}
                  onDelete={() => onDelete(session.sessionId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </BrowseLayout>
  );
}
