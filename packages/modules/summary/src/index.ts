import { defineModule, deny } from "@rpengineext/module-sdk";
import type { JsonObject, JsonValue, WorldState } from "@rpengineext/contracts";
import type { WorkingMemorySlice } from "@rpengineext/module-working-memory";
import { z } from "zod";

import {
  buildSummaryConfigSchema,
  resolveSummaryConfig,
  type SummaryConfig,
} from "./config.ts";
import {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  PROMPT_SECTION_PRIORITY,
  SLICE_NAME,
  SYSTEM_REASON_MAKE_SUMMARY,
  TASK_TYPES,
  TOOL_IDS,
  WORKING_MEMORY_SLICE_NAME,
} from "./constants.ts";
import { buildSummaryMakeMessages } from "./make-summary-messages.ts";
import {
  createEmptySummarySlice,
  parseSummarySlice,
  StoreSummaryArgsSchema,
  StoreSummaryPayloadSchema,
  StoreSummaryResultSchema,
  SummaryMakeInputSchema,
  SummaryMakeOutputSchema,
  SummarySliceSchema,
  type StoreSummaryPayload,
  type SummarySlice,
} from "./schema.ts";
import {
  buildSummaryPromptSection,
  chunkRange,
  shouldSummarize,
} from "./selectors/summaries.ts";

export {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  PROMPT_SECTION_PRIORITY,
  SLICE_NAME,
  SYSTEM_REASON_MAKE_SUMMARY,
  TASK_TYPES,
  TOOL_IDS,
  WORKING_MEMORY_SLICE_NAME,
} from "./constants.ts";
export {
  buildSummaryConfigSchema,
  resolveSummaryConfig,
  type SummaryConfig,
} from "./config.ts";
export {
  buildSummaryMakeMessages,
} from "./make-summary-messages.ts";
export {
  buildSummaryPromptSection,
  chunkRange,
  shouldSummarize,
  type ChunkRange,
} from "./selectors/summaries.ts";
export {
  createEmptySummarySlice,
  parseSummarySlice,
  StoreSummaryArgsSchema,
  StoreSummaryResultSchema,
  SummaryMakeInputSchema,
  SummaryMakeOutputSchema,
  SummarySliceSchema,
  type StoreSummaryArgs,
  type StoreSummaryPayload,
  type StoreSummaryResult,
  type SummaryChunk,
  type SummaryMakeInput,
  type SummaryMakeOutput,
  type SummaryPair,
  type SummarySlice,
} from "./schema.ts";

export interface CreateSummaryModuleOptions {
  /**
   * How many working-memory pairs between summary chunks.
   * Defaults to the working-memory window (`RP_WORKING_MEMORY_WINDOW`) —
   * the module has no independent default.
   */
  readonly intervalTurns?: number;
  /** Env bag used to resolve the working-memory window (defaults to process.env). */
  readonly env?: Record<string, string | undefined>;
}

/**
 * Creates the story-summary product module (sdk / CBMD).
 *
 * Every `intervalTurns` player free-text turns it schedules a background
 * system turn that writes a delta summary chunk covering exactly the turns
 * not yet summarized (context = the full current working memory). All chunks
 * are injected into the narrative system prompt, so the history stays
 * consistent on long campaigns with no gap between the working-memory window
 * and the summaries (interval <= window guarantees it).
 *
 * @param options - factory options (intervalTurns, env for tests)
 */
export function createSummaryModule(options: CreateSummaryModuleOptions = {}) {
  const config = resolveSummaryConfig(options);

  return defineModule(
    {
      id: MODULE_ID,
      version: "0.1.0",
      title: "Story Summary",
      description:
        "Delta summary chunks of working memory via background system turns; all chunks injected into the narrative system prompt",
      priority: 30,
      provides: [CAPABILITY_ID],

      config: {
        key: CONFIG_KEY,
        schema: buildSummaryConfigSchema(
          config.intervalTurns,
        ) as unknown as z.ZodType<JsonObject>,
        defaults: { intervalTurns: config.intervalTurns } as JsonObject,
      },

      access: {
        read: [WORKING_MEMORY_SLICE_NAME],
      },

      state: {
        name: SLICE_NAME,
        schemaVersion: 1,
        schema: SummarySliceSchema,
        initial: createEmptySummarySlice(),
        ops: {
          store_summary: {
            payload: StoreSummaryPayloadSchema,
            apply: (s: SummarySlice, p: StoreSummaryPayload): SummarySlice => {
              if (p.index !== s.summaries.length + 1) {
                deny("COMMAND_INVALID", "summary index must be consecutive");
              }
              if (p.fromPairIndex !== s.lastSummarizedPairCount + 1) {
                deny(
                  "COMMAND_INVALID",
                  "fromPairIndex must follow lastSummarizedPairCount",
                );
              }
              if (p.toPairIndex < p.fromPairIndex) {
                deny("COMMAND_INVALID", "toPairIndex must be >= fromPairIndex");
              }
              return {
                schemaVersion: 1,
                lastSummarizedPairCount: p.toPairIndex,
                summaries: [
                  ...s.summaries,
                  {
                    index: p.index,
                    fromPairIndex: p.fromPairIndex,
                    toPairIndex: p.toPairIndex,
                    text: p.text,
                    createdAt: p.createdAt,
                  },
                ],
              };
            },
          },
        },
      },

      turn: {
        committed(ctx) {
          if (ctx.turnKind !== "player") return;
          const action = ctx.action;
          if (!action || action.kind !== "free_text") return;

          const wm = ctx.readSlice<WorkingMemorySlice>(
            WORKING_MEMORY_SLICE_NAME,
          );
          if (!wm) return; // working-memory module absent → nothing to summarize

          const s = ctx.slice as SummarySlice;
          const interval =
            typeof (ctx.config as SummaryConfig).intervalTurns === "number"
              ? (ctx.config as SummaryConfig).intervalTurns
              : config.intervalTurns;

          // committed sees the pre-turn snapshot: rebuild the current turn's
          // pair exactly like working-memory does (same fields/guards), so the
          // chunk at turn N covers working memory N — no gap between the turns
          // that left the window and the summaries.
          const user = action.text?.trim() ?? "";
          const prose = ctx.passage?.prose.trim() ?? "";
          const currentPair =
            user && prose
              ? {
                  turnId: ctx.passage!.turnId,
                  user,
                  assistant: prose,
                  createdAt: new Date().toISOString(),
                }
              : undefined;
          const entries = currentPair
            ? [...wm.entries, currentPair]
            : wm.entries;

          if (!shouldSummarize(entries.length, s.lastSummarizedPairCount, interval)) {
            return;
          }

          const range = chunkRange(s.lastSummarizedPairCount, entries.length);
          ctx.scheduleSystem({
            reason: SYSTEM_REASON_MAKE_SUMMARY,
            mode: "background",
            payload: {
              sourceTurnId: ctx.passage!.turnId,
              lastSummarizedPairCount: s.lastSummarizedPairCount,
              chunk: range,
              entries,
              previousSummaries: s.summaries.map((chunk) => ({
                index: chunk.index,
                text: chunk.text,
              })),
            },
          });
          ctx.note(
            "summary.scheduled",
            `chunk #${s.summaries.length + 1} covers pairs ${range.fromPairIndex}..${range.toPairIndex}`,
          );
        },
      },

      narrative: {
        system: ({ slice }) => {
          const s = slice as SummarySlice;
          const text = buildSummaryPromptSection(s.summaries);
          if (!text) return null;
          return {
            id: "summary.history",
            channel: "system",
            title: "STORY SUMMARY (established history, chronological)",
            priority: PROMPT_SECTION_PRIORITY,
            text,
          };
        },
        brief: ({ slice }): JsonObject => {
          const s = slice as SummarySlice;
          return {
            present: s.summaries.length > 0,
            count: s.summaries.length,
            lastSummarizedPairCount: s.lastSummarizedPairCount,
            lastSummaryIndex: s.summaries[s.summaries.length - 1]?.index ?? 0,
          };
        },
      },

      ai: {
        tasks: {
          make: {
            description:
              "Write a delta summary chunk for the working-memory turns not yet summarized and store it",
            input: SummaryMakeInputSchema as unknown as z.ZodType<JsonObject>,
            output: SummaryMakeOutputSchema as unknown as z.ZodType<JsonObject>,
            optional: true,
            timeoutMs: 30_000,
            maxRepairAttempts: 1,
            maxToolRounds: 3,
            temperature: 0.2,
            tools: ["store"],
            runOn: { systemReason: SYSTEM_REASON_MAKE_SUMMARY },
            messages: (input, task) => buildSummaryMakeMessages(task),
          },
        },
        tools: {
          store: {
            description: "Store one delta summary chunk for the new turns",
            args: StoreSummaryArgsSchema as unknown as z.ZodType<JsonObject>,
            result: StoreSummaryResultSchema as unknown as z.ZodType<JsonObject>,
            handler: (args, ctx) => {
              const summary = String(args.summary ?? "").trim();
              if (!summary) {
                deny("SCHEMA_INVALID", "summary must be non-empty");
              }
              const s = ctx.slice as SummarySlice;
              const wm = ctx.readSlice<WorkingMemorySlice>(
                WORKING_MEMORY_SLICE_NAME,
              );
              const fromPairIndex = s.lastSummarizedPairCount + 1;
              const toPairIndex = wm?.entries.length ?? fromPairIndex - 1;
              if (toPairIndex < fromPairIndex) {
                deny(
                  "COMMAND_INVALID",
                  "no new working-memory pairs to summarize",
                );
              }
              const index = s.summaries.length + 1;
              ctx.proposeOp(
                "store_summary",
                {
                  index,
                  fromPairIndex,
                  toPairIndex,
                  text: summary,
                  createdAt: new Date().toISOString(),
                },
                SYSTEM_REASON_MAKE_SUMMARY,
              );
              return { ok: true as const, index, fromPairIndex, toPairIndex };
            },
          },
        },
      },

      host: {
        status: ({ slice }) => {
          const s = slice as SummarySlice;
          if (s.summaries.length === 0) return [];
          return [
            {
              slot: "summary.count",
              text: `Summary: ${s.summaries.length} chunk(s), covers ${s.lastSummarizedPairCount} pairs`,
            },
          ];
        },
        help: [
          {
            id: "summary",
            body: "Every N turns a background system turn summarizes the new turns and all chunks are injected into the system prompt.",
          },
        ],
        readModels: {
          "summary.list": (state: WorldState, _args, _cfg) => {
            const s = parseSummarySlice(state.slices[SLICE_NAME]);
            return {
              count: s.summaries.length,
              lastSummarizedPairCount: s.lastSummarizedPairCount,
              summaries: s.summaries as unknown as JsonValue,
            };
          },
        },
      },
    },
    {
      factoryConfig: { intervalTurns: config.intervalTurns } as JsonObject,
    },
  );
}
