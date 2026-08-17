import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { BrowseLayout } from "../layouts/BrowseLayout.tsx";
import {
  createSession,
  ensurePlayer,
  getTemplate,
  type StoryTemplateSummary,
} from "../shared/api/client.ts";
import { COPY } from "../shared/config/copy.ts";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Input,
  Skeleton,
} from "../shared/ui/index.ts";

/**
 * Story detail + session start.
 */
export function StoryDetailPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<StoryTemplateSummary | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await ensurePlayer();
        const next = await getTemplate(templateId);
        setTemplate(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId]);

  const start = async () => {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const player = await ensurePlayer();
      const created = await createSession(
        player,
        template.id,
        title.trim() || undefined,
      );
      navigate(`/play/${created.session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <BrowseLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          to="/"
          className="inline-flex text-sm text-zinc-500 transition hover:text-zinc-200"
        >
          ← {COPY.stories.back}
        </Link>

        {error ? <ErrorBanner message={error} /> : null}

        {loading || !template ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3 max-w-md" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
                {template.title}
              </h1>
              <p className="text-[15px] leading-relaxed text-zinc-400">
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

            <Card className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="session-title"
                  className="text-sm font-medium text-zinc-200"
                >
                  {COPY.stories.sessionTitle}
                </label>
                <Input
                  id="session-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={COPY.stories.sessionTitlePlaceholder}
                  maxLength={120}
                />
                <p className="text-xs text-zinc-600">
                  {COPY.stories.sessionTitleHint}
                </p>
              </div>
              <Button
                size="lg"
                loading={busy}
                onClick={() => void start()}
                className="w-full sm:w-auto"
              >
                {busy ? COPY.stories.starting : COPY.stories.start}
              </Button>
            </Card>
          </>
        )}
      </div>
    </BrowseLayout>
  );
}
