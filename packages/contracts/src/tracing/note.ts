import { z } from "zod";

import { JsonObjectSchema } from "../json.ts";

/**
 * Module annotation attached to a turn markdown trace.
 */
export const TraceNoteSchema = z.object({
  namespace: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]*$/i, "trace namespace must be an identifier"),
  title: z.string().min(1),
  body: z.string(),
  data: JsonObjectSchema.optional(),
});

export type TraceNote = z.infer<typeof TraceNoteSchema>;

/**
 * Parses a module trace note.
 *
 * @param input - raw value
 */
export function parseTraceNote(input: unknown) {
  return TraceNoteSchema.safeParse(input);
}
