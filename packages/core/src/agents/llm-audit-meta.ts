import type { JsonObject, JsonValue, LlmMessage } from "@rpengineext/contracts";

/**
 * Stable keys written into {@link AgentResult.rawMeta} by LLM adapters
 * for turn-trace audit (no secrets).
 */
export const LLM_AUDIT_META = {
  messages: "llmMessages",
  rawModelOutput: "rawModelOutput",
  model: "model",
  attempt: "attempt",
  repaired: "repaired",
} as const;

/**
 * Builds adapter audit metadata for tracing.
 *
 * @param input - messages actually sent + optional raw model text
 */
export function buildLlmAuditMeta(input: {
  readonly messages: readonly LlmMessage[];
  readonly rawModelOutput?: string;
  readonly model?: string;
  readonly attempt?: number;
  readonly repaired?: boolean;
}): JsonObject {
  const messages: JsonValue = input.messages.map((m) => {
    const row: { [key: string]: JsonValue } = {
      role: m.role,
      content: m.content,
    };
    if (m.name !== undefined) row.name = m.name;
    if (m.toolCallId !== undefined) row.toolCallId = m.toolCallId;
    if (m.toolCalls && m.toolCalls.length > 0) {
      row.toolCalls = m.toolCalls.map((call) => ({
        id: call.id,
        name: call.name,
        args: call.args,
      }));
    }
    return row;
  });

  const meta: { [key: string]: JsonValue } = {
    [LLM_AUDIT_META.messages]: messages,
  };
  if (input.rawModelOutput !== undefined) {
    meta[LLM_AUDIT_META.rawModelOutput] = input.rawModelOutput;
  }
  if (input.model !== undefined) {
    meta[LLM_AUDIT_META.model] = input.model;
  }
  if (input.attempt !== undefined) {
    meta[LLM_AUDIT_META.attempt] = input.attempt;
  }
  if (input.repaired !== undefined) {
    meta[LLM_AUDIT_META.repaired] = input.repaired;
  }
  return meta;
}

/**
 * Reads rendered LLM messages from agent rawMeta.
 *
 * @param rawMeta - agent result audit bag
 */
export function extractLlmMessages(
  rawMeta: JsonObject | undefined,
): LlmMessage[] | undefined {
  if (!rawMeta) return undefined;
  const raw = rawMeta[LLM_AUDIT_META.messages];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: LlmMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (
      (role === "system" ||
        role === "user" ||
        role === "assistant" ||
        role === "tool") &&
      typeof content === "string"
    ) {
      const msg: LlmMessage = { role, content };
      const name = (item as { name?: unknown }).name;
      const toolCallId = (item as { toolCallId?: unknown }).toolCallId;
      if (typeof name === "string") {
        out.push({ ...msg, name });
      } else if (typeof toolCallId === "string") {
        out.push({ ...msg, toolCallId });
      } else {
        out.push(msg);
      }
      continue;
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Reads raw model text from agent rawMeta.
 *
 * @param rawMeta - agent result audit bag
 */
export function extractRawModelOutput(
  rawMeta: JsonObject | undefined,
): string | undefined {
  if (!rawMeta) return undefined;
  const value = rawMeta[LLM_AUDIT_META.rawModelOutput];
  return typeof value === "string" ? value : undefined;
}
