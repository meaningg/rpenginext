import type { AgentTask, JsonObject, LlmMessage } from "@rpengineext/contracts";

/**
 * Builds chat messages for `narrative.write` LLM calls.
 *
 * System-slot prompt fragments from modules (id prefix `system:`) are appended
 * to the system message and stripped from the user brief to avoid duplication.
 *
 * @param task - agent task (input: brief/style/locale/history)
 */
export function buildNarrativeWriteMessages(task: AgentTask): LlmMessage[] {
  const input = task.input;
  const brief = (input.brief ?? {}) as JsonObject;
  const style = (input.style ?? {}) as JsonObject;
  const locale =
    typeof input.locale === "string" && input.locale.trim().length > 0
      ? input.locale.trim()
      : "en";
  const history = normalizeHistory(input.history);
  const playerAction = resolvePlayerAction(input, brief);
  const { systemFragmentTexts, briefForUser } = splitSystemPromptFragments(brief);

  const languageRule = [
    `Locale: ${locale}.`,
    `Write ALL player-facing text (prose) in the language of locale "${locale}".`,
    "Do not switch to English unless the locale is en or an en-* variant.",
    "JSON keys stay in English; only string values shown to the player are localized.",
  ].join(" ");

  const systemCore = [
    "You are the game master (GM) for a turn-based interactive role-playing story.",
    "Narrate the immediate, coherent outcome of the player's CURRENT action only.",
    "The current action is brief.playerAction (and restated above the task JSON when present).",
    "Prior user/assistant messages are earlier turns for continuity ONLY — never treat them as the action you must resolve now.",
    "Do not ignore the current action. Do not invent an unrelated random scene.",
    "Honor continuity: location, characters, tone, and open threads from history and brief.",
    "Do not invent world facts, items, locations, or NPC knowledge beyond the brief, system canon/character blocks, and established history.",
    "Do not include secrets that the brief marks as forbidden.",
    "The player replies with free text on every turn.",
    "Output MUST be a single JSON object (no markdown fences) with this shape:",
    '{ "prose": string (non-empty), "meta"?: object }',
    languageRule,
    "prose is player-facing story text only.",
  ].join("\n");

  const system =
    systemFragmentTexts.length > 0
      ? [systemCore, ...systemFragmentTexts].join("\n\n")
      : systemCore;

  const userPayload = {
    taskType: "narrative.write",
    turnId: task.turnId,
    playerAction,
    brief: briefForUser,
    style,
    locale,
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
 * @param hints - optional extra repair hints
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
    'Required shape: { "prose": string (non-empty), "meta"?: object }.',
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

/**
 * Lifts `system:*` prompt fragments into system message texts and returns a brief
 * copy without those fragments (other slots stay in the user payload).
 *
 * @param brief - narrative brief object
 */
export function splitSystemPromptFragments(brief: JsonObject): {
  systemFragmentTexts: string[];
  briefForUser: JsonObject;
} {
  const raw = brief.promptFragments;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { systemFragmentTexts: [], briefForUser: brief };
  }

  const systemFragmentTexts: string[] = [];
  const remaining: JsonObject[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const frag = item as JsonObject;
    const id = typeof frag.id === "string" ? frag.id : "";
    const text = typeof frag.text === "string" ? frag.text.trim() : "";
    if (id.startsWith("system:") && text.length > 0) {
      systemFragmentTexts.push(text);
      continue;
    }
    remaining.push(frag);
  }

  if (remaining.length === raw.length) {
    return { systemFragmentTexts, briefForUser: brief };
  }

  const { promptFragments: _removed, ...rest } = brief;
  void _removed;
  const briefForUser: JsonObject =
    remaining.length === 0
      ? { ...rest }
      : { ...rest, promptFragments: remaining };
  return { systemFragmentTexts, briefForUser };
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

  if (text.length > 0) {
    lines.push("CURRENT PLAYER ACTION (resolve this now):");
    lines.push(text);
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
