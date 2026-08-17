import {
  ok,
  type SessionBootstrap,
  type StateCommand,
} from "@rpengineext/contracts";

import { COMMAND_TYPES, MODULE_ID, SLICE_NAME } from "../constants.ts";
import { StoryWorldCanonSchema } from "../schema/commands.ts";

/**
 * Seeds world_canon slice from session meta.worldCanon when present.
 */
export function createSessionBootstrap(): SessionBootstrap {
  return {
    bootstrap({ isNewGame, meta }) {
      if (!isNewGame) {
        return ok({ commands: [] });
      }
      const raw = meta.worldCanon;
      const parsed = StoryWorldCanonSchema.safeParse(raw);
      if (!parsed.success) {
        return ok({ commands: [] });
      }

      const text = parsed.data.trim();
      if (text.length === 0) {
        return ok({ commands: [] });
      }

      const command: StateCommand = {
        commandId: createCommandId(),
        type: COMMAND_TYPES.seed,
        slice: SLICE_NAME,
        payload: { text },
        reason: "seed world canon from story template",
        source: { kind: "module", id: MODULE_ID },
      };
      return ok({ commands: [command] });
    },
  };
}

function createCommandId(): string {
  return `cmd_${crypto.randomUUID().replace(/-/g, "")}`;
}
