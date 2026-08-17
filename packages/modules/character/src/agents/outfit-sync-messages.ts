import type { AgentTask, LlmMessage } from "@rpengineext/contracts";

import { TOOL_IDS } from "../constants.ts";
import { OutfitSyncInputSchema } from "../schema/agents.ts";

/**
 * Builds LLM messages for character.outfit_sync.
 *
 * @param task - agent task
 */
export function buildOutfitSyncMessages(task: AgentTask): readonly LlmMessage[] {
  const parsed = OutfitSyncInputSchema.safeParse(task.input);
  const input = parsed.success
    ? parsed.data
    : {
        sourceTurnId: String(task.input.sourceTurnId ?? task.turnId),
        userText: String(task.input.userText ?? ""),
        prose: String(task.input.prose ?? ""),
        characterBefore: {
          name: "",
          appearance: "",
          features: "",
          outfit: "",
        },
      };

  const system = [
    "You maintain the player character's CURRENT OUTFIT for a turn-based RP engine.",
    "You receive the player action and the narrative prose for THIS turn only.",
    "Decide whether the character's clothing/gear visibly changed as an established fact.",
    `If yes, call tool ${TOOL_IDS.updateOutfit} once with the FULL new outfit as one string (not a partial diff).`,
    "If unsure or no clothing change, do NOT call tools.",
    "When finished, output ONLY JSON: { \"changed\": boolean }.",
    "changed=true only if you successfully called the tool; otherwise changed=false.",
    "Do not narrate. Do not invent unrelated wardrobe changes.",
  ].join("\n");

  const user = {
    taskType: "character.outfit_sync",
    sourceTurnId: input.sourceTurnId,
    userText: input.userText,
    prose: input.prose,
    characterBefore: input.characterBefore,
  };

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify(user, null, 2),
    },
  ];
}
