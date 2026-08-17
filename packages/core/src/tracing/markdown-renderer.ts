import { TRACE_FORMAT_VERSION } from "@rpengineext/contracts";

import type { TurnTraceDocument } from "./turn-tracer.ts";

/**
 * Renders a turn trace document to normative markdown.
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
  lines.push("");

  lines.push("## Input");
  lines.push("");
  lines.push("```json");
  lines.push(stableJson(trunc(doc.rawInput)));
  lines.push("```");
  if (doc.normalizedAction) {
    lines.push("");
    lines.push("### Normalized action");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(doc.normalizedAction)));
    lines.push("```");
  }
  if (doc.intent) {
    lines.push("");
    lines.push("### Intent");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(doc.intent)));
    lines.push("```");
  }
  lines.push("");

  lines.push("## Timeline");
  lines.push("");
  lines.push("| # | stage | status | durationMs | notes |");
  lines.push("|---|-------|--------|------------|-------|");
  doc.timeline.forEach((row, index) => {
    lines.push(
      `| ${index} | ${row.stage} | ${row.status} | ${row.durationMs} | ${escapeCell(row.notes ?? "")} |`,
    );
  });
  lines.push("");

  lines.push("## Agents");
  lines.push("");
  if (doc.agents.length === 0) {
    lines.push("_No agent calls._");
    lines.push("");
  } else {
    for (const agent of doc.agents) {
      lines.push(`### Agent task \`${agent.taskId}\` (\`${agent.type}\`)`);
      lines.push("");
      lines.push(`- status: **${agent.status}**`);
      lines.push(`- requester: \`${agent.requester}\``);
      if (agent.error) {
        lines.push(`- error: \`${agent.error}\``);
      }
      lines.push("");
      lines.push("#### Input");
      lines.push("");
      lines.push("```json");
      lines.push(stableJson(trunc(agent.input)));
      lines.push("```");
      lines.push("");
      lines.push("#### Output");
      lines.push("");
      lines.push("```json");
      lines.push(stableJson(trunc(agent.output ?? null)));
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## Tool calls");
  lines.push("");
  if (doc.toolCalls.length === 0) {
    lines.push("_None._");
  } else {
    for (const tool of doc.toolCalls) {
      lines.push(
        `- \`${tool.toolName}\` (${tool.callId}): ${tool.error ? `error ${tool.error}` : "ok"}`,
      );
    }
  }
  lines.push("");

  lines.push("## Commands");
  lines.push("");
  if (doc.commands.length === 0) {
    lines.push("_No commands._");
  } else {
    for (const cmd of doc.commands) {
      const mark = cmd.accepted ? "accept" : "reject";
      lines.push(
        `- **${mark}** \`${cmd.command.type}\` (\`${cmd.command.commandId}\`)${cmd.reason ? ` — ${cmd.reason}` : ""}`,
      );
    }
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(doc.commands.map((c) => c.command))));
    lines.push("```");
  }
  lines.push("");

  lines.push("## State diff");
  lines.push("");
  if (doc.outcome === "rejected") {
    lines.push(
      `ROLLBACK to revision ${doc.stateRevisionBefore} (no authoritative changes)`,
    );
    lines.push("");
  }
  if (doc.stateDiff.length === 0) {
    lines.push("_No differences._");
  } else {
    for (const entry of doc.stateDiff) {
      lines.push(`- \`${entry.path}\``);
      lines.push(`  - before: \`${formatInline(trunc(entry.before))}\``);
      lines.push(`  - after: \`${formatInline(trunc(entry.after))}\``);
    }
  }
  lines.push("");

  lines.push("## Narrative");
  lines.push("");
  if (doc.narrativeBrief) {
    lines.push("### Brief");
    lines.push("");
    lines.push("```json");
    lines.push(stableJson(trunc(doc.narrativeBrief)));
    lines.push("```");
    lines.push("");
  }
  if (doc.narrativeProse) {
    lines.push("### Prose");
    lines.push("");
    lines.push(String(trunc(doc.narrativeProse)));
    lines.push("");
  } else {
    lines.push("_No narrative prose._");
    lines.push("");
  }

  lines.push("## Passage");
  lines.push("");
  if (doc.passage) {
    lines.push("```json");
    lines.push(stableJson(trunc(doc.passage)));
    lines.push("```");
  } else {
    lines.push("_No passage._");
  }
  lines.push("");

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

  lines.push("## Warnings / errors");
  lines.push("");
  if (doc.warnings.length === 0 && !doc.failure) {
    lines.push("_None._");
  } else {
    for (const warning of doc.warnings) {
      lines.push(`- warn: ${warning}`);
    }
    if (doc.failure) {
      lines.push(
        `- error: \`${doc.failure.code}\` ${doc.failure.message}`,
      );
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

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatInline(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").replace(/`/g, "'");
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
    const sliced = value.slice(0, maxArrayItems).map((item) =>
      truncateValue(item, maxChars, maxArrayItems),
    );
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
