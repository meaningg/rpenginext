import type { AgentTask, LlmMessage } from "@rpengineext/contracts";

import { TOOL_IDS } from "./constants.ts";
import { SummaryMakeInputSchema } from "./schema.ts";

/**
 * Builds LLM messages for the `summary.make` agent task.
 *
 * The model receives the FULL working-memory archive plus the previous chunks
 * as context, but must write a chunk that covers ONLY the new range
 * (`chunk.fromPairIndex..toPairIndex`), then store it via the tool.
 *
 * @param task - agent task (input = scheduleSystem payload from committed)
 */
export function buildSummaryMakeMessages(
  task: AgentTask,
): readonly LlmMessage[] {
  const parsed = SummaryMakeInputSchema.safeParse(task.input);
  const input = parsed.success
    ? parsed.data
    : {
        sourceTurnId: String(task.input.sourceTurnId ?? task.turnId),
        lastSummarizedPairCount: 0,
        chunk: { fromPairIndex: 1, toPairIndex: 1 },
        entries: [],
        previousSummaries: [],
      };

  const range =
    input.chunk.fromPairIndex === input.chunk.toPairIndex
      ? `turn #${input.chunk.fromPairIndex}`
      : `turns #${input.chunk.fromPairIndex}–#${input.chunk.toPairIndex}`;

  const system = [
    "You maintain a condensed history for a turn-based interactive fiction engine.",
    "You receive the FULL dialogue archive and PREVIOUS_SUMMARIES (turns already covered).",
    `Write a NEW summary chunk that covers ONLY ${range} — the turns not yet covered by any previous summary.`,
    "Use the full dialogue only as context for consistency and continuity; the chunk itself must cover exactly that range.",
    "Do not repeat content already captured by previous summaries — chunks must tile the history without overlap or gaps.",
    "Include key events, decisions, places, NPCs, objects, state changes and unresolved threads.",
    "Write in the same language as the dialogue. Be factual and concise.",
    `Then call the tool ${TOOL_IDS.store} EXACTLY ONCE with { summary: <chunk text> }.`,
    "After the tool call succeeds, output ONLY the final JSON: {\"stored\": true}.",
    "Do not narrate. Do not summarize turns outside the range.",
  ].join("\n");

  const user = {
    taskType: "summary.make",
    sourceTurnId: input.sourceTurnId,
    chunk: input.chunk,
    previousSummaries: input.previousSummaries,
    fullDialogue: input.entries.map((pair, i) => ({
      index: i + 1,
      user: pair.user,
      assistant: pair.assistant,
    })),
  };

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify(user, null, 2),
    },
  ];
}
