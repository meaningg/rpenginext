import { z } from "zod";

import { JsonObjectSchema } from "../json.ts";
import { ChoiceSchema } from "../turn/passage.ts";

/**
 * Built-in agent task type ids (v1).
 * Domain types (npc.*, canon.*, …) are registered by modules.
 */
export const STANDARD_AGENT_TASK_TYPES = {
  narrativeWrite: "narrative.write",
  actionInterpret: "action.interpret",
} as const;

export type StandardAgentTaskType =
  (typeof STANDARD_AGENT_TASK_TYPES)[keyof typeof STANDARD_AGENT_TASK_TYPES];

/**
 * Prior chat pair message for narrative continuity (not world truth).
 */
export const NarrativeHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export type NarrativeHistoryMessage = z.infer<
  typeof NarrativeHistoryMessageSchema
>;

/**
 * Input for `narrative.write`.
 */
export const NarrativeWriteInputSchema = z.object({
  brief: JsonObjectSchema,
  style: JsonObjectSchema.optional(),
  locale: z.string().min(1).optional(),
  maxChoices: z.number().int().positive().optional(),
  /**
   * Prior user/assistant pairs flattened as chat messages.
   * Expected order: user, assistant, user, assistant, …
   */
  history: z.array(NarrativeHistoryMessageSchema).optional(),
});

export type NarrativeWriteInput = z.infer<typeof NarrativeWriteInputSchema>;

/**
 * Output for `narrative.write`.
 */
export const NarrativeWriteOutputSchema = z.object({
  prose: z.string().min(1),
  choiceDrafts: z.array(ChoiceSchema).default([]),
  meta: JsonObjectSchema.optional(),
});

export type NarrativeWriteOutput = z.infer<typeof NarrativeWriteOutputSchema>;

/**
 * Input for `action.interpret`.
 */
export const ActionInterpretInputSchema = z.object({
  text: z.string().min(1),
  knownActionTypes: z.array(z.string().min(1)).default([]),
  context: JsonObjectSchema.optional(),
});

export type ActionInterpretInput = z.infer<typeof ActionInterpretInputSchema>;

/**
 * Output for `action.interpret`.
 */
export const ActionInterpretOutputSchema = z.object({
  actionType: z.string().min(1),
  confidence: z.number().min(0).max(1),
  targets: z.array(z.string().min(1)).default([]),
  extras: JsonObjectSchema.default({}),
});

export type ActionInterpretOutput = z.infer<typeof ActionInterpretOutputSchema>;

/**
 * Parses narrative.write output payload.
 *
 * @param input - raw value
 */
export function parseNarrativeWriteOutput(input: unknown) {
  return NarrativeWriteOutputSchema.safeParse(input);
}

/**
 * Parses action.interpret output payload.
 *
 * @param input - raw value
 */
export function parseActionInterpretOutput(input: unknown) {
  return ActionInterpretOutputSchema.safeParse(input);
}
