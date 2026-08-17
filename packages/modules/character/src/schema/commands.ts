import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { MAX_FIELD_LENGTH, MAX_OUTFIT_LENGTH } from "../constants.ts";

export const SeedCharacterPayloadSchema = z
  .object({
    name: z.string().min(1).max(MAX_FIELD_LENGTH),
    appearance: z.string().min(1).max(MAX_FIELD_LENGTH),
    features: z.string().min(1).max(MAX_FIELD_LENGTH),
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type SeedCharacterPayload = z.infer<typeof SeedCharacterPayloadSchema>;

export const SeedCharacterPayloadJsonSchema =
  SeedCharacterPayloadSchema as unknown as z.ZodType<JsonObject>;

export const SetOutfitPayloadSchema = z
  .object({
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export type SetOutfitPayload = z.infer<typeof SetOutfitPayloadSchema>;

export const SetOutfitPayloadJsonSchema =
  SetOutfitPayloadSchema as unknown as z.ZodType<JsonObject>;

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
