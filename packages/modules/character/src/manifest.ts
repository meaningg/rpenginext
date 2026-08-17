import type { ModuleManifest } from "@rpengineext/contracts";

import {
  CAPABILITY_ID,
  MODULE_ID,
  SLICE_NAME,
  TASK_TYPES,
  TOOL_IDS,
} from "./constants.ts";

/**
 * Module manifest for character.
 */
export const characterManifest: ModuleManifest = {
  id: MODULE_ID,
  version: "0.1.0",
  displayName: "Player Character",
  description:
    "Seeds PC from story JSON, injects into narrative prompt, background outfit sync via tool-calling agent",
  engines: {
    core: "^0.1.0",
    contracts: "^0.1.0",
  },
  priority: 20,
  provides: [CAPABILITY_ID, `agent-task:${TASK_TYPES.outfitSync}`],
  requires: ["capability:state-core"],
  permissions: [
    "state:read",
    `state:propose:${SLICE_NAME}`,
    `agent:call:${TASK_TYPES.outfitSync}`,
  ],
  stateSlices: [{ name: SLICE_NAME, schemaVersion: 1 }],
  registers: [
    `slice:${SLICE_NAME}`,
    "command:character.*",
    `agent-task:${TASK_TYPES.outfitSync}`,
    `agent-tool:${TOOL_IDS.updateOutfit}`,
    CAPABILITY_ID,
  ],
  contributes: [
    "SessionBootstrap",
    "NarrativeContextProvider",
    "NarrativePromptContributor",
    "SystemTurnScheduler",
    "AgentTaskContributor",
    "TransitionContributor",
    "AgentTool",
    "StatusPanelProvider",
  ],
  interceptors: [],
};
