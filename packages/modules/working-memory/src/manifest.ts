import type { ModuleManifest } from "@rpengineext/contracts";

import {
  CAPABILITY_ID,
  MODULE_ID,
  SLICE_NAME,
} from "./constants.ts";

/**
 * Module manifest for working-memory.
 */
export const workingMemoryManifest: ModuleManifest = {
  id: MODULE_ID,
  version: "0.1.0",
  displayName: "Working Memory",
  description:
    "Stores all player free_text ↔ narrative pairs and injects last N pairs into narrative.write",
  engines: {
    core: "^0.1.0",
    contracts: "^0.1.0",
  },
  priority: 10,
  provides: [CAPABILITY_ID],
  requires: ["capability:state-core"],
  permissions: ["state:read", `state:propose:${SLICE_NAME}`],
  stateSlices: [{ name: SLICE_NAME, schemaVersion: 1 }],
  registers: [
    `slice:${SLICE_NAME}`,
    "command:working_memory.*",
    `config:${SLICE_NAME}`,
    "read-model:working_memory.window",
    "read-model:working_memory.all",
    CAPABILITY_ID,
  ],
  contributes: ["NarrativeContextProvider", "PostNarrativeContributor"],
  interceptors: [],
};
