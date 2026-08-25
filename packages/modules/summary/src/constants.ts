import { SLICE_NAME as WORKING_MEMORY_SLICE_NAME } from "@rpengineext/module-working-memory";

/**
 * Stable ids for the summary module.
 */
export const MODULE_ID = "summary" as const;

/** WorldState slice name. */
export const SLICE_NAME = "summary" as const;

/** Host moduleConfig / registerConfigSchema key. */
export const CONFIG_KEY = "summary" as const;

/** Capability provided by this module. */
export const CAPABILITY_ID = "capability:summary" as const;

/** Command type ids. */
export const COMMAND_TYPES = {
  storeSummary: "summary.store_summary",
} as const;

/** Agent task type. */
export const TASK_TYPES = {
  make: "summary.make",
} as const;

/** Agent tool id. */
export const TOOL_IDS = {
  store: "summary.store",
} as const;

/** System turn reason for background summary creation. */
export const SYSTEM_REASON_MAKE_SUMMARY = "summary.make" as const;

/** NarrativeContextProvider namespace. */
export const NARRATIVE_NAMESPACE = "summary" as const;

/**
 * Section priority in the narrative system prompt.
 * world-canon uses 15, character uses 20 — the story summary sits after them.
 */
export const PROMPT_SECTION_PRIORITY = 25;

/** Max length of a single summary chunk text. */
export const MAX_SUMMARY_LENGTH = 4_000;

/** Working-memory slice this module reads (kept in sync with module-working-memory). */
export { WORKING_MEMORY_SLICE_NAME };
