import {
  ok,
  type JsonObject,
  type JsonValue,
  type NarrativeContextProvider,
} from "@rpengineext/contracts";

import {
  NARRATIVE_NAMESPACE,
  SLICE_NAME,
} from "../constants.ts";
import type { WorkingMemoryConfig } from "../config.ts";
import { parseWorkingMemorySlice } from "../schema/slice.ts";
import { buildPromptHistory } from "../selectors/window.ts";

/**
 * Builds a NarrativeContextProvider that exposes last-N history.
 *
 * @param config - resolved module config
 */
export function createNarrativeContextProvider(
  config: WorkingMemoryConfig,
): NarrativeContextProvider {
  return {
    provide({ draft }) {
      const slice = parseWorkingMemorySlice(draft.slices[SLICE_NAME]);
      const history = buildPromptHistory(slice.entries, config.windowPairs);
      const data: JsonObject = {
        windowPairs: config.windowPairs,
        totalPairs: slice.entries.length,
        history: history as unknown as JsonValue,
      };
      return ok({
        namespace: NARRATIVE_NAMESPACE,
        data,
      });
    },
  };
}
