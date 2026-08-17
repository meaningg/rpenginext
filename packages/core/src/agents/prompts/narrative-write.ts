import type { AgentTask, JsonObject, LlmMessage } from "@rpengineext/contracts";

/**
 * Builds chat messages for `narrative.write` LLM calls.
 *
 * @param task - agent task (input: brief/style/locale/maxChoices/history)
 */
export function buildNarrativeWriteMessages(task: AgentTask): LlmMessage[] {
  const input = task.input;
  const brief = (input.brief ?? {}) as JsonObject;
  const style = (input.style ?? {}) as JsonObject;
  const locale =
    typeof input.locale === "string" && input.locale.trim().length > 0
      ? input.locale.trim()
      : "en";
  const rawMax = input.maxChoices;
  const maxChoices =
    typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax >= 0
      ? Math.floor(rawMax)
      : 0;
  const choicesEnabled = maxChoices > 0;
  const history = normalizeHistory(input.history);
  const playerAction = resolvePlayerAction(input, brief);

  const languageRule = [
    `Locale: ${locale}.`,
    `Write ALL player-facing text (prose${choicesEnabled ? " and choiceDrafts labels" : ""}) in the language of locale "${locale}".`,
    "Do not switch to English unless the locale is en or an en-* variant.",
    "JSON keys stay in English; only string values shown to the player are localized.",
  ].join(" ");

  const gmRules = [
    "You are the game master (GM) for a turn-based interactive role-playing story.",
    "Narrate the immediate, coherent outcome of the player's CURRENT action only.",
    "The current action is brief.playerAction (and restated above the task JSON when present).",
    "Prior user/assistant messages are earlier turns for continuity ONLY — never treat them as the action you must resolve now.",
    "Do not ignore the current action. Do not invent an unrelated random scene.",
    "Honor continuity: location, characters, tone, and open threads from history and brief.",
    "Do not invent world facts, items, locations, or NPC knowledge beyond the brief and established history.",
    "Do not include secrets that the brief marks as forbidden.",
  ];

  const system = choicesEnabled
    ? [
        ...gmRules,
        "Output MUST be a single JSON object (no markdown fences) with this shape:",
        '{ "prose": string (non-empty), "choiceDrafts": [ { "id": string, "label": string, "kind"?: string, "enabled"?: boolean } ], "meta"?: object }',
        languageRule,
        `Prefer at most ${maxChoices} choiceDrafts (may be empty).`,
        "prose is player-facing story text. choiceDrafts are optional short next-step labels.",
      ].join("\n")
    : [
        ...gmRules,
        "The player always responds with FREE TEXT only — never multiple-choice options.",
        "Do NOT suggest menu choices, numbered options, or 'what will you do' choice lists.",
        "Output MUST be a single JSON object (no markdown fences) with this shape:",
        '{ "prose": string (non-empty), "choiceDrafts": [], "meta"?: object }',
        languageRule,
        "choiceDrafts MUST be an empty array.",
        "prose is player-facing story text only; the player will type their next action freely.",
      ].join("\n");

  const userPayload = {
    taskType: "narrative.write",
    turnId: task.turnId,
    playerAction,
    brief,
    style,
    locale,
    maxChoices,
    playerInputMode: choicesEnabled ? "choices_allowed" : "free_text_only",
  };

  return [
    { role: "system", content: system },
    ...history,
    {
      role: "user",
      content: formatNarrativeUserContent(playerAction, userPayload),
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
    'Required shape: { "prose": string, "choiceDrafts": [] (empty unless maxChoices>0), "meta"?: object }.',
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

function resolvePlayerAction(
  input: AgentTask["input"],
  brief: JsonObject,
): JsonObject | null {
  const top = input.playerAction;
  if (top && typeof top === "object" && !Array.isArray(top)) {
    return top as JsonObject;
  }
  const fromBrief = brief.playerAction;
  if (fromBrief && typeof fromBrief === "object" && !Array.isArray(fromBrief)) {
    return fromBrief as JsonObject;
  }
  return null;
}

function formatNarrativeUserContent(
  playerAction: JsonObject | null,
  userPayload: JsonObject,
): string {
  const lines: string[] = [];
  const text =
    playerAction && typeof playerAction.text === "string"
      ? playerAction.text.trim()
      : "";
  const choiceId =
    playerAction && typeof playerAction.choiceId === "string"
      ? playerAction.choiceId
      : "";

  if (text.length > 0) {
    lines.push("CURRENT PLAYER ACTION (resolve this now):");
    lines.push(text);
    lines.push("");
  } else if (choiceId.length > 0) {
    lines.push("CURRENT PLAYER CHOICE (resolve this now):");
    lines.push(choiceId);
    lines.push("");
  } else {
    lines.push(
      "CURRENT PLAYER ACTION: (none provided — continue coherently from history and brief only)",
    );
    lines.push("");
  }

  lines.push("TASK JSON:");
  lines.push(JSON.stringify(userPayload, null, 2));
  return lines.join("\n");
}

function normalizeHistory(raw: unknown): LlmMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: LlmMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.length > 0
    ) {
      out.push({ role, content });
    }
  }
  return out;
}
