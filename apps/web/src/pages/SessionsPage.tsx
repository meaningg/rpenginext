import { BookOpen } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "../design-system/index.ts";
import {
  useDeleteSessionMutation,
  useRenameSessionMutation,
  useSessionsQuery,
} from "../entities/session/queries.ts";
import { useStoriesQuery } from "../entities/story/queries.ts";
import { SessionList } from "../features/sessions/ui/SessionList.tsx";
import { COPY } from "../shared/config/copy.ts";
import { AppShell } from "../widgets/app-shell/AppShell.tsx";

/**
 * Resume list for the local player.
 */
export function SessionsPage() {
  const sessions = useSessionsQuery();
  const stories = useStoriesQuery();
  const rename = useRenameSessionMutation();
  const remove = useDeleteSessionMutation();

  const storyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of stories.data ?? []) map.set(t.id, t.title);
    return map;
  }, [stories.data]);

  const error =
    sessions.error instanceof Error
      ? sessions.error.message
      : sessions.error
        ? COPY.common.error
        : null;

  return (
    <AppShell>
      <div className="space-y-7 animate-fade-in">
        <PageHeader
          kicker={COPY.sessions.kicker}
          title={COPY.sessions.title}
          subtitle={COPY.sessions.subtitle}
        />

        {error ? (
          <ErrorState
            message={error}
            action={
              <button
                type="button"
                className="text-sm font-medium text-rose-100 underline-offset-4 hover:underline"
                onClick={() => void sessions.refetch()}
              >
                {COPY.common.retry}
              </button>
            }
          />
        ) : null}

        {sessions.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (sessions.data?.length ?? 0) === 0 ? (
          <EmptyState
            title={COPY.sessions.emptyTitle}
            body={COPY.sessions.emptyBody}
            icon={<BookOpen className="h-5 w-5" />}
            action={
              <Button asChild>
                <Link to="/">{COPY.sessions.emptyCta}</Link>
              </Button>
            }
          />
        ) : (
          <SessionList
            sessions={sessions.data ?? []}
            storyById={storyById}
            onRename={async (sessionId, title) => {
              await rename.mutateAsync({ sessionId, title });
            }}
            onDelete={async (sessionId) => {
              await remove.mutateAsync(sessionId);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
