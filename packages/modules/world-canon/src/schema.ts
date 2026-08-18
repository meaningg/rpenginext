import { z } from "zod";

import { MAX_CANON_LENGTH } from "./constants.ts";

/**
 * Authoritative world-canon slice.
 */
export const WorldCanonSliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    present: z.boolean(),
    text: z.string().max(MAX_CANON_LENGTH),
  })
  .strict();

export type WorldCanonSlice = z.infer<typeof WorldCanonSliceSchema>;

/**
 * Empty slice seed for new sessions.
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
  if (parsed.success) return parsed.data;
  return createEmptyWorldCanonSlice();
}

/**
 * Story / session meta world canon document (plain string).
 */
export const StoryWorldCanonSchema = z.string().min(1).max(MAX_CANON_LENGTH);

export type StoryWorldCanon = z.infer<typeof StoryWorldCanonSchema>;
