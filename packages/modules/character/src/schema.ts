import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { MAX_FIELD_LENGTH, MAX_OUTFIT_LENGTH } from "./constants.ts";

/**
 * Authoritative player-character slice.
 */
export const CharacterSliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    present: z.boolean(),
    name: z.string().max(MAX_FIELD_LENGTH),
    appearance: z.string().max(MAX_FIELD_LENGTH),
    features: z.string().max(MAX_FIELD_LENGTH),
    outfit: z.string().max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type CharacterSlice = z.infer<typeof CharacterSliceSchema>;

/**
 * Empty slice seed for new sessions.
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
  if (parsed.success) return parsed.data;
  return createEmptyCharacterSlice();
}

export const SeedCharacterPayloadSchema = z
  .object({
    name: z.string().min(1).max(MAX_FIELD_LENGTH),
    appearance: z.string().min(1).max(MAX_FIELD_LENGTH),
    features: z.string().min(1).max(MAX_FIELD_LENGTH),
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type SeedCharacterPayload = z.infer<typeof SeedCharacterPayloadSchema>;

export const SetOutfitPayloadSchema = z
  .object({
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type SetOutfitPayload = z.infer<typeof SetOutfitPayloadSchema>;

/**
 * Story / session meta character document.
 */
export const StoryCharacterSchema = z
  .object({
    name: z.string().min(1).max(MAX_FIELD_LENGTH),
    appearance: z.string().min(1).max(MAX_FIELD_LENGTH),
    features: z.string().min(1).max(MAX_FIELD_LENGTH),
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type StoryCharacter = z.infer<typeof StoryCharacterSchema>;

export const OutfitSyncInputSchema = z
  .object({
    sourceTurnId: z.string().min(1),
    userText: z.string(),
    prose: z.string(),
    characterBefore: z
      .object({
        name: z.string(),
        appearance: z.string(),
        features: z.string(),
        outfit: z.string(),
      })
      .strict(),
  })
  .strict();

export type OutfitSyncInput = z.infer<typeof OutfitSyncInputSchema>;

export const OutfitSyncOutputSchema = z
  .object({
    changed: z.boolean(),
  })
  .strict();

export const UpdateOutfitArgsSchema = z
  .object({
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export const UpdateOutfitResultSchema = z
  .object({
    ok: z.literal(true),
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export const UPDATE_OUTFIT_PARAMETERS_JSON: JsonObject = {
  type: "object",
  properties: {
    outfit: {
      type: "string",
      description:
        "Full current outfit description as one string (not a diff).",
      minLength: 1,
      maxLength: MAX_OUTFIT_LENGTH,
    },
  },
  required: ["outfit"],
  additionalProperties: false,
};
