/**
 * Stable ids for the character module.
 */
export const MODULE_ID = "character" as const;

/** WorldState slice name. */
export const SLICE_NAME = "character" as const;

/** Host moduleConfig / registerConfigSchema key. */
export const CONFIG_KEY = "character" as const;

/** Capability provided by this module. */
export const CAPABILITY_ID = "capability:character" as const;

/** Command type ids. */
export const COMMAND_TYPES = {
  seed: "character.seed",
  setOutfit: "character.set_outfit",
} as const;

/** Agent task type. */
export const TASK_TYPES = {
  outfitSync: "character.outfit_sync",
} as const;

/** Agent tool id. */
export const TOOL_IDS = {
  updateOutfit: "character.update_outfit",
} as const;

/** System turn reason for background outfit sync. */
export const SYSTEM_REASON_OUTFIT_SYNC = "character.outfit_sync" as const;

/** NarrativeContextProvider namespace. */
export const NARRATIVE_NAMESPACE = "character" as const;

/** Turn extras key written by the update_outfit tool. */
export const EXTRAS_OUTFIT_PROPOSAL = "character.outfitProposal" as const;

/** Max outfit string length. */
export const MAX_OUTFIT_LENGTH = 500;

/** Max field lengths for static character text. */
export const MAX_FIELD_LENGTH = 2_000;
