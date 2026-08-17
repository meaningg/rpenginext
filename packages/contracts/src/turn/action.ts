import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema, type JsonObject } from "../json.ts";

/**
 * Raw host input for a player turn.
 */
export const PlayerActionSchema = z.object({
  clientActionId: IdStringSchema.optional(),
  kind: z.enum(["free_text", "system"]).default("free_text"),
  text: z.string().optional(),
  payload: JsonObjectSchema.optional(),
});

export type PlayerAction = z.infer<typeof PlayerActionSchema>;

/**
 * Normalized action after NORMALIZE stage.
 */
export const NormalizedActionSchema = z.object({
  actionType: z.string().min(1),
  raw: PlayerActionSchema,
  text: z.string().optional(),
  targets: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1).optional(),
  extras: JsonObjectSchema.default({}),
});

export type NormalizedAction = z.infer<typeof NormalizedActionSchema>;

/**
 * Structured intent after INTENT stage.
 */
export const ActionIntentSchema = z.object({
  intentType: z.string().min(1),
  actorId: z.string().min(1).optional(),
  verb: z.string().min(1).optional(),
  targets: z.array(z.string().min(1)).default([]),
  manner: z.string().optional(),
  patches: JsonObjectSchema.default({}),
  confidence: z.number().min(0).max(1).optional(),
});

export type ActionIntent = z.infer<typeof ActionIntentSchema>;

/**
 * Parses host player action input.
 *
 * @param input - raw value
 */
export function parsePlayerAction(input: unknown) {
  return PlayerActionSchema.safeParse(input);
}

/**
 * Empty extras bag helper for normalize/intent defaults.
 */
export function emptyJsonObject(): JsonObject {
  return {};
}
