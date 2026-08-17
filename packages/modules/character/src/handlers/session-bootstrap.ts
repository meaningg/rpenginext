import {
  ok,
  type SessionBootstrap,
  type StateCommand,
} from "@rpengineext/contracts";

import { COMMAND_TYPES, MODULE_ID, SLICE_NAME } from "../constants.ts";
import { StoryCharacterSchema } from "../schema/commands.ts";

/**
 * Seeds character slice from session meta.character when present.
 */
export function createSessionBootstrap(): SessionBootstrap {
  return {
    bootstrap({ isNewGame, meta }) {
      if (!isNewGame) {
        return ok({ commands: [] });
      }
      const raw = meta.character;
      const parsed = StoryCharacterSchema.safeParse(raw);
      if (!parsed.success) {
        return ok({ commands: [] });
      }

      const command: StateCommand = {
        commandId: createCommandId(),
        type: COMMAND_TYPES.seed,
        slice: SLICE_NAME,
        payload: {
          name: parsed.data.name.trim(),
          appearance: parsed.data.appearance.trim(),
          features: parsed.data.features.trim(),
          outfit: parsed.data.outfit.trim(),
        },
        reason: "seed player character from story template",
        source: { kind: "module", id: MODULE_ID },
      };
      return ok({ commands: [command] });
    },
  };
}

function createCommandId(): string {
  return `cmd_${crypto.randomUUID().replace(/-/g, "")}`;
}
