import type {
  AgentTask,
  JsonObject,
  LlmMessage,
  NarrativePromptSection,
} from "@rpengineext/contracts";

/**
 * Builds chat messages for `narrative.write` LLM calls.
 *
 * Prompt body is assembled from compiled {@link NarrativePromptSection}s
 * (modules + core). Structured `brief` stays on the task for critics/traces
 * and is NOT dumped into the user message.
 *
 * @param task - agent task (input: brief/style/locale/history/promptSections)
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
  const sections = resolvePromptSections(input, brief, style);

  const languageRule = [
    `Locale: ${locale}.`,
    `Write ALL player-facing text (prose) in the language of locale "${locale}".`,
    "Do not switch to English unless the locale is en or an en-* variant.",
    "JSON keys stay in English; only string values shown to the player are localized.",
  ].join(" ");

  const systemCore = [
    "You are the game master (GM) for a turn-based interactive role-playing story.",
    "Narrate the immediate, coherent outcome of the player's CURRENT action only.",
    "The current action is in the latest user message.",
    "Prior user/assistant messages are earlier turns for continuity ONLY — never treat them as the action you must resolve now.",
    "Do not ignore the current action. Do not invent an unrelated random scene.",
    "Honor continuity: location, characters, tone, and open threads from history and the provided context blocks.",
    "Do not invent world facts, items, locations, or NPC knowledge beyond system context blocks and established history.",
    "Do not include secrets marked as forbidden in constraints.",
    "The player replies with free text on every turn.",
    "Output MUST be a single JSON object (no markdown fences) with this shape:",
    '{ "prose": string (non-empty), "meta"?: object }',
    languageRule,
    "prose is player-facing story text only.",
  ].join("\n");

  const systemSections = sections
    .filter((s) => s.channel === "system")
    .map(formatSection)
    .filter((t) => t.length > 0);

  const system =
    systemSections.length > 0
      ? [systemCore, ...systemSections].join("\n\n")
      : systemCore;

  const userSections = sections
    .filter((s) => s.channel === "user")
    .map(formatSection)
    .filter((t) => t.length > 0);

  return [
    { role: "system", content: system },
    ...history,
    {
      role: "user",
      content: formatNarrativeUserContent(playerAction, userSections),
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
 * Formats a prompt section for inclusion in system/user content.
 *
 * @param section - compiled section
 */
export function formatSection(section: NarrativePromptSection): string {
  const body = section.text.trim();
  if (!body) return "";
  const title = section.title?.trim();
  if (title && title.length > 0) {
    return `${title}\n${body}`;
  }
  return body;
}

/**
 * Builds core-owned style + constraint sections from assembled turn data.
 *
 * @param style - merged narrative style
 * @param denyMention - brief policy deny list
 * @param allowMention - brief policy allow list
 */
export function buildCoreNarrativePromptSections(input: {
  readonly style: JsonObject;
  readonly denyMention: readonly string[];
  readonly allowMention: readonly string[];
}): NarrativePromptSection[] {
  const sections: NarrativePromptSection[] = [];

  const styleLines = formatStyleLines(input.style);
  if (styleLines.length > 0) {
    sections.push({
      id: "core.style",
      channel: "system",
      title: "NARRATIVE STYLE",
      text: styleLines.join("\n"),
      priority: 40,
    });
  }

  const constraintLines: string[] = [];
  if (input.denyMention.length > 0) {
    constraintLines.push(
      `Do not mention or reveal: ${input.denyMention.join("; ")}`,
    );
  }
  if (input.allowMention.length > 0) {
    constraintLines.push(
      `Prefer mentioning when relevant: ${input.allowMention.join("; ")}`,
    );
  }
  if (constraintLines.length > 0) {
    sections.push({
      id: "core.constraints",
      channel: "user",
      title: "CONSTRAINTS",
      text: constraintLines.join("\n"),
      priority: 5,
    });
  }

  return sections;
}

/**
 * Deterministic section order: channel groups are separate; within channel
 * sort by priority asc, then id.
 *
 * @param sections - raw sections
 */
export function sortNarrativePromptSections(
  sections: readonly NarrativePromptSection[],
): NarrativePromptSection[] {
  return [...sections].sort((a, b) => {
    const pa = a.priority ?? 100;
    const pb = b.priority ?? 100;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Serializes prompt sections for task input / brief traces (JSON-safe).
 *
 * @param sections - ordered sections
 */
export function serializeNarrativePromptSections(
  sections: readonly NarrativePromptSection[],
): JsonObject[] {
  return sections.map((s) => ({
    id: s.id,
    channel: s.channel,
    ...(s.title ? { title: s.title } : {}),
    text: s.text,
    ...(s.priority !== undefined ? { priority: s.priority } : {}),
  }));
}

/**
 * Bridges legacy PromptFragmentProvider output into narrative prompt sections.
 *
 * @param fragments - fragments with ids already prefixed as `slot:id`
 */
export function sectionsFromPromptFragments(
  fragments: readonly { id: string; text: string; priority?: number }[],
): NarrativePromptSection[] {
  const out: NarrativePromptSection[] = [];
  for (const frag of fragments) {
    const text = frag.text.trim();
    if (!text) continue;
    const id = frag.id;
    if (id.startsWith("system:")) {
      out.push({
        id: id.slice("system:".length) || id,
        channel: "system",
        text,
        priority: frag.priority,
      });
      continue;
    }
    // narrate:/style:/other → user turn context
    const stripped = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    out.push({
      id: stripped || id,
      channel: "user",
      text,
      priority: frag.priority,
    });
  }
  return out;
}

function resolvePromptSections(
  input: AgentTask["input"],
  brief: JsonObject,
  style: JsonObject,
): NarrativePromptSection[] {
  const fromInput = input.narrativePromptSections;
  if (Array.isArray(fromInput) && fromInput.length > 0) {
    return sortNarrativePromptSections(
      fromInput.filter(isNarrativePromptSection),
    );
  }

  // Unit-test / direct-caller fallback: core style + policy only (no JSON dump).
  const policy = (brief.policy ?? {}) as JsonObject;
  const deny = Array.isArray(policy.denyMention)
    ? policy.denyMention.filter((x): x is string => typeof x === "string")
    : [];
  const allow = Array.isArray(policy.allowMention)
    ? policy.allowMention.filter((x): x is string => typeof x === "string")
    : [];

  return sortNarrativePromptSections(
    buildCoreNarrativePromptSections({
      style,
      denyMention: deny,
      allowMention: allow,
    }),
  );
}

function isNarrativePromptSection(value: unknown): value is NarrativePromptSection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.channel === "system" || v.channel === "user") &&
    typeof v.text === "string"
  );
}

function formatStyleLines(style: JsonObject): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(style).sort()) {
    const raw = style[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string") {
      const t = raw.trim();
      if (t) lines.push(`- ${key}: ${t}`);
      continue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      lines.push(`- ${key}: ${String(raw)}`);
      continue;
    }
    if (Array.isArray(raw)) {
      const parts = raw
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
      if (parts.length > 0) lines.push(`- ${key}: ${parts.join("; ")}`);
    }
  }
  return lines;
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
  userSections: readonly string[],
): string {
  const lines: string[] = [];
  const text =
    playerAction && typeof playerAction.text === "string"
      ? playerAction.text.trim()
      : "";

  if (text.length > 0) {
    lines.push("CURRENT PLAYER ACTION (resolve this now):");
    lines.push(text);
  } else {
    lines.push(
      "CURRENT PLAYER ACTION: (none provided — continue coherently from history and context only)",
    );
  }

  for (const block of userSections) {
    lines.push("");
    lines.push(block);
  }

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
