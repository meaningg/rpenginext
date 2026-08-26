import type {
  AgentTask,
  JsonObject,
  LlmMessage,
  NarrativePromptSection,
} from "@rpengineext/contracts";

import { DEFAULT_TURN_LOCALE } from "../../util/locale.ts";
import { getBuiltinDefaultProfile } from "./builtin-default-profile.ts";
import {
  resolvePromptTemplate,
  type PromptPlaceholderContext,
} from "./placeholder-resolver.ts";
import type { NarrativePromptProfile } from "./profile-types.ts";

/** Метка текущего действия игрока в user-сообщении narrative.write (default-профиль). */
export const PLAYER_ACTION_LABEL =
  getBuiltinDefaultProfile().labels.playerAction;

/**
 * Builds chat messages for `narrative.write` LLM calls.
 *
 * Prompt body comes from the given {@link NarrativePromptProfile} (ADR 0007):
 * system core + rules reminder templates with `{{...}}` placeholders are
 * resolved per turn; compiled {@link NarrativePromptSection}s (modules + core)
 * are merged on top. Structured `brief` stays on the task for critics/traces
 * and is NOT dumped into the user message.
 *
 * @param task - agent task (input: brief/style/locale/history/promptSections)
 * @param profile - narrative prompt profile; defaults to built-in `default@1.0.0`
 */
export function buildNarrativeWriteMessages(
  task: AgentTask,
  profile: NarrativePromptProfile = getBuiltinDefaultProfile(),
): LlmMessage[] {
  const input = task.input;
  const brief = (input.brief ?? {}) as JsonObject;
  const style = (input.style ?? {}) as JsonObject;
  const locale =
    typeof input.locale === "string" && input.locale.trim().length > 0
      ? input.locale.trim()
      : DEFAULT_TURN_LOCALE;
  const history = normalizeHistory(input.history);
  const playerAction = resolvePlayerAction(input, brief);
  const sections = resolvePromptSections(input, brief, style);

  const placeholderCtx: PromptPlaceholderContext = {
    locale,
    lengthGuidance: buildLengthGuidance(style),
    playerActionLabel: profile.labels.playerAction,
  };
  const systemCore = resolveRequired(profile.systemCore, placeholderCtx);
  const rulesReminder = resolveRequired(profile.rulesReminder, placeholderCtx);

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
      content: formatNarrativeUserContent(
        playerAction,
        userSections,
        rulesReminder,
        profile.labels.playerAction,
      ),
    },
  ];
}

/**
 * Builds a repair user message after schema validation failure, from the
 * profile's repair templates (ADR 0007).
 *
 * @param base - original messages
 * @param previousText - model output that failed validation
 * @param issues - human-readable validation issues
 * @param hints - optional extra repair hints
 * @param profile - narrative prompt profile; defaults to built-in
 */
export function buildNarrativeWriteRepairMessages(
  base: readonly LlmMessage[],
  previousText: string,
  issues: string,
  hints: readonly string[] = [],
  profile: NarrativePromptProfile = getBuiltinDefaultProfile(),
): LlmMessage[] {
  const lines: string[] = [profile.repair.title];
  const repairCtx: PromptPlaceholderContext = {
    issues,
    hints: hints.join("\n"),
  };
  for (const instruction of profile.repair.instructions) {
    lines.push(resolveRequired(instruction, repairCtx));
  }
  if (hints.length > 0) {
    lines.push(profile.repair.hintsTitle);
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
      `Не упоминай и не раскрывай: ${input.denyMention.join("; ")}`,
    );
  }
  if (input.allowMention.length > 0) {
    constraintLines.push(
      `Предпочтительно упоминать, когда уместно: ${input.allowMention.join("; ")}`,
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

/**
 * Компактная служебная памятка ключевых правил повествования для текущего хода
 * (из default-профиля). Добавляется только в сообщение текущего действия игрока
 * и не сохраняется в history: прошлые пары остаются чистыми. Держит модель в
 * контракте на длинных сессиях, когда внимание к длинному system-промпту размывается.
 */
export function buildRulesReminder(): string {
  return getBuiltinDefaultProfile().rulesReminder;
}

/**
 * Сообщение текущего действия игрока: метка + текст + служебная памятка +
 * user-секции (CONSTRAINTS и др.). Памятка только здесь — history её не содержит.
 *
 * @param playerAction - current action payload (or null)
 * @param userSections - compiled user-channel prompt sections
 * @param rulesReminder - profile rules reminder text (default: built-in)
 * @param playerActionLabel - action label from the active profile
 */
export function formatNarrativeUserContent(
  playerAction: JsonObject | null,
  userSections: readonly string[],
  rulesReminder: string = buildRulesReminder(),
  playerActionLabel: string = PLAYER_ACTION_LABEL,
): string {
  const lines: string[] = [];
  const text =
    playerAction && typeof playerAction.text === "string"
      ? playerAction.text.trim()
      : "";

  if (text.length > 0) {
    lines.push(`${playerActionLabel} ${text}`);
  } else {
    lines.push(
      `${playerActionLabel} (не указано — продолжай связно из истории и контекста)`,
    );
  }

  lines.push("");
  lines.push(rulesReminder);

  for (const block of userSections) {
    lines.push("");
    lines.push(block);
  }

  return lines.join("\n");
}

function buildLengthGuidance(style: JsonObject): string {
  const raw = style.length;
  const length =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  if (length) {
    return [
      `Мягкий ориентир длины prose — около 120–150 слов, но приоритет у NARRATIVE STYLE.length = «${length}»:`,
      "short — заметно короче; medium — около ориентира; long — можно длиннее; иные значения length трактуй в том же духе.",
      "Это ориентир, не жёсткий лимит символов.",
    ].join(" ");
  }

  return [
    "Мягкий ориентир длины prose — около 120–150 слов.",
    "Если в секции NARRATIVE STYLE задан length — приоритет у него (short короче, long длиннее, medium ≈ ориентир).",
    "Это ориентир, не жёсткий лимит символов.",
  ].join(" ");
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

/**
 * Resolves a profile template; unreachable for boot-validated profiles, so a
 * failure here throws loud instead of silently substituting empty text (P9).
 *
 * @param template - profile template text
 * @param ctx - placeholder values
 */
function resolveRequired(
  template: string,
  ctx: PromptPlaceholderContext,
): string {
  const result = resolvePromptTemplate(template, ctx);
  if (!result.ok) {
    throw new Error(`narrative prompt profile error: ${result.error.message}`);
  }
  return result.value;
}
