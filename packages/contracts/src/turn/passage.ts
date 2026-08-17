import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema, type JsonObject } from "../json.ts";

/**
 * Optional redacted projection for status panels.
 */
export type PublicView = JsonObject;

/**
 * Immutable player-facing page after a successful commit.
 */
export const PassageSchema = z.object({
  id: IdStringSchema,
  turnId: IdStringSchema,
  prose: z.string(),
  visibleState: JsonObjectSchema.optional(),
});

export type Passage = z.infer<typeof PassageSchema>;

/**
 * Parses a passage artifact.
 *
 * @param input - raw value
 */
export function parsePassage(input: unknown) {
  return PassageSchema.safeParse(input);
}
