/**
 * Stable ids for the scene-controller module.
 */

/** Module id (kebab-case). */
export const MODULE_ID = "scene-controller" as const;

/** WorldState slice name. */
export const SLICE_NAME = "scene_controller" as const;

/** Host moduleConfig key. */
export const CONFIG_KEY = "scene_controller" as const;

/** Command (op) type ids — namespaced journal entries. */
export const COMMAND_TYPES = {
  recordTurn: "scene_controller.record_turn",
  probeReport: "scene_controller.probe_report",
} as const;

/** Local key of the scene-probe agent task. */
export const TASK_PROBE = "probe" as const;

/** Local key of the report_scene tool. */
export const TOOL_REPORT_SCENE_LOCAL = "report_scene" as const;

/** Namespaced agent tool id exposed to the model. */
export const TOOL_IDS = {
  reportScene: "scene_controller.report_scene",
} as const;

/** System turn reason for the per-turn scene probe. */
export const SYSTEM_REASON_PROBE = "scene_controller.probe" as const;

/** Host read-model ids. */
export const READ_MODEL_STATUS = "scene_controller.status" as const;
export const READ_MODEL_HISTORY = "scene_controller.history" as const;

/** Guard denial code for the hard stop on recycled actions. */
export const FAILURE_REPEAT_CAP = "SCENE_REPEAT_CAP" as const;

/** Narrative section identity. */
export const NARRATIVE_SECTION_ID = "scene_controller.control" as const;
export const NARRATIVE_SECTION_TITLE = "SCENE CONTROL" as const;
export const NARRATIVE_SECTION_PRIORITY = 10;

/** Default cap for the scene history log. */
export const DEFAULT_HISTORY_CAP = 10;

/**
 * Progress-clock saturation threshold. A probe that reports `progress` at or
 * above this value is the model's own judgment that the scene is nearly over;
 * the deterministic escalation ladder uses it as the trigger signal.
 */
export const DEFAULT_PROGRESS_HIGH = 0.85;

/**
 * Consecutive saturated-progress probes (without resolving) before guidance
 * deterministically escalates to `climax` (urgency floor 2).
 */
export const DEFAULT_CLIMAX_SATURATED_BEATS = 3;

/**
 * Consecutive saturated-progress probes (without resolving) before guidance
 * deterministically escalates to `hard` (urgency floor 3).
 */
export const DEFAULT_HARD_SATURATED_BEATS = 6;

/** Capability token required from working-memory (provides probe context). */
export const REQUIRES_WORKING_MEMORY = "capability:working-memory" as const;

/** working-memory readModel providing the recent-pairs context. */
export const WORKING_MEMORY_WINDOW_MODEL = "working_memory.window" as const;

/** Loop recycling severity levels (LLM-judged). */
export const LOOP_LEVELS = ["none", "soft", "hard"] as const;
export type LoopLevel = (typeof LOOP_LEVELS)[number];

/**
 * Scene types. Deliberately broad and neutral: no genre bias toward
 * chase/combat; the probe picks whichever type the evidence actually shows.
 */
export const SCENE_TYPES = [
  "social",
  "exploration",
  "confrontation",
  "negotiation",
  "mystery",
  "travel",
  "preparation",
  "downtime",
  "ceremony",
  "discovery",
  "conflict",
  "other",
] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

/** LLM-judged urgency scale. */
export const URGENCY_LEVELS = [0, 1, 2, 3] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

/** Guidance modes projected from verdicts. */
export const GUIDANCE_MODES = ["develop", "climax", "hard"] as const;
export type GuidanceMode = (typeof GUIDANCE_MODES)[number];

/** Max lengths for verdict / slice strings. */
export const MAX_SCENE_ID_LENGTH = 64;
export const MAX_LABEL_LENGTH = 120;
export const MAX_HINT_LENGTH = 400;