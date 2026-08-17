import {
  ok,
  type PostNarrativeContributor,
  type StateCommand,
} from "@rpengineext/contracts";

import { COMMAND_TYPES, MODULE_ID, SLICE_NAME } from "../constants.ts";

/**
 * Creates PostNarrativeContributor that appends free_text ↔ prose pairs.
 */
export function createPostNarrativeContributor(): PostNarrativeContributor {
  return {
    contribute({ passage, rawAction, turnKind }) {
      if (turnKind !== "player") {
        return ok({ commands: [] });
      }
      if (rawAction.kind !== "free_text") {
        return ok({ commands: [] });
      }
      const user = rawAction.text?.trim() ?? "";
      if (!user) {
        return ok({ commands: [] });
      }
      const assistant = passage.prose.trim();
      if (!assistant) {
        return ok({ commands: [] });
      }

      const command: StateCommand = {
        commandId: createCommandId(),
        type: COMMAND_TYPES.appendPair,
        slice: SLICE_NAME,
        payload: {
          turnId: passage.turnId,
          user,
          assistant,
          createdAt: new Date().toISOString(),
        },
        reason: "working-memory pair for free_text turn",
        source: { kind: "module", id: MODULE_ID },
      };

      return ok({ commands: [command] });
    },
  };
}

function createCommandId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return `cmd_${uuid}`;
}
