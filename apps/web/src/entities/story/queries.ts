import { useQuery } from "@tanstack/react-query";

import { getTemplate, listTemplates } from "./api.ts";
import type { StoryTemplate } from "./model.ts";

export const storyKeys = {
  root: ["stories"] as const,
  list: () => [...storyKeys.root, "list"] as const,
  detail: (templateId: string) =>
    [...storyKeys.root, "detail", templateId] as const,
};

/**
 * Catalog of story templates.
 */
export function useStoriesQuery() {
  return useQuery<StoryTemplate[]>({
    queryKey: storyKeys.list(),
    queryFn: listTemplates,
  });
}

/**
 * Single story template.
 *
 * @param templateId - template id
 */
export function useStoryQuery(templateId: string) {
  return useQuery<StoryTemplate>({
    queryKey: storyKeys.detail(templateId),
    queryFn: () => getTemplate(templateId),
    enabled: Boolean(templateId),
  });
}
