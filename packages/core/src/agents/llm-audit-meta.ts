import type {
  JsonObject,
  JsonValue,
  LlmMessage,
  LlmToolCall,
  TokenUsage,
} from "@rpengineext/contracts";

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
  durationMs: "durationMs",
  promptProfile: "promptProfile",
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
  /** Narrative prompt profile ref `id@version` (ADR 0007 D6). */
  readonly promptProfile?: string;
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
  if (input.promptProfile !== undefined) {
    meta[LLM_AUDIT_META.promptProfile] = input.promptProfile;
  }
  return meta;
}

/**
 * Reads rendered LLM messages from agent rawMeta (including toolCalls).
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
    const row = item as Record<string, unknown>;
    const role = row.role;
    const content = row.content;
    if (
      !(
        role === "system" ||
        role === "user" ||
        role === "assistant" ||
        role === "tool"
      ) ||
      typeof content !== "string"
    ) {
      continue;
    }
    const msg: LlmMessage = { role, content };
    const extras: {
      name?: string;
      toolCallId?: string;
      toolCalls?: LlmToolCall[];
    } = {};
    if (typeof row.name === "string") extras.name = row.name;
    if (typeof row.toolCallId === "string") extras.toolCallId = row.toolCallId;
    const toolCalls = parseToolCalls(row.toolCalls);
    if (toolCalls) extras.toolCalls = toolCalls;
    out.push({ ...msg, ...extras });
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

/**
 * Reads model alias from agent rawMeta.
 *
 * @param rawMeta - agent result audit bag
 */
export function extractLlmModel(
  rawMeta: JsonObject | undefined,
): string | undefined {
  if (!rawMeta) return undefined;
  const value = rawMeta[LLM_AUDIT_META.model];
  return typeof value === "string" ? value : undefined;
}

/**
 * Reads durationMs from agent rawMeta when present.
 *
 * @param rawMeta - agent result audit bag
 */
export function extractLlmDurationMs(
  rawMeta: JsonObject | undefined,
): number | undefined {
  if (!rawMeta) return undefined;
  const value = rawMeta[LLM_AUDIT_META.durationMs];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads repaired flag from agent rawMeta.
 *
 * @param rawMeta - agent result audit bag
 */
export function extractLlmRepaired(
  rawMeta: JsonObject | undefined,
): boolean | undefined {
  if (!rawMeta) return undefined;
  return rawMeta[LLM_AUDIT_META.repaired] === true ? true : undefined;
}

/**
 * Passthrough helper for usage on AgentResult (typed).
 *
 * @param usage - optional token usage
 */
export function asTokenUsage(
  usage: TokenUsage | undefined,
): TokenUsage | undefined {
  return usage;
}

function parseToolCalls(raw: unknown): LlmToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: LlmToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    const args =
      row.args && typeof row.args === "object" && !Array.isArray(row.args)
        ? (row.args as LlmToolCall["args"])
        : {};
    out.push({ id: row.id, name: row.name, args });
  }
  return out.length > 0 ? out : undefined;
}
