import {
  ok,
  type SystemTurnScheduler,
} from "@rpengineext/contracts";

import {
  SLICE_NAME,
  SYSTEM_REASON_OUTFIT_SYNC,
} from "../constants.ts";
import { parseCharacterSlice } from "../schema/slice.ts";

/**
 * Schedules a background outfit-sync system turn after each player free_text.
 */
export function createSystemTurnScheduler(): SystemTurnScheduler {
  return {
    schedule({ passage, rawAction, turnKind }, ctx) {
      if (turnKind !== "player") {
        return ok({ requests: [] });
      }
      if (rawAction.kind !== "free_text") {
        return ok({ requests: [] });
      }
      const userText = rawAction.text?.trim() ?? "";
      if (!userText) {
        return ok({ requests: [] });
      }
      const prose = passage.prose.trim();
      if (!prose) {
        return ok({ requests: [] });
      }

      const slice = parseCharacterSlice(ctx.stateView.slices[SLICE_NAME]);
      if (!slice.present) {
        return ok({ requests: [] });
      }

      return ok({
        requests: [
          {
            reason: SYSTEM_REASON_OUTFIT_SYNC,
            mode: "background",
            payload: {
              sourceTurnId: passage.turnId,
              userText,
              prose,
              characterBefore: {
                name: slice.name,
                appearance: slice.appearance,
                features: slice.features,
                outfit: slice.outfit,
              },
            },
          },
        ],
      });
    },
  };
}
