import {
  ok,
  type NarrativePromptContributor,
} from "@rpengineext/contracts";

import { PROMPT_SECTION_PRIORITY, SLICE_NAME } from "../constants.ts";
import { parseWorldCanonSlice } from "../schema/slice.ts";

/**
 * Compiles immutable world canon into the narrative system prompt.
 */
export function createNarrativePromptContributor(): NarrativePromptContributor {
  return {
    contribute({ draft }) {
      const slice = parseWorldCanonSlice(draft.slices[SLICE_NAME]);
      if (!slice.present || slice.text.trim().length === 0) {
        return ok({ sections: [] });
      }
      const text = [
        slice.text.trim(),
        "Treat the above as established truth. Do not contradict it. Do not invent lore that overrides it.",
      ].join("\n");
      return ok({
        sections: [
          {
            id: "world_canon.text",
            channel: "system",
            title: "WORLD CANON (immutable established facts)",
            text,
            priority: PROMPT_SECTION_PRIORITY,
          },
        ],
      });
    },
  };
}
