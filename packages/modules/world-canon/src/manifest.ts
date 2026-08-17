import type { ModuleManifest } from "@rpengineext/contracts";

import { CAPABILITY_ID, MODULE_ID, SLICE_NAME } from "./constants.ts";

/**
 * Module manifest for world canon.
 */
export const worldCanonManifest: ModuleManifest = {
  id: MODULE_ID,
  version: "0.1.0",
  displayName: "World Canon",
  description:
    "Seeds immutable world canon from story JSON and injects it into the narrative system prompt",
  engines: {
    core: "^0.1.0",
    contracts: "^0.1.0",
  },
  priority: 15,
  provides: [CAPABILITY_ID],
  requires: ["capability:state-core"],
  permissions: ["state:read", `state:propose:${SLICE_NAME}`],
  stateSlices: [{ name: SLICE_NAME, schemaVersion: 1 }],
  registers: [
    `slice:${SLICE_NAME}`,
    "command:world_canon.*",
    CAPABILITY_ID,
  ],
  contributes: [
    "SessionBootstrap",
    "NarrativeContextProvider",
    "NarrativePromptContributor",
  ],
  interceptors: [],
};
