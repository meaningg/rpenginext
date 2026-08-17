import {
  err,
  failure,
  ok,
  type AgentToolHandler,
  type JsonObject,
} from "@rpengineext/contracts";

import {
  EXTRAS_OUTFIT_PROPOSAL,
  MAX_OUTFIT_LENGTH,
  TOOL_IDS,
} from "../constants.ts";
import { UpdateOutfitArgsSchema } from "../schema/agents.ts";

/**
 * Tool handler: validates outfit and records proposal in turn extras.
 * Does not commit world state.
 */
export function createUpdateOutfitToolHandler(): AgentToolHandler {
  return {
    id: TOOL_IDS.updateOutfit,
    description:
      "Update the player character outfit to a full single-string description.",
    invoke(args, ctx) {
      const parsed = UpdateOutfitArgsSchema.safeParse(args);
      if (!parsed.success) {
        return err(
          failure("SCHEMA_INVALID", "invalid update_outfit args", {
            details: parsed.error.flatten(),
          }),
        );
      }
      const outfit = parsed.data.outfit.trim();
      if (!outfit) {
        return err(failure("SCHEMA_INVALID", "outfit must be non-empty"));
      }
      if (outfit.length > MAX_OUTFIT_LENGTH) {
        return err(
          failure(
            "SCHEMA_INVALID",
            `outfit exceeds max length ${MAX_OUTFIT_LENGTH}`,
          ),
        );
      }

      const bag = ctx.extras as Record<string, unknown>;
      bag[EXTRAS_OUTFIT_PROPOSAL] = outfit;

      const result: JsonObject = { ok: true, outfit };
      return ok(result);
    },
  };
}
