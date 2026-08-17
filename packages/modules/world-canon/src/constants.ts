/**
 * Stable ids for the world-canon module.
 */
export const MODULE_ID = "world-canon" as const;

/** WorldState slice name. */
export const SLICE_NAME = "world_canon" as const;

/** Host moduleConfig / registerConfigSchema key. */
export const CONFIG_KEY = "world_canon" as const;

/** Capability provided by this module. */
export const CAPABILITY_ID = "capability:world-canon" as const;

/** Command type ids. */
export const COMMAND_TYPES = {
  seed: "world_canon.seed",
} as const;

/** NarrativeContextProvider namespace. */
export const NARRATIVE_NAMESPACE = "world_canon" as const;

/** Max world canon text length (characters). */
export const MAX_CANON_LENGTH = 32_000;

/** Narrative prompt section priority (before character profile). */
export const PROMPT_SECTION_PRIORITY = 10;
