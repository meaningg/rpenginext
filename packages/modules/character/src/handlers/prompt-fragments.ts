import {
  ok,
  type PromptFragmentProvider,
} from "@rpengineext/contracts";

import { SLICE_NAME } from "../constants.ts";
import { parseCharacterSlice } from "../schema/slice.ts";

/**
 * Human-readable character block for narrative system prompt fragments.
 */
export function createPromptFragmentProvider(): PromptFragmentProvider {
  return {
    provide({ slot }, ctx) {
      if (slot !== "system") {
        return ok({ fragments: [] });
      }
      const slice = parseCharacterSlice(ctx.stateView.slices[SLICE_NAME]);
      if (!slice.present) {
        return ok({ fragments: [] });
      }
      const text = [
        "PLAYER CHARACTER",
        `Name: ${slice.name}`,
        `Appearance: ${slice.appearance}`,
        `Traits / features: ${slice.features}`,
        `Current outfit: ${slice.outfit}`,
        "Keep the character consistent with this description unless the current action changes something.",
      ].join("\n");
      return ok({
        fragments: [
          {
            id: "character.profile",
            text,
            priority: 20,
          },
        ],
      });
    },
  };
}
