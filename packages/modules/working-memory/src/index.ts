import { defineModule } from "@rpengineext/module-sdk";
import type { JsonObject, JsonValue, WorldState } from "@rpengineext/contracts";
import { z } from "zod";

import {
  resolveWorkingMemoryConfig,
  WorkingMemoryConfigSchema,
  type WorkingMemoryConfig,
} from "./config.ts";
import {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  DEFAULT_WINDOW_PAIRS,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  SLICE_NAME,
} from "./constants.ts";
import {
  AppendPairPayloadSchema,
  createEmptyWorkingMemorySlice,
  parseWorkingMemorySlice,
  WorkingMemorySliceSchema,
  type AppendPairPayload,
  type WorkingMemorySlice,
} from "./schema.ts";
import {
  buildPromptHistory,
  flattenPairsToHistory,
  selectLastPairs,
  type HistoryMessage,
} from "./selectors/window.ts";

export {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  DEFAULT_WINDOW_PAIRS,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  SLICE_NAME,
} from "./constants.ts";
export {
  readWorkingMemoryWindowFromEnv,
  resolveWorkingMemoryConfig,
  WorkingMemoryConfigSchema,
  type WorkingMemoryConfig,
} from "./config.ts";
export {
  buildPromptHistory,
  flattenPairsToHistory,
  selectLastPairs,
  type HistoryMessage,
} from "./selectors/window.ts";
export type { AppendPairPayload, WorkingMemoryPair, WorkingMemorySlice } from "./schema.ts";
export {
  createEmptyWorkingMemorySlice,
  parseWorkingMemorySlice,
} from "./schema.ts";

export interface CreateWorkingMemoryModuleOptions {
  /**
   * Number of pairs injected into narrative.write (not archive cap).
   * Host should pass the same value via moduleConfig.working_memory.windowPairs.
   */
  readonly windowPairs?: number;
}

/**
 * Creates the working-memory product module (sdk / CBMD).
 *
 * @param options - factory options (windowPairs from host env)
 */
export function createWorkingMemoryModule(
  options: CreateWorkingMemoryModuleOptions = {},
) {
  const config = resolveWorkingMemoryConfig(options);

  return defineModule(
    {
      id: MODULE_ID,
      version: "1.0.0",
      title: "Working Memory",
      description:
        "Stores all player free_text ↔ narrative pairs and injects last N pairs into narrative.write",
      priority: 10,
      provides: [CAPABILITY_ID],

      config: {
        key: CONFIG_KEY,
        schema: WorkingMemoryConfigSchema as unknown as z.ZodType<JsonObject>,
        defaults: { windowPairs: config.windowPairs } as JsonObject,
      },

      state: {
        name: SLICE_NAME,
        schemaVersion: 1,
        schema: WorkingMemorySliceSchema,
        initial: createEmptyWorkingMemorySlice(),
        ops: {
          append_pair: {
            payload: AppendPairPayloadSchema,
            apply: (s: WorkingMemorySlice, p: AppendPairPayload): WorkingMemorySlice => ({
              schemaVersion: 1,
              entries: [
                ...s.entries,
                {
                  turnId: p.turnId,
                  user: p.user,
                  assistant: p.assistant,
                  createdAt: p.createdAt,
                },
              ],
            }),
          },
        },
      },

      turn: {
        afterProse(ctx) {
          if (ctx.turnKind !== "player") return;
          const action = ctx.action;
          if (!action || action.kind !== "free_text") return;
          const user = action.text?.trim() ?? "";
          if (!user) return;
          const assistant = ctx.passage?.prose.trim() ?? "";
          if (!assistant) return;
          ctx.op(
            "append_pair",
            {
              turnId: ctx.passage!.turnId,
              user,
              assistant,
              createdAt: new Date().toISOString(),
            },
            "working-memory pair for free_text turn",
          );
        },
      },

      narrative: {
        history: ({ slice, config: cfg }) => {
          const s = slice as WorkingMemorySlice;
          const windowPairs =
            typeof (cfg as WorkingMemoryConfig).windowPairs === "number"
              ? (cfg as WorkingMemoryConfig).windowPairs
              : config.windowPairs;
          return buildPromptHistory(s.entries, windowPairs);
        },
        brief: ({ slice, config: cfg }) => {
          const s = slice as WorkingMemorySlice;
          const windowPairs =
            typeof (cfg as WorkingMemoryConfig).windowPairs === "number"
              ? (cfg as WorkingMemoryConfig).windowPairs
              : config.windowPairs;
          return {
            windowPairs,
            totalPairs: s.entries.length,
          };
        },
      },

      host: {
        readModels: {
          "working_memory.window": (state: WorldState, _args, cfg) => {
            const s = parseWorkingMemorySlice(state.slices[SLICE_NAME]);
            const windowPairs =
              typeof (cfg as WorkingMemoryConfig).windowPairs === "number"
                ? (cfg as WorkingMemoryConfig).windowPairs
                : config.windowPairs;
            const history = buildPromptHistory(s.entries, windowPairs);
            return {
              windowPairs,
              totalPairs: s.entries.length,
              history: history as unknown as JsonValue,
            };
          },
          "working_memory.all": (state: WorldState) => {
            const s = parseWorkingMemorySlice(state.slices[SLICE_NAME]);
            return {
              schemaVersion: s.schemaVersion,
              entries: s.entries as unknown as JsonValue,
              totalPairs: s.entries.length,
            };
          },
        },
      },
    },
    {
      factoryConfig: { windowPairs: config.windowPairs } as JsonObject,
    },
  );
}
