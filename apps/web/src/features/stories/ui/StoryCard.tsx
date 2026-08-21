import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, Surface } from "../../../design-system/index.ts";
import type { StoryTemplate } from "../../../entities/story/model.ts";
import { COPY } from "../../../shared/config/copy.ts";

/**
 * Story template card in the catalog grid.
 */
export function StoryCard({
  template,
}: {
  readonly template: StoryTemplate;
}) {
  return (
    <Surface
      interactive
      className="group relative flex h-full flex-col overflow-hidden p-5"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-fg transition group-hover:text-white">
            {template.title}
          </h2>
          <p className="line-clamp-3 text-[14px] leading-relaxed text-fg-muted">
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
      <div className="mt-5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-fg-faint">
          v{template.version}
        </span>
        <Link
          to={`/stories/${encodeURIComponent(template.id)}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
        >
          {COPY.stories.cta}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-80" />
        </Link>
      </div>
    </Surface>
  );
}
