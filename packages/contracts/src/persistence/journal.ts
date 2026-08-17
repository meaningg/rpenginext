import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { StateCommandSchema } from "../state/commands.ts";
import { PlayerActionSchema } from "../turn/action.ts";

/**
 * Append-only journal entry written only after successful commit.
 */
export const JournalEntrySchema = z.object({
  turnId: IdStringSchema,
  prevRevision: z.number().int().nonnegative(),
  nextRevision: z.number().int().nonnegative(),
  input: PlayerActionSchema,
  commands: z.array(StateCommandSchema),
  passageId: IdStringSchema,
  timestamp: z.string().min(1),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/**
 * Parses a journal entry.
 *
 * @param input - raw value
 */
export function parseJournalEntry(input: unknown) {
  return JournalEntrySchema.safeParse(input);
}
