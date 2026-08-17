import {
  ok,
  type JsonObject,
  type NarrativeContextProvider,
} from "@rpengineext/contracts";

import { NARRATIVE_NAMESPACE, SLICE_NAME } from "../constants.ts";
import { parseCharacterSlice } from "../schema/slice.ts";

/**
 * Injects structured character data into narrative brief namespaces.
 */
export function createNarrativeContextProvider(): NarrativeContextProvider {
  return {
    provide({ draft }) {
      const slice = parseCharacterSlice(draft.slices[SLICE_NAME]);
      if (!slice.present) {
        return ok({
          namespace: NARRATIVE_NAMESPACE,
          data: { present: false },
        });
      }
      const data: JsonObject = {
        present: true,
        name: slice.name,
        appearance: slice.appearance,
        features: slice.features,
        outfit: slice.outfit,
      };
      return ok({
        namespace: NARRATIVE_NAMESPACE,
        data,
      });
    },
  };
}
