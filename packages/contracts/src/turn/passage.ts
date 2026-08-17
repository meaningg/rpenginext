import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema, type JsonObject } from "../json.ts";

/**
 * Player-facing choice attached to a passage.
 */
export const ChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.string().min(1).default("default"),
  enabled: z.boolean().default(true),
  payload: JsonObjectSchema.optional(),
  meta: JsonObjectSchema.optional(),
});

export type Choice = z.infer<typeof ChoiceSchema>;

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
  choices: z.array(ChoiceSchema).default([]),
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
