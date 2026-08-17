import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { MAX_CANON_LENGTH } from "../constants.ts";

/**
 * Authoritative world-canon slice.
 */
export const WorldCanonSliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** When false, module is idle (no story canon). */
    present: z.boolean(),
    /** Immutable world bible text for the narrative system prompt. */
    text: z.string().max(MAX_CANON_LENGTH),
  })
  .strict();

export type WorldCanonSlice = z.infer<typeof WorldCanonSliceSchema>;

/** Zod root cast for SliceDefinition.schema (JsonObject boundary). */
export const WorldCanonSliceJsonSchema =
  WorldCanonSliceSchema as unknown as z.ZodType<JsonObject>;

/**
 * Empty slice seed for new sessions (no canon until bootstrap seed).
 */
export function createEmptyWorldCanonSlice(): WorldCanonSlice {
  return {
    schemaVersion: 1,
    present: false,
    text: "",
  };
}

/**
 * Safely reads the slice from world state (missing → empty).
 *
 * @param raw - slices.world_canon value
 */
export function parseWorldCanonSlice(raw: unknown): WorldCanonSlice {
  const parsed = WorldCanonSliceSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return createEmptyWorldCanonSlice();
}
