import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { MAX_FIELD_LENGTH, MAX_OUTFIT_LENGTH } from "../constants.ts";

/**
 * Authoritative player-character slice.
 */
export const CharacterSliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** When false, module is idle (no story character). */
    present: z.boolean(),
    name: z.string().max(MAX_FIELD_LENGTH),
    appearance: z.string().max(MAX_FIELD_LENGTH),
    features: z.string().max(MAX_FIELD_LENGTH),
    outfit: z.string().max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type CharacterSlice = z.infer<typeof CharacterSliceSchema>;

/** Zod root cast for SliceDefinition.schema (JsonObject boundary). */
export const CharacterSliceJsonSchema =
  CharacterSliceSchema as unknown as z.ZodType<JsonObject>;

/**
 * Empty slice seed for new sessions (no character until bootstrap seed).
 */
export function createEmptyCharacterSlice(): CharacterSlice {
  return {
    schemaVersion: 1,
    present: false,
    name: "",
    appearance: "",
    features: "",
    outfit: "",
  };
}

/**
 * Safely reads the slice from world state (missing → empty).
 *
 * @param raw - slices.character value
 */
export function parseCharacterSlice(raw: unknown): CharacterSlice {
  const parsed = CharacterSliceSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return createEmptyCharacterSlice();
}
