import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema, type JsonObject } from "../json.ts";
import type { Failure, Result } from "../result.ts";

export const AgentRequesterSchema = z.object({
  kind: z.enum(["core", "module"]),
  id: z.string().min(1),
});

export type AgentRequester = z.infer<typeof AgentRequesterSchema>;

export const AgentTaskConstraintsSchema = z.object({
  timeoutMs: z.number().int().positive(),
  maxRepairAttempts: z.number().int().nonnegative(),
  temperature: z.number().min(0).max(2).optional(),
  tools: z.array(z.string().min(1)).optional(),
  optional: z.boolean().default(false),
});

export type AgentTaskConstraints = z.infer<typeof AgentTaskConstraintsSchema>;

/**
 * Orchestrator task request. Modules never call LLM SDKs directly.
 */
export const AgentTaskSchema = z.object({
  taskId: IdStringSchema,
  type: z.string().min(1),
  turnId: IdStringSchema,
  input: JsonObjectSchema,
  /** Logical schema id or inline JSON-schema object reference handled by core. */
  outputSchemaId: z.string().min(1).optional(),
  constraints: AgentTaskConstraintsSchema,
  requester: AgentRequesterSchema,
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const AgentErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  retriable: z.boolean().optional(),
});

export type AgentError = z.infer<typeof AgentErrorSchema>;

export const AgentResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    taskId: IdStringSchema,
    data: JsonObjectSchema,
    usage: TokenUsageSchema.optional(),
    rawMeta: JsonObjectSchema.optional(),
  }),
  z.object({
    ok: z.literal(false),
    taskId: IdStringSchema,
    error: AgentErrorSchema,
  }),
]);

export type AgentResult = z.infer<typeof AgentResultSchema>;

/**
 * Parses an agent task request.
 *
 * @param input - raw value
 */
export function parseAgentTask(input: unknown) {
  return AgentTaskSchema.safeParse(input);
}

/**
 * Parses an agent result.
 *
 * @param input - raw value
 */
export function parseAgentResult(input: unknown) {
  return AgentResultSchema.safeParse(input);
}

// Re-export Failure name usage for consumers importing agents only.
export type { Result, Failure };
