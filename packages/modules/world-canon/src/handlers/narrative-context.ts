import {
  ok,
  type JsonObject,
  type NarrativeContextProvider,
} from "@rpengineext/contracts";

import { NARRATIVE_NAMESPACE, SLICE_NAME } from "../constants.ts";
import { parseWorldCanonSlice } from "../schema/slice.ts";

/**
 * Marks world-canon presence in narrative brief namespaces.
 * Full text is injected via system prompt fragments (not duplicated here).
 */
export function createNarrativeContextProvider(): NarrativeContextProvider {
  return {
    provide({ draft }) {
      const slice = parseWorldCanonSlice(draft.slices[SLICE_NAME]);
      if (!slice.present) {
        return ok({
          namespace: NARRATIVE_NAMESPACE,
          data: { present: false },
        });
      }
      const data: JsonObject = {
        present: true,
        charCount: slice.text.length,
      };
      return ok({
        namespace: NARRATIVE_NAMESPACE,
        data,
      });
    },
  };
}
