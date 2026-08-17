/**
 * Stable ids for the working-memory module.
 */
export const MODULE_ID = "working-memory" as const;

/** WorldState slice name. */
export const SLICE_NAME = "working_memory" as const;

/** Host moduleConfig / registerConfigSchema key. */
export const CONFIG_KEY = "working_memory" as const;

/** Capability provided by this module. */
export const CAPABILITY_ID = "capability:working-memory" as const;

/** Command type ids. */
export const COMMAND_TYPES = {
  appendPair: "working_memory.append_pair",
} as const;

/** Default number of pairs injected into narrative.write. */
export const DEFAULT_WINDOW_PAIRS = 12;

/** NarrativeContextProvider namespace (core lifts `.history`). */
export const NARRATIVE_NAMESPACE = "working_memory" as const;
