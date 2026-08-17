import { Link } from "react-router-dom";

import type { StoryTemplateSummary } from "../../../shared/api/client.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { Badge, Card } from "../../../shared/ui/index.ts";

/**
 * Story template card in the catalog grid.
 */
export function StoryCard({
  template,
}: {
  readonly template: StoryTemplateSummary;
}) {
  return (
    <Card className="group flex h-full flex-col transition hover:border-white/[0.12] hover:bg-[#15151b]">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50 transition group-hover:text-white">
            {template.title}
          </h2>
          <p className="line-clamp-3 text-[14px] leading-relaxed text-zinc-400">
            {template.synopsis}
          </p>
        </div>
        {template.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {template.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-5">
        <Link
          to={`/stories/${encodeURIComponent(template.id)}`}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-medium text-white transition hover:bg-orange-400"
        >
          {COPY.stories.cta}
        </Link>
      </div>
    </Card>
  );
}
