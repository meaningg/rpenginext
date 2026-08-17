import type { AgentTask, JsonObject, LlmMessage } from "@rpengineext/contracts";

/**
 * Builds chat messages for `narrative.write` LLM calls.
 *
 * @param task - agent task (input: brief/style/locale/maxChoices)
 */
export function buildNarrativeWriteMessages(task: AgentTask): LlmMessage[] {
  const input = task.input;
  const brief = (input.brief ?? {}) as JsonObject;
  const style = (input.style ?? {}) as JsonObject;
  const locale =
    typeof input.locale === "string" && input.locale.length > 0
      ? input.locale
      : "en";
  const maxChoices =
    typeof input.maxChoices === "number" && input.maxChoices > 0
      ? input.maxChoices
      : 3;

  const system = [
    "You are the narrative writer for a turn-based interactive storybook engine.",
    "Write the next passage based ONLY on the provided brief and style.",
    "Do not invent world facts, items, locations, or NPC knowledge beyond the brief.",
    "Do not include secrets that the brief marks as forbidden.",
    "Output MUST be a single JSON object (no markdown fences) with this shape:",
    '{ "prose": string (non-empty), "choiceDrafts": [ { "id": string, "label": string, "kind"?: string, "enabled"?: boolean } ], "meta"?: object }',
    `Locale: ${locale}. Prefer at most ${maxChoices} choiceDrafts (may be empty).`,
    "prose is player-facing story text. choiceDrafts are optional short next-step labels.",
  ].join("\n");

  const userPayload = {
    taskType: "narrative.write",
    turnId: task.turnId,
    brief,
    style,
    locale,
    maxChoices,
  };

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify(userPayload, null, 2),
    },
  ];
}

/**
 * Builds a repair user message after schema validation failure.
 *
 * @param base - original messages
 * @param previousText - model output that failed validation
 * @param issues - human-readable validation issues
 */
export function buildNarrativeWriteRepairMessages(
  base: readonly LlmMessage[],
  previousText: string,
  issues: string,
  hints: readonly string[] = [],
): LlmMessage[] {
  const lines = [
    "Your previous JSON failed schema validation.",
    "Fix and return ONLY valid JSON for narrative.write.",
    `Validation issues: ${issues}`,
  ];
  if (hints.length > 0) {
    lines.push("Additional repair hints:");
    for (const hint of hints) {
      lines.push(`- ${hint}`);
    }
  }
  return [
    ...base,
    { role: "assistant", content: previousText },
    {
      role: "user",
      content: lines.join("\n"),
    },
  ];
}
