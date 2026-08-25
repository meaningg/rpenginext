import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import {
  Badge,
  ErrorState,
  Skeleton,
} from "../design-system/index.ts";
import { usePlayerQuery } from "../entities/player/queries.ts";
import { useStoryQuery } from "../entities/story/queries.ts";
import { StartSessionForm } from "../features/stories/ui/StartSessionForm.tsx";
import { COPY } from "../shared/config/copy.ts";
import { AppShell } from "../widgets/app-shell/AppShell.tsx";

/**
 * Story detail + session start.
 */
export function StoryDetailPage() {
  const { templateId = "" } = useParams();
  const player = usePlayerQuery();
  const story = useStoryQuery(templateId);

  const error =
    player.error instanceof Error
      ? player.error.message
      : story.error instanceof Error
        ? story.error.message
        : player.error || story.error
          ? COPY.common.error
          : null;

  const loading = player.isLoading || story.isLoading;
  const template = story.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-fg-subtle transition hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {COPY.stories.back}
        </Link>

        {error ? (
          <ErrorState
            message={error}
            action={
              <button
                type="button"
                className="text-sm font-medium text-rose-100 underline-offset-4 hover:underline"
                onClick={() => {
                  void player.refetch();
                  void story.refetch();
                }}
              >
                {COPY.common.retry}
              </button>
            }
          />
        ) : null}

        {loading || !template ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3 max-w-md" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-fg">
                  {template.title}
                </h1>
                <span className="font-mono text-xs text-fg-faint">
                  v{template.version}
                </span>
              </div>
              <p className="text-[15px] leading-relaxed text-fg-muted">
                {template.synopsis}
              </p>
              {template.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <StartSessionForm templateId={template.id} />
          </>
        )}
      </div>
    </AppShell>
  );
}
