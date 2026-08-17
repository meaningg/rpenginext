import {
  ok,
  type NarrativePromptContributor,
} from "@rpengineext/contracts";

import { SLICE_NAME } from "../constants.ts";
import { parseCharacterSlice } from "../schema/slice.ts";

/**
 * Compiles player-character facts into a narrative system prompt section.
 */
export function createNarrativePromptContributor(): NarrativePromptContributor {
  return {
    contribute({ draft }) {
      const slice = parseCharacterSlice(draft.slices[SLICE_NAME]);
      if (!slice.present) {
        return ok({ sections: [] });
      }
      const text = [
        `Name: ${slice.name}`,
        `Appearance: ${slice.appearance}`,
        `Traits / features: ${slice.features}`,
        `Current outfit: ${slice.outfit}`,
        "Keep the character consistent with this description unless the current action changes something.",
      ].join("\n");
      return ok({
        sections: [
          {
            id: "character.profile",
            channel: "system",
            title: "PLAYER CHARACTER",
            text,
            priority: 20,
          },
        ],
      });
    },
  };
}
