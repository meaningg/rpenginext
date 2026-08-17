import {
  ok,
  type AgentTask,
  type AgentTaskContributor,
} from "@rpengineext/contracts";

import {
  MODULE_ID,
  SYSTEM_REASON_OUTFIT_SYNC,
  TASK_TYPES,
  TOOL_IDS,
} from "../constants.ts";
import { OutfitSyncInputSchema } from "../schema/agents.ts";

/**
 * Enqueues character.outfit_sync on background system turns.
 */
export function createOutfitSyncTaskContributor(): AgentTaskContributor {
  return {
    contribute({ stage, turnKind, rawAction }, ctx) {
      if (stage !== "plan") {
        return ok({ tasks: [] });
      }
      if (turnKind !== "system") {
        return ok({ tasks: [] });
      }
      if (rawAction?.kind !== "system") {
        return ok({ tasks: [] });
      }
      if (rawAction.text !== SYSTEM_REASON_OUTFIT_SYNC) {
        return ok({ tasks: [] });
      }

      const parsed = OutfitSyncInputSchema.safeParse(rawAction.payload ?? {});
      if (!parsed.success) {
        ctx.log.warn(
          { moduleId: MODULE_ID, issues: parsed.error.flatten() },
          "outfit_sync payload invalid; skipping agent",
        );
        return ok({ tasks: [] });
      }

      const task: AgentTask = {
        taskId: `tsk_${crypto.randomUUID().replace(/-/g, "")}`,
        type: TASK_TYPES.outfitSync,
        turnId: ctx.turnId,
        input: parsed.data,
        constraints: {
          timeoutMs: 20_000,
          maxRepairAttempts: 1,
          maxToolRounds: 3,
          temperature: 0.2,
          tools: [TOOL_IDS.updateOutfit],
          optional: true,
        },
        requester: { kind: "module", id: MODULE_ID },
      };
      return ok({ tasks: [task] });
    },
  };
}
