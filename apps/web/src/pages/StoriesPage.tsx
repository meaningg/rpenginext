import { useEffect, useState } from "react";

import { StoryCard } from "../features/stories/components/StoryCard.tsx";
import { BrowseLayout } from "../layouts/BrowseLayout.tsx";
import {
  ensurePlayer,
  listTemplates,
  type StoryTemplateSummary,
} from "../shared/api/client.ts";
import { COPY } from "../shared/config/copy.ts";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
} from "../shared/ui/index.ts";

/**
 * Story catalog page.
 */
export function StoriesPage() {
  const [templates, setTemplates] = useState<StoryTemplateSummary[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await ensurePlayer();
        setTemplates(await listTemplates());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setTemplates([]);
      }
    })();
  }, []);

  return (
    <BrowseLayout>
      <div className="space-y-7">
        <PageHeader
          kicker={COPY.stories.kicker}
          title={COPY.stories.title}
          subtitle={COPY.stories.subtitle}
        />

        {error ? <ErrorBanner message={error} /> : null}

        {templates === null ? (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : templates.length === 0 && !error ? (
          <EmptyState title={COPY.stories.empty} />
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {templates.map((template) => (
              <StoryCard key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>
    </BrowseLayout>
  );
}
