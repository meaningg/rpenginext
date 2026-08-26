import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema } from "../json.ts";
import { StateCommandSchema } from "../state/commands.ts";
import { PassageSchema } from "./passage.ts";

/**
 * Player-safe turn failure payload.
 * `code` carries stable tokens: core codes from {@link TURN_FAILURE_CODES},
 * module-platform codes (MODULE_*) and author `deny(code)` codes pass through
 * unchanged (specs/03: deny preserves author code).
 */
export const TurnFailureSchema = z.object({
  turnId: IdStringSchema,
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  causedBy: z.array(z.string().min(1)).optional(),
  stage: z.string().min(1).optional(),
});

export type TurnFailure = z.infer<typeof TurnFailureSchema>;

/**
 * Successful turn commit result returned to the host.
 */
export const TurnCommittedSchema = z.object({
  status: z.literal("committed"),
  turnId: IdStringSchema,
  sessionId: IdStringSchema,
  revision: z.number().int().nonnegative(),
  passage: PassageSchema,
  acceptedCommands: z.array(StateCommandSchema),
  warnings: z.array(z.string()).default([]),
  meta: JsonObjectSchema.optional(),
});

export type TurnCommitted = z.infer<typeof TurnCommittedSchema>;

/**
 * Rejected turn — authoritative state unchanged.
 */
export const TurnRejectedSchema = z.object({
  status: z.literal("rejected"),
  turnId: IdStringSchema,
  sessionId: IdStringSchema,
  failure: TurnFailureSchema,
  warnings: z.array(z.string()).default([]),
  meta: JsonObjectSchema.optional(),
});

export type TurnRejected = z.infer<typeof TurnRejectedSchema>;

export const TurnResultSchema = z.discriminatedUnion("status", [
  TurnCommittedSchema,
  TurnRejectedSchema,
]);

export type TurnResult = z.infer<typeof TurnResultSchema>;

/**
 * Parses a host-facing turn result.
 *
 * @param input - raw value
 */
export function parseTurnResult(input: unknown) {
  return TurnResultSchema.safeParse(input);
}
