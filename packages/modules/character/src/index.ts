import {
  type AgentTaskTypeDefinition,
  type AgentToolDefinition,
  type CommandDefinition,
  type Module,
  type SliceDefinition,
} from "@rpengineext/contracts";

import { buildOutfitSyncMessages } from "./agents/outfit-sync-messages.ts";
import { applySeed } from "./apply/seed.ts";
import { applySetOutfit } from "./apply/set-outfit.ts";
import {
  COMMAND_TYPES,
  MODULE_ID,
  SLICE_NAME,
  TASK_TYPES,
  TOOL_IDS,
} from "./constants.ts";
import { createNarrativeContextProvider } from "./handlers/narrative-context.ts";
import { createOutfitSyncTaskContributor } from "./handlers/outfit-sync-contributor.ts";
import { createPromptFragmentProvider } from "./handlers/prompt-fragments.ts";
import { createSessionBootstrap } from "./handlers/session-bootstrap.ts";
import { createStatusPanelProvider } from "./handlers/status-panel.ts";
import { createSystemTurnScheduler } from "./handlers/system-scheduler.ts";
import { createTransitionContributor } from "./handlers/transition-contributor.ts";
import { createUpdateOutfitToolHandler } from "./handlers/update-outfit-tool.ts";
import { characterManifest } from "./manifest.ts";
import {
  OutfitSyncInputJsonSchema,
  OutfitSyncOutputJsonSchema,
  UPDATE_OUTFIT_PARAMETERS_JSON,
  UpdateOutfitArgsJsonSchema,
  UpdateOutfitResultJsonSchema,
} from "./schema/agents.ts";
import {
  SeedCharacterPayloadJsonSchema,
  SetOutfitPayloadJsonSchema,
} from "./schema/commands.ts";
import {
  CharacterSliceJsonSchema,
  createEmptyCharacterSlice,
} from "./schema/slice.ts";

export {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  EXTRAS_OUTFIT_PROPOSAL,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  SLICE_NAME,
  SYSTEM_REASON_OUTFIT_SYNC,
  TASK_TYPES,
  TOOL_IDS,
} from "./constants.ts";
export type { CharacterSlice } from "./schema/slice.ts";
export type { StoryCharacter } from "./schema/commands.ts";
export { parseCharacterSlice, createEmptyCharacterSlice } from "./schema/slice.ts";
export { StoryCharacterSchema } from "./schema/commands.ts";
export { buildOutfitSyncMessages } from "./agents/outfit-sync-messages.ts";

/**
 * Creates the player-character product module.
 */
export function createCharacterModule(): Module {
  const sliceDef: SliceDefinition = {
    name: SLICE_NAME,
    schemaVersion: 1,
    schema: CharacterSliceJsonSchema,
    initialValue: createEmptyCharacterSlice() as never,
  };

  const seedCommand: CommandDefinition = {
    type: COMMAND_TYPES.seed,
    slice: SLICE_NAME,
    payloadSchema: SeedCharacterPayloadJsonSchema,
    apply: applySeed,
  };

  const setOutfitCommand: CommandDefinition = {
    type: COMMAND_TYPES.setOutfit,
    slice: SLICE_NAME,
    payloadSchema: SetOutfitPayloadJsonSchema,
    apply: applySetOutfit,
  };

  const outfitSyncTask: AgentTaskTypeDefinition = {
    type: TASK_TYPES.outfitSync,
    inputSchema: OutfitSyncInputJsonSchema,
    outputSchema: OutfitSyncOutputJsonSchema,
    description:
      "Decide whether PC outfit changed this turn; may call character.update_outfit",
    defaultConstraints: {
      timeoutMs: 20_000,
      maxRepairAttempts: 1,
      maxToolRounds: 3,
      optional: true,
      tools: [TOOL_IDS.updateOutfit],
    },
    buildMessages: buildOutfitSyncMessages,
  };

  const updateOutfitTool: AgentToolDefinition = {
    id: TOOL_IDS.updateOutfit,
    description:
      "Set the player character outfit to a full single-string description",
    argsSchema: UpdateOutfitArgsJsonSchema,
    resultSchema: UpdateOutfitResultJsonSchema,
    parametersJsonSchema: UPDATE_OUTFIT_PARAMETERS_JSON,
  };

  return {
    manifest: characterManifest,
    register(ctx) {
      ctx.registerSlice(sliceDef);
      ctx.registerCommand(seedCommand);
      ctx.registerCommand(setOutfitCommand);
      ctx.registerAgentTaskType(outfitSyncTask);
      ctx.registerAgentTool(updateOutfitTool);
      ctx.registerCapability(characterManifest.provides[0]!);

      ctx.addSessionBootstrap(createSessionBootstrap());
      ctx.addNarrativeContextProvider(createNarrativeContextProvider());
      ctx.addPromptFragmentProvider(createPromptFragmentProvider());
      ctx.addSystemTurnScheduler(createSystemTurnScheduler());
      ctx.addAgentTaskContributor(createOutfitSyncTaskContributor());
      ctx.addTransitionContributor(createTransitionContributor());
      ctx.addAgentToolHandler(createUpdateOutfitToolHandler());
      ctx.addStatusPanelProvider(createStatusPanelProvider());

      ctx.log.info({ moduleId: MODULE_ID }, "character module registered");
      return;
    },
  };
}
