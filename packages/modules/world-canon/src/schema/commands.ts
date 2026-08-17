import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { MAX_CANON_LENGTH } from "../constants.ts";

export const SeedWorldCanonPayloadSchema = z
  .object({
    text: z.string().min(1).max(MAX_CANON_LENGTH),
  })
  .strict();

export type SeedWorldCanonPayload = z.infer<typeof SeedWorldCanonPayloadSchema>;

export const SeedWorldCanonPayloadJsonSchema =
  SeedWorldCanonPayloadSchema as unknown as z.ZodType<JsonObject>;

/**
 * Story / session meta world canon document (plain string).
 */
export const StoryWorldCanonSchema = z.string().min(1).max(MAX_CANON_LENGTH);

export type StoryWorldCanon = z.infer<typeof StoryWorldCanonSchema>;
