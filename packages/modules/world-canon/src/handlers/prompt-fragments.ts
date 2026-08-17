import {
  ok,
  type PromptFragmentProvider,
} from "@rpengineext/contracts";

import { PROMPT_FRAGMENT_PRIORITY, SLICE_NAME } from "../constants.ts";
import { parseWorldCanonSlice } from "../schema/slice.ts";

/**
 * Human-readable world canon block for narrative system prompt fragments.
 */
export function createPromptFragmentProvider(): PromptFragmentProvider {
  return {
    provide({ slot }, ctx) {
      if (slot !== "system") {
        return ok({ fragments: [] });
      }
      const slice = parseWorldCanonSlice(ctx.stateView.slices[SLICE_NAME]);
      if (!slice.present || slice.text.trim().length === 0) {
        return ok({ fragments: [] });
      }
      const text = [
        "WORLD CANON (immutable established facts)",
        slice.text.trim(),
        "Treat the above as established truth. Do not contradict it. Do not invent lore that overrides it.",
      ].join("\n");
      return ok({
        fragments: [
          {
            id: "world_canon.text",
            text,
            priority: PROMPT_FRAGMENT_PRIORITY,
          },
        ],
      });
    },
  };
}
