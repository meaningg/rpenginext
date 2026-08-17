import type {
  JsonObject,
  JsonValue,
  ReadModelDefinition,
  WorldState,
} from "@rpengineext/contracts";

import type { WorkingMemoryConfig } from "./config.ts";
import { SLICE_NAME } from "./constants.ts";
import { parseWorkingMemorySlice } from "./schema/slice.ts";
import { buildPromptHistory } from "./selectors/window.ts";

/**
 * Registers read models for host/debug inspection.
 *
 * @param config - module config
 */
export function createWorkingMemoryReadModels(
  config: WorkingMemoryConfig,
): ReadModelDefinition[] {
  return [
    {
      id: "working_memory.window",
      get(state: WorldState, _args: JsonObject): JsonObject {
        const slice = parseWorkingMemorySlice(state.slices[SLICE_NAME]);
        const history = buildPromptHistory(slice.entries, config.windowPairs);
        return {
          windowPairs: config.windowPairs,
          totalPairs: slice.entries.length,
          history: history as unknown as JsonValue,
        };
      },
    },
    {
      id: "working_memory.all",
      get(state: WorldState, _args: JsonObject): JsonObject {
        const slice = parseWorkingMemorySlice(state.slices[SLICE_NAME]);
        return {
          schemaVersion: slice.schemaVersion,
          entries: slice.entries as unknown as JsonValue,
          totalPairs: slice.entries.length,
        };
      },
    },
  ];
}
