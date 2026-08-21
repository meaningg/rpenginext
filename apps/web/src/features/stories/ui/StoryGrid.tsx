import type { StoryTemplate } from "../../../entities/story/model.ts";
import { StoryCard } from "./StoryCard.tsx";

/**
 * Responsive story catalog grid — expands on ultrawide.
 */
export function StoryGrid({
  templates,
}: {
  readonly templates: readonly StoryTemplate[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {templates.map((template) => (
        <StoryCard key={template.id} template={template} />
      ))}
    </div>
  );
}
