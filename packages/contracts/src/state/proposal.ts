import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema } from "../json.ts";
import { StateCommandSchema } from "./commands.ts";

/**
 * Ephemeral agent/module proposal — never mutates state by itself.
 */
export const ProposalSchema = z.object({
  proposalId: IdStringSchema,
  commands: z.array(StateCommandSchema),
  narrativeHints: JsonObjectSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  explanations: z.string().optional(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/**
 * Parses unknown input as {@link Proposal}.
 *
 * @param input - raw value
 */
export function parseProposal(input: unknown) {
  return ProposalSchema.safeParse(input);
}
