import { Library } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "../design-system/index.ts";
import { usePlayerQuery } from "../entities/player/queries.ts";
import { useStoriesQuery } from "../entities/story/queries.ts";
import { StoryGrid } from "../features/stories/ui/StoryGrid.tsx";
import { COPY } from "../shared/config/copy.ts";
import { AppShell } from "../widgets/app-shell/AppShell.tsx";

/**
 * Story catalog page.
 */
export function StoriesPage() {
  const player = usePlayerQuery();
  const stories = useStoriesQuery();

  const error =
    player.error instanceof Error
      ? player.error.message
      : stories.error instanceof Error
        ? stories.error.message
        : player.error || stories.error
          ? COPY.common.error
          : null;

  const loading = player.isLoading || stories.isLoading;
  const templates = stories.data ?? [];

  return (
    <AppShell>
      <div className="space-y-7 animate-fade-in">
        <PageHeader
          kicker={COPY.stories.kicker}
          title={COPY.stories.title}
          subtitle={COPY.stories.subtitle}
        />

        {error ? (
          <ErrorState
            message={error}
            action={
              <button
                type="button"
                className="text-sm font-medium text-rose-100 underline-offset-4 hover:underline"
                onClick={() => {
                  void player.refetch();
                  void stories.refetch();
                }}
              >
                {COPY.common.retry}
              </button>
            }
          />
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        ) : templates.length === 0 && !error ? (
          <EmptyState
            title={COPY.stories.empty}
            body={COPY.stories.emptyBody}
            icon={<Library className="h-5 w-5" />}
          />
        ) : (
          <StoryGrid templates={templates} />
        )}
      </div>
    </AppShell>
  );
}
