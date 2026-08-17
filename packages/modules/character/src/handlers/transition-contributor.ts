import {
  ok,
  type StateCommand,
  type TransitionContributor,
} from "@rpengineext/contracts";

import {
  COMMAND_TYPES,
  EXTRAS_OUTFIT_PROPOSAL,
  MODULE_ID,
  SLICE_NAME,
  SYSTEM_REASON_OUTFIT_SYNC,
} from "../constants.ts";

/**
 * Maps outfit tool proposals into character.set_outfit commands.
 */
export function createTransitionContributor(): TransitionContributor {
  return {
    contribute(_input, ctx) {
      const bag = ctx.extras as Record<string, unknown>;
      const proposal = bag[EXTRAS_OUTFIT_PROPOSAL];
      if (typeof proposal !== "string" || proposal.trim().length === 0) {
        return ok({ commands: [] });
      }

      const command: StateCommand = {
        commandId: `cmd_${crypto.randomUUID().replace(/-/g, "")}`,
        type: COMMAND_TYPES.setOutfit,
        slice: SLICE_NAME,
        payload: { outfit: proposal.trim() },
        reason: SYSTEM_REASON_OUTFIT_SYNC,
        source: { kind: "module", id: MODULE_ID },
      };
      return ok({ commands: [command] });
    },
  };
}
