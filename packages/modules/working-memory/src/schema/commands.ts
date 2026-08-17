import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

/**
 * Payload for `working_memory.append_pair`.
 */
export const AppendPairPayloadSchema = z
  .object({
    turnId: z.string().min(1),
    user: z.string().min(1),
    assistant: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .strict();

export type AppendPairPayload = z.infer<typeof AppendPairPayloadSchema>;

export const AppendPairPayloadJsonSchema =
  AppendPairPayloadSchema as unknown as z.ZodType<JsonObject>;
