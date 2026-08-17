import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { MAX_OUTFIT_LENGTH } from "../constants.ts";

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

export const OutfitSyncInputJsonSchema =
  OutfitSyncInputSchema as unknown as z.ZodType<JsonObject>;

export const OutfitSyncOutputSchema = z
  .object({
    changed: z.boolean(),
  })
  .strict();

export type OutfitSyncOutput = z.infer<typeof OutfitSyncOutputSchema>;

export const OutfitSyncOutputJsonSchema =
  OutfitSyncOutputSchema as unknown as z.ZodType<JsonObject>;

export const UpdateOutfitArgsSchema = z
  .object({
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export const UpdateOutfitArgsJsonSchema =
  UpdateOutfitArgsSchema as unknown as z.ZodType<JsonObject>;

export const UpdateOutfitResultSchema = z
  .object({
    ok: z.literal(true),
    outfit: z.string().min(1).max(MAX_OUTFIT_LENGTH),
  })
  .strict();

export const UpdateOutfitResultJsonSchema =
  UpdateOutfitResultSchema as unknown as z.ZodType<JsonObject>;

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
