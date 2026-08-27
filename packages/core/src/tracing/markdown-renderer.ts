import {
  TRACE_FORMAT_VERSION,
  type JsonObject,
  type LlmMessage,
} from "@rpengineext/contracts";

import type {
  TraceAgentRecord,
  TraceCommandRecord,
  TraceFollowUpRecord,
  TraceToolRecord,
  TurnTraceDocument,
} from "./turn-tracer.ts";
import type { StateDiffEntry } from "../util/state-diff.ts";

/**
 * Renders a turn trace document to normative markdown (operator dossier).
 *
 * @param doc - collected trace document
 * @param options - render options
 */
export function renderTurnTraceMarkdown(
  doc: TurnTraceDocument,
  options: {
    readonly maxStringFieldChars: number;
    readonly maxArrayItems: number;
  },
): string {
  const lines: string[] = [];
  const trunc = (value: unknown) =>
    truncateValue(value, options.maxStringFieldChars, options.maxArrayItems);

  lines.push(`# Turn trace \`${doc.turnId}\``);
  lines.push("");
  lines.push(`- traceFormatVersion: \`${TRACE_FORMAT_VERSION}\``);
  lines.push(`- session: \`${doc.sessionId}\``);
  lines.push(`- turnKind: \`${doc.turnKind}\``);
  lines.push(`- outcome: **${doc.outcome}**`);
  lines.push(`- startedAt: \`${doc.startedAt}\``);
  lines.push(`- finishedAt: \`${doc.finishedAt}\``);
  lines.push(`- durationMs: \`${doc.durationMs}\``);
  lines.push(`- stateRevisionBefore: \`${doc.stateRevisionBefore}\``);
  lines.push(`- stateRevisionAfter: \`${doc.stateRevisionAfter}\``);
  if (doc.followUps.length > 0) {
    lines.push(`- followUps: \`${doc.followUps.length}\``);
  }
  lines.push(`- atomicity: \`full\``);
  lines.push(
    `- enabledModules: ${doc.enabledModules.map((m) => `\`${m.id}@${m.version}\``).join(", ") || "_none_"}`,
  );
  if (doc.failure) {
    lines.push(
      `- failure: \`${doc.failure.code}\` — ${doc.failure.message} (stage: ${doc.failure.stage ?? "?"})`,
    );
  }
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  if (doc.outcome === "committed") {
    lines.push(
      `Turn committed successfully. Revision ${doc.stateRevisionBefore} → ${doc.stateRevisionAfter}.`,
    );
  } else {
    lines.push(
      `Turn rejected. ROLLBACK to revision ${doc.stateRevisionBefore} (no authoritative changes).`,
    );
  }
  if (doc.followUps.length > 0) {
    const parts = doc.followUps.map(
      (f) =>
        `\`${f.reason}\` (${f.outcome}, rev ${f.stateRevisionBefore}→${f.stateRevisionAfter})`,
    );
    lines.push(`Follow-ups in this file: ${parts.join("; ")}.`);
  }
  lines.push("");

  renderInputSection(lines, doc, trunc);
  renderTimeline(lines, doc.timeline);
  renderAgentsSection(lines, doc.agents, trunc);
  renderToolCallsSection(lines, doc.toolCalls, trunc);
  renderCommandsSection(lines, doc.commands, trunc);
  renderStateDiffSection(lines, doc.stateDiff, doc.outcome, doc.stateRevisionBefore, trunc);
  renderNarrativeSection(lines, doc, trunc);
  renderPassageSection(lines, doc.passage, trunc);

  if (doc.followUps.length > 0) {
    lines.push("## Follow-ups");
    lines.push("");
    for (const fu of doc.followUps) {
      renderFollowUp(lines, fu, trunc);
    }
  }

  lines.push("## Persistence");
  lines.push("");
  lines.push(doc.persistenceNote ?? "_n/a_");
  lines.push("");

  lines.push("## Module notes");
  lines.push("");
  if (doc.moduleNotes.length === 0) {
    lines.push("_None._");
  } else {
    for (const note of doc.moduleNotes) {
      lines.push(`### ${note.namespace} / ${note.title}`);
      lines.push("");
      lines.push(note.body);
      if (note.data) {
        lines.push("");
        lines.push("```json");
        lines.push(stableJson(trunc(note.data)));
        lines.push("```");
      }
      lines.push("");
    }
  }
  if (doc.moduleNotes.length === 0) {
    lines.push("");
  }

  lines.push("## Warnings / errors");
  lines.push("");
  const allWarnings = [
    ...doc.warnings,
    ...doc.followUps.flatMap((f) =>
      f.warnings.map((w) => `[follow-up ${f.reason}] ${w}`),
    ),
  ];
  if (allWarnings.length === 0 && !doc.failure) {
    lines.push("_None._");
  } else {
    for (const warning of allWarnings) {
      lines.push(`- warn: ${warning}`);
    }
    if (doc.failure) {
      lines.push(`- error: \`${doc.failure.code}\` ${doc.failure.message}`);
      if (doc.failure.details !== undefined) {
        lines.push("```json");
        lines.push(stableJson(trunc(doc.failure.details)));
        lines.push("```");
      }
    }
  }
  lines.push("");

  return lines.join("\n");
}

function renderInputSection(
  lines: string[],
  doc: TurnTraceDocument,
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## Input");
  lines.push("");
  lines.push("```json");
  lines.push(stableJson(trunc(compactPlayerInput(doc.rawInput))));
  lines.push("```");

  if (doc.intent) {
    lines.push("");
    lines.push("### Intent");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(doc.intent)));
    lines.push("```");
  }

  if (doc.normalizedAction && shouldShowNormalized(doc.rawInput, doc.normalizedAction)) {
    lines.push("");
    lines.push("### Normalized action");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(compactNormalized(doc.normalizedAction))));
    lines.push("```");
  }
  lines.push("");
}

function renderTimeline(
  lines: string[],
  timeline: TurnTraceDocument["timeline"],
): void {
  lines.push("## Timeline");
  lines.push("");
  lines.push("| # | stage | status | durationMs | notes |");
  lines.push("|---|-------|--------|------------|-------|");
  timeline.forEach((row, index) => {
    lines.push(
      `| ${index} | ${row.stage} | ${row.status} | ${row.durationMs} | ${escapeCell(row.notes ?? "")} |`,
    );
  });
  lines.push("");
}

function renderAgentsSection(
  lines: string[],
  agents: readonly TraceAgentRecord[],
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## Agents");
  lines.push("");
  if (agents.length === 0) {
    lines.push("_No agent calls._");
    lines.push("");
    return;
  }
  for (const agent of agents) {
    renderAgent(lines, agent, trunc);
  }
}

function renderAgent(
  lines: string[],
  agent: TraceAgentRecord,
  trunc: (value: unknown) => unknown,
): void {
  lines.push(`### Agent task \`${agent.taskId}\` (\`${agent.type}\`)`);
  lines.push("");
  lines.push(`- status: **${agent.status}**`);
  lines.push(`- requester: \`${agent.requester}\``);
  if (agent.model) lines.push(`- model: \`${agent.model}\``);
  if (agent.durationMs !== undefined) {
    lines.push(`- durationMs: \`${agent.durationMs}\``);
  }
  if (agent.usage) {
    const u = agent.usage;
    const parts = [
      u.promptTokens !== undefined ? `prompt=${u.promptTokens}` : null,
      u.completionTokens !== undefined
        ? `completion=${u.completionTokens}`
        : null,
      u.totalTokens !== undefined ? `total=${u.totalTokens}` : null,
    ].filter(Boolean);
    if (parts.length > 0) lines.push(`- usage: ${parts.join(", ")}`);
  }
  if (agent.repaired) lines.push(`- repaired: \`true\``);
  if (agent.error) lines.push(`- error: \`${agent.error}\``);
  lines.push("");

  const hasPrompts = Boolean(agent.prompts && agent.prompts.length > 0);
  lines.push("#### Input");
  lines.push("");
  lines.push("```json");
  lines.push(stableJson(trunc(compactAgentInput(agent.input, hasPrompts))));
  lines.push("```");
  lines.push("");

  if (hasPrompts && agent.prompts) {
    lines.push("#### LLM transcript");
    lines.push("");
    for (let i = 0; i < agent.prompts.length; i++) {
      renderPromptMessage(lines, i, agent.prompts[i]!, trunc);
    }
  }

  if (agent.rawModelOutput !== undefined) {
    lines.push("#### Raw model output");
    lines.push("");
    lines.push("```");
    lines.push(String(trunc(agent.rawModelOutput)));
    lines.push("```");
    lines.push("");
  }

  lines.push("#### Output");
  lines.push("");
  lines.push("```json");
  lines.push(stableJson(trunc(agent.output ?? null)));
  lines.push("```");
  lines.push("");
}

function renderPromptMessage(
  lines: string[],
  index: number,
  msg: LlmMessage,
  trunc: (value: unknown) => unknown,
): void {
  const meta: string[] = [`role="${msg.role}"`];
  if (msg.name) meta.push(`name="${msg.name}"`);
  if (msg.toolCallId) meta.push(`toolCallId="${msg.toolCallId}"`);
  if (msg.toolCalls?.length) {
    meta.push(`toolCalls=${msg.toolCalls.length}`);
  }
  lines.push(`##### [${index}] ${meta.join(" ")}`);
  lines.push("");

  const content = msg.content ?? "";
  if (content.trim().length > 0) {
    lines.push("```");
    lines.push(String(trunc(content)));
    lines.push("```");
    lines.push("");
  } else if (!msg.toolCalls?.length) {
    lines.push("_empty_");
    lines.push("");
  }

  if (msg.toolCalls?.length) {
    for (const call of msg.toolCalls) {
      lines.push(`###### tool_call \`${call.id}\` \`${call.name}\``);
      lines.push("");
      lines.push("```json");
      lines.push(stableJson(trunc(call.args ?? {})));
      lines.push("```");
      lines.push("");
    }
  }
}

function renderToolCallsSection(
  lines: string[],
  tools: readonly TraceToolRecord[],
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## Tool calls");
  lines.push("");
  if (tools.length === 0) {
    lines.push("_None._");
    lines.push("");
    return;
  }
  for (const tool of tools) {
    renderTool(lines, tool, trunc);
  }
}

function renderTool(
  lines: string[],
  tool: TraceToolRecord,
  trunc: (value: unknown) => unknown,
): void {
  const status = tool.error ? `error` : "ok";
  lines.push(`### \`${tool.toolName}\` (\`${tool.callId}\`) — **${status}**`);
  lines.push("");
  if (tool.parentTaskId) {
    lines.push(`- parentTaskId: \`${tool.parentTaskId}\``);
  }
  if (tool.durationMs !== undefined) {
    lines.push(`- durationMs: \`${tool.durationMs}\``);
  }
  if (tool.error) {
    lines.push(`- error: \`${tool.error}\``);
  }
  lines.push("");
  lines.push("#### Arguments");
  lines.push("");
  lines.push("```json");
  lines.push(stableJson(trunc(tool.args ?? {})));
  lines.push("```");
  lines.push("");
  if (tool.result !== undefined) {
    lines.push("#### Result");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(tool.result)));
    lines.push("```");
    lines.push("");
  }
}

function renderCommandsSection(
  lines: string[],
  commands: readonly TraceCommandRecord[],
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## Commands");
  lines.push("");
  if (commands.length === 0) {
    lines.push("_No commands._");
    lines.push("");
    return;
  }
  for (const cmd of commands) {
    const mark = cmd.accepted ? "accept" : "reject";
    lines.push(
      `- **${mark}** \`${cmd.command.type}\` (\`${cmd.command.commandId}\`)${cmd.reason ? ` — ${cmd.reason}` : ""}`,
    );
  }
  lines.push("");
  lines.push("```json");
  lines.push(stableJson(trunc(commands.map((c) => compactCommand(c.command)))));
  lines.push("```");
  lines.push("");
}

function renderStateDiffSection(
  lines: string[],
  stateDiff: readonly StateDiffEntry[],
  outcome: string,
  revisionBefore: number,
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## State diff");
  lines.push("");
  if (outcome === "rejected") {
    lines.push(
      `ROLLBACK to revision ${revisionBefore} (no authoritative changes)`,
    );
    lines.push("");
  }
  if (stateDiff.length === 0) {
    lines.push("_No differences._");
  } else {
    for (const entry of stateDiff) {
      lines.push(`- \`${entry.path}\``);
      if (entry.before !== undefined) {
        lines.push(`  - before: ${formatDiffValue(trunc(entry.before))}`);
      }
      if (entry.after !== undefined) {
        lines.push(`  - after: ${formatDiffValue(trunc(entry.after))}`);
      }
      if (entry.before === undefined && entry.after === undefined) {
        lines.push(`  - _(marker only)_`);
      }
    }
  }
  lines.push("");
}

function renderNarrativeSection(
  lines: string[],
  doc: TurnTraceDocument,
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## Narrative");
  lines.push("");
  if (doc.narrativeProse) {
    lines.push("### Prose");
    lines.push("");
    lines.push(String(trunc(doc.narrativeProse)));
    lines.push("");
  } else {
    lines.push("_No narrative prose._");
    lines.push("");
  }
  if (doc.narrativeBrief) {
    lines.push("### Brief");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(compactNarrativeBrief(doc.narrativeBrief))));
    lines.push("```");
    lines.push("");
  }
  if (doc.criticResults && doc.criticResults.length > 0) {
    lines.push("### Critic results");
    lines.push("");
    const meta: string[] = [];
    if (doc.criticRounds !== undefined) {
      meta.push(`criticRounds: ${doc.criticRounds}`);
    }
    if (doc.criticAccepted !== undefined) {
      meta.push(`criticAccepted: ${doc.criticAccepted}`);
    }
    if (meta.length > 0) {
      lines.push(`> ${meta.join(" · ")}`);
      lines.push("");
    }
    for (const result of doc.criticResults) {
      lines.push(`**Round ${result.round}**`);
      lines.push("");
      for (const reason of result.reasons) {
        lines.push(`- ${String(trunc(reason))}`);
      }
      lines.push("");
    }
    if (doc.criticAccepted) {
      lines.push("_Budget exhausted — last draft accepted._");
      lines.push("");
    }
  }
}

function renderPassageSection(
  lines: string[],
  passage: TurnTraceDocument["passage"],
  trunc: (value: unknown) => unknown,
): void {
  lines.push("## Passage");
  lines.push("");
  if (passage) {
    lines.push("```json");
    lines.push(stableJson(trunc(passage)));
    lines.push("```");
  } else {
    lines.push("_No passage._");
  }
  lines.push("");
}

function renderFollowUp(
  lines: string[],
  fu: TraceFollowUpRecord,
  trunc: (value: unknown) => unknown,
): void {
  lines.push(
    `### System turn \`${fu.turnId}\` (\`${fu.reason}\`) — **${fu.outcome}**`,
  );
  lines.push("");
  lines.push(`- turnKind: \`${fu.turnKind}\``);
  lines.push(`- durationMs: \`${fu.durationMs}\``);
  lines.push(
    `- revision: \`${fu.stateRevisionBefore}\` → \`${fu.stateRevisionAfter}\``,
  );
  if (fu.failure) {
    lines.push(
      `- failure: \`${fu.failure.code}\` — ${fu.failure.message}`,
    );
  }
  lines.push("");

  if (fu.timeline.length > 0) {
    lines.push("#### Timeline");
    lines.push("");
    lines.push("| # | stage | status | durationMs | notes |");
    lines.push("|---|-------|--------|------------|-------|");
    fu.timeline.forEach((row, index) => {
      lines.push(
        `| ${index} | ${row.stage} | ${row.status} | ${row.durationMs} | ${escapeCell(row.notes ?? "")} |`,
      );
    });
    lines.push("");
  }

  if (fu.agents.length > 0) {
    lines.push("#### Agents");
    lines.push("");
    for (const agent of fu.agents) {
      renderAgent(lines, agent, trunc);
    }
  }

  if (fu.toolCalls.length > 0) {
    lines.push("#### Tool calls");
    lines.push("");
    for (const tool of fu.toolCalls) {
      renderTool(lines, tool, trunc);
    }
  }

  if (fu.commands.length > 0) {
    lines.push("#### Commands");
    lines.push("");
    for (const cmd of fu.commands) {
      const mark = cmd.accepted ? "accept" : "reject";
      lines.push(
        `- **${mark}** \`${cmd.command.type}\` (\`${cmd.command.commandId}\`)${cmd.reason ? ` — ${cmd.reason}` : ""}`,
      );
    }
    lines.push("");
    lines.push("```json");
    lines.push(
      stableJson(trunc(fu.commands.map((c) => compactCommand(c.command)))),
    );
    lines.push("```");
    lines.push("");
  }

  if (fu.stateDiff.length > 0) {
    lines.push("#### State diff");
    lines.push("");
    for (const entry of fu.stateDiff) {
      lines.push(`- \`${entry.path}\``);
      if (entry.before !== undefined) {
        lines.push(`  - before: ${formatDiffValue(trunc(entry.before))}`);
      }
      if (entry.after !== undefined) {
        lines.push(`  - after: ${formatDiffValue(trunc(entry.after))}`);
      }
    }
    lines.push("");
  }

  if (fu.persistenceNote) {
    lines.push(`- persistence: ${fu.persistenceNote}`);
    lines.push("");
  }

  for (const note of fu.moduleNotes) {
    lines.push(`#### Note: ${note.namespace} / ${note.title}`);
    lines.push("");
    lines.push(note.body);
    lines.push("");
  }
}

/** Compact player action for the Input header (no nested payload dumps when huge). */
function compactPlayerInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "free_text") {
    return { kind: "free_text", text: obj.text };
  }
  if (obj.kind === "system") {
    return {
      kind: "system",
      text: obj.text,
      ...(obj.payload !== undefined
        ? { payload: compactSystemPayload(obj.payload) }
        : {}),
    };
  }
  return raw;
}

function compactSystemPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof p.sourceTurnId === "string") out.sourceTurnId = p.sourceTurnId;
  if (typeof p.userText === "string") out.userText = p.userText;
  if (typeof p.prose === "string") {
    out.prose = p.prose;
    out.proseChars = p.prose.length;
  }
  if (p.characterBefore && typeof p.characterBefore === "object") {
    out.characterBefore = p.characterBefore;
  }
  // Keep other small keys; skip unknown huge blobs.
  for (const [k, v] of Object.entries(p)) {
    if (k in out) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 200)}… [truncated ${v.length} chars]`;
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function compactNormalized(normalized: unknown): unknown {
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }
  const n = normalized as Record<string, unknown>;
  const out: Record<string, unknown> = {
    actionType: n.actionType,
    text: n.text,
    targets: n.targets,
  };
  if (n.confidence !== undefined) out.confidence = n.confidence;
  // Drop nested raw (already in Input).
  return out;
}

function shouldShowNormalized(raw: unknown, normalized: unknown): boolean {
  if (!normalized || typeof normalized !== "object") return false;
  const n = normalized as Record<string, unknown>;
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!r) return true;
  // free_text with same text and empty targets — skip noise
  if (
    r.kind === "free_text" &&
    n.actionType === "free_text" &&
    n.text === r.text &&
    Array.isArray(n.targets) &&
    n.targets.length === 0
  ) {
    return false;
  }
  if (
    r.kind === "system" &&
    n.actionType === "system" &&
    n.text === r.text
  ) {
    return false;
  }
  return true;
}

/**
 * When LLM transcript is present, strip fields already visible there
 * (history, full prompt sections) to avoid 5× duplication.
 */
function compactAgentInput(input: JsonObject, hasPrompts: boolean): unknown {
  if (!hasPrompts) return input;
  const out: Record<string, unknown> = { ...input };
  if (Array.isArray(out.history)) {
    out.history = {
      omitted: true,
      messages: out.history.length,
      note: "full history is in LLM transcript",
    };
  }
  if (Array.isArray(out.narrativePromptSections)) {
    out.narrativePromptSections = {
      omitted: true,
      count: out.narrativePromptSections.length,
      ids: out.narrativePromptSections
        .map((s) =>
          s && typeof s === "object" && "id" in s
            ? String((s as { id: unknown }).id)
            : "?",
        )
        .slice(0, 20),
      note: "section bodies are in LLM transcript system message",
    };
  }
  // brief.narrativePromptSections same idea
  if (out.brief && typeof out.brief === "object" && !Array.isArray(out.brief)) {
    const brief = { ...(out.brief as Record<string, unknown>) };
    if (Array.isArray(brief.narrativePromptSections)) {
      brief.narrativePromptSections = {
        omitted: true,
        count: brief.narrativePromptSections.length,
        note: "see LLM transcript",
      };
    }
    out.brief = brief;
  }
  return out;
}

function compactNarrativeBrief(brief: JsonObject): unknown {
  const out: Record<string, unknown> = { ...brief };
  if (Array.isArray(out.narrativePromptSections)) {
    out.narrativePromptSections = out.narrativePromptSections.map((s) => {
      if (!s || typeof s !== "object") return s;
      const sec = s as Record<string, unknown>;
      return {
        id: sec.id,
        channel: sec.channel,
        title: sec.title,
        priority: sec.priority,
        textChars:
          typeof sec.text === "string" ? sec.text.length : undefined,
      };
    });
  }
  // System follow-up brief: don't re-dump full prose payload
  if (out.system === true && out.payload && typeof out.payload === "object") {
    out.payload = compactSystemPayload(out.payload);
  }
  return out;
}

function compactCommand(command: TraceCommandRecord["command"]): unknown {
  return {
    commandId: command.commandId,
    type: command.type,
    slice: command.slice,
    payload: command.payload,
    reason: command.reason,
    source: command.source,
  };
}

function formatDiffValue(value: unknown): string {
  if (value === undefined) return "`undefined`";
  if (typeof value === "string") {
    const escaped = value.replace(/`/g, "'");
    if (escaped.length < 120 && !escaped.includes("\n")) {
      return `\`${escaped}\``;
    }
    return `\n\`\`\`\n${escaped}\n\`\`\``;
  }
  const text = JSON.stringify(value);
  if (text === undefined) return "`undefined`";
  if (text.length < 120) {
    return `\`${text.replace(/`/g, "'")}\``;
  }
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncateValue(
  value: unknown,
  maxChars: number,
  maxArrayItems: number,
): unknown {
  if (typeof value === "string") {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}… [truncated ${value.length} → ${maxChars} chars]`;
  }
  if (Array.isArray(value)) {
    const sliced = value
      .slice(0, maxArrayItems)
      .map((item) => truncateValue(item, maxChars, maxArrayItems));
    if (value.length > maxArrayItems) {
      sliced.push(`… [truncated array ${value.length} → ${maxArrayItems} items]`);
    }
    return sliced;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = truncateValue(child, maxChars, maxArrayItems);
    }
    return out;
  }
  return value;
}

/**
 * Normalizes volatile fields in markdown for golden tests.
 *
 * @param markdown - raw markdown
 */
export function normalizeTraceMarkdown(markdown: string): string {
  return markdown
    .replace(/ses_[a-f0-9]+/gi, "ses_NORMALIZED")
    .replace(/trn_[a-f0-9]+/gi, "trn_NORMALIZED")
    .replace(/psg_[a-f0-9]+/gi, "psg_NORMALIZED")
    .replace(/cmd_[a-f0-9]+/gi, "cmd_NORMALIZED")
    .replace(/tsk_[a-f0-9]+/gi, "tsk_NORMALIZED")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "TIME_NORMALIZED")
    .replace(/durationMs: `\d+(\.\d+)?`/g, "durationMs: `DURATION`")
    .replace(/\| (\d+(?:\.\d+)?) \|/g, "| DURATION |");
}
