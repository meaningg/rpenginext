import {
  ok,
  type StatusPanelProvider,
} from "@rpengineext/contracts";

import { SLICE_NAME } from "../constants.ts";
import { parseCharacterSlice } from "../schema/slice.ts";

/**
 * Shows character name/outfit on the status panel when present.
 */
export function createStatusPanelProvider(): StatusPanelProvider {
  return {
    provide({ draft }) {
      const slice = parseCharacterSlice(draft.slices[SLICE_NAME]);
      if (!slice.present) {
        return ok({ lines: [] });
      }
      return ok({
        lines: [
          {
            slot: "character.name",
            text: `Character: ${slice.name}`,
          },
          {
            slot: "character.outfit",
            text: `Outfit: ${slice.outfit}`,
          },
        ],
      });
    },
  };
}
