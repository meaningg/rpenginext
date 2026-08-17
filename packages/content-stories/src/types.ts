import { z } from "zod";

import { JsonObjectSchema } from "@rpengineext/contracts";

/**
 * Host-facing story template (not an engine module template snippet).
 */
export const StoryTemplateSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1).default("0.1.0"),
    title: z.string().min(1),
    synopsis: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    locale: z.string().min(1).optional(),
    seed: z.string().min(1),
    openingAction: z
      .object({
        kind: z.literal("free_text"),
        text: z.string().min(1),
      })
      .optional(),
    sessionMeta: JsonObjectSchema.default({}),
    narrativeStyle: JsonObjectSchema.optional(),
    modules: z
      .object({
        workingMemoryWindow: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .strict();

export type StoryTemplate = z.infer<typeof StoryTemplateSchema>;

/**
 * Parses a story template document.
 *
 * @param input - raw JSON value
 */
export function parseStoryTemplate(input: unknown) {
  return StoryTemplateSchema.safeParse(input);
}
