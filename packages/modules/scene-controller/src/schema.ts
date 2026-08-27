import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import {
  LOOP_LEVELS,
  MAX_HINT_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_SCENE_ID_LENGTH,
  SCENE_TYPES,
  URGENCY_LEVELS,
} from "./constants.ts";

/** Loop recycling severity (LLM-judged). */
export const LoopLevelSchema = z.enum(LOOP_LEVELS);
export type LoopLevel = z.infer<typeof LoopLevelSchema>;

/** Scene type enum (broad/neutral — see constants). */
export const SceneTypeSchema = z.enum(SCENE_TYPES);
export type SceneType = z.infer<typeof SceneTypeSchema>;

/** Urgency scale 0..3 (LLM-judged). */
export const UrgencySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Urgency = z.infer<typeof UrgencySchema>;

/**
 * Current active scene as judged by the last probe.
 */
export const SceneInfoSchema = z
  .object({
    id: z.string().min(1).max(MAX_SCENE_ID_LENGTH),
    label: z.string().max(MAX_LABEL_LENGTH),
    type: SceneTypeSchema,
    /** 1-based count of probe-confirmed turns of this scene. */
    beat: z.number().int().min(0),
    startedAtTurnId: z.string().min(1),
    lastConfirmTurnId: z.string().min(1),
    lastProgress: z.number().min(0).max(1),
  })
  .strict();

export type SceneInfo = z.infer<typeof SceneInfoSchema>;

/**
 * A closed scene log record.
 */
export const SceneRecordSchema = z
  .object({
    id: z.string().min(1).max(MAX_SCENE_ID_LENGTH),
    label: z.string().max(MAX_LABEL_LENGTH),
    type: SceneTypeSchema,
    beats: z.number().int().min(0),
    outcome: z.enum(["resolved", "transitioned"]),
    endedAtTurnId: z.string().min(1),
  })
  .strict();

export type SceneRecord = z.infer<typeof SceneRecordSchema>;

/**
 * Chat-message shape of `working_memory.window` history (probe context).
 */
export const HistoryMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })
  .strict();

export type HistoryMessage = z.infer<typeof HistoryMessageSchema>;

/**
 * Full probe verdict — the single source of truth for scene state.
 * `sceneId` is NOT part of the verdict: scene ids are assigned by the module
 * (sequential), so a confused model can never fragment scenes with random ids.
 */
export const VerdictSchema = z
  .object({
    /** True if the latest turn continues the scene in `current`. */
    sameScene: z.boolean(),
    label: z.string().max(MAX_LABEL_LENGTH).nullable(),
    type: SceneTypeSchema.nullable(),
    /** 0..1 — how close the scene is to a natural conclusion. */
    progress: z.number().min(0).max(1),
    /** True if the world outcome repeats an already-played beat. */
    stall: z.boolean(),
    /** True if the player action re-attempts the previous beat. */
    repeat: z.boolean(),
    loop: LoopLevelSchema,
    urgency: UrgencySchema,
    /** True if the latest turn actually concluded the scene. */
    resolved: z.boolean(),
    /** Contextual conclusion hint; null when not needed / no natural one. */
    resolutionHint: z.string().max(MAX_HINT_LENGTH).nullable(),
  })
  .strict();

export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Authoritative scene-controller slice.
 */
export const SceneControllerSliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    current: SceneInfoSchema.nullable(),
    /** Monotonic max of loop verdicts within the current scene. */
    loopLevel: LoopLevelSchema,
    /** Consecutive stall verdicts within the current scene. */
    consecutiveStalls: z.number().int().min(0),
    /**
     * Consecutive probes that judged the scene at `progress >= saturatedProgress`
     * without resolving. Deterministic escalation clock: grows across scene
     * transitions (a fake "new scene" that keeps near-done progress must not
     * reset it), resets only on a resolve or a real progress drop.
     */
    highProgressBeats: z.number().int().min(0).default(0),
    /** Last probe verdict (drives narrative/guard of the next turn). */
    lastVerdict: VerdictSchema.nullable(),
    /** Id of the most recent player turn (bookkeeping for scene records;
     *  feeds `observedTurnId` — the model never sees turn ids). */
    lastTurnId: z.string().nullable(),
    /** Closed scenes log (cap: factory historyCap). */
    history: z.array(SceneRecordSchema),
    counters: z
      .object({
        playerTurns: z.number().int().min(0),
        probes: z.number().int().min(0),
        resolvedScenes: z.number().int().min(0),
        /** Scene id sequence (module-assigned ids, not model-invented). */
        scenes: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type SceneControllerSlice = z.infer<typeof SceneControllerSliceSchema>;

/**
 * Empty slice for a new session.
 */
export function createEmptySceneControllerSlice(): SceneControllerSlice {
  return {
    schemaVersion: 1,
    current: null,
    loopLevel: "none",
    consecutiveStalls: 0,
    highProgressBeats: 0,
    lastVerdict: null,
    lastTurnId: null,
    history: [],
    counters: { playerTurns: 0, probes: 0, resolvedScenes: 0, scenes: 0 },
  };
}

/**
 * Safely reads the slice from world state (missing/invalid → empty).
 *
 * @param raw - slices.scene_controller value
 */
export function parseSceneControllerSlice(raw: unknown): SceneControllerSlice {
  const parsed = SceneControllerSliceSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return createEmptySceneControllerSlice();
}

/**
 * Payload of the `record_turn` op (deterministic bookkeeping only:
 * player-turn counter).
 */
export const RecordTurnPayloadSchema = z
  .object({
    turnId: z.string().min(1),
  })
  .strict();

export type RecordTurnPayload = z.infer<typeof RecordTurnPayloadSchema>;

/**
 * Input schema for the probe agent task (schedule payload).
 * Scene context (recent pairs) comes from the `working_memory.window`
 * readModel — the module keeps no own pair buffer. No turn ids are sent to
 * the model: bookkeeping ids are supplied by the tool handler from the slice.
 */
export const ProbeInputSchema = z
  .object({
    userText: z.string(),
    prose: z.string(),
    currentScene: SceneInfoSchema.nullable(),
    history: z.array(HistoryMessageSchema),
  })
  .strict();

export type ProbeInput = z.infer<typeof ProbeInputSchema>;

/**
 * Tool args for `report_scene`: the verdict only. No turn ids — the model
 * cannot mistype ids; `observedTurnId` is attached by the handler from the
 * slice (`lastTurnId`). Soft fields are optional and nullable so small models
 * that omit them are tolerated — `toVerdict` normalizes to null.
 */
export const ReportSceneArgsSchema = z
  .object({
    sameScene: z.boolean(),
    label: z.string().max(MAX_LABEL_LENGTH).nullable().optional(),
    type: SceneTypeSchema.nullable().optional(),
    progress: z.number().min(0).max(1),
    stall: z.boolean(),
    repeat: z.boolean(),
    loop: LoopLevelSchema,
    urgency: UrgencySchema,
    resolved: z.boolean(),
    resolutionHint: z.string().max(MAX_HINT_LENGTH).nullable().optional(),
  })
  .strict();

export type ReportSceneArgs = z.infer<typeof ReportSceneArgsSchema>;

/**
 * Payload of the `probe_report` op: tool args + bookkeeping ids attached by
 * the tool handler (never by the model).
 */
export const ProbeReportPayloadSchema = ReportSceneArgsSchema.extend({
  /** Player turn the verdict observes (from slice `lastTurnId`). */
  observedTurnId: z.string().min(1),
  historyCap: z.number().int().positive(),
  /**
   * Progress-clock saturation threshold (from module config). Attached by the
   * tool handler like `historyCap`; never sent by the model.
   */
  saturatedProgress: z.number().min(0).max(1),
}).strict();

export type ProbeReportPayload = z.infer<typeof ProbeReportPayloadSchema>;

/**
 * JSON Schema for the `report_scene` tool parameters. Explicit and required:
 * without it the engine sends a permissive `{additionalProperties:true}`
 * schema and small models reply with malformed (array-wrapped) args.
 */
export const REPORT_SCENE_PARAMETERS_JSON: JsonObject = {
  type: "object",
  properties: {
    sameScene: {
      type: "boolean",
      description:
        "true only if the latest turn continues the scene described in currentScene. false ONLY when a genuinely new scene began (new location, participants or goal) — a new beat of the same scene is not a scene change.",
    },
    label: {
      type: "string",
      description: "Optional short human label of the current scene (may be omitted).",
    },
    type: {
      type: "string",
      enum: [...SCENE_TYPES],
      description:
        "Optional scene type; pick what the evidence actually shows, never force a genre (may be omitted).",
    },
    progress: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "0..1 — how close the scene is to a natural conclusion (0 = just started, 1 = concluded).",
    },
    stall: {
      type: "boolean",
      description:
        "true if the world outcome repeats an already-played beat (the same threat recurs, the same obstacle re-blocks progress).",
    },
    repeat: {
      type: "boolean",
      description: "true if the player action re-attempts the previous beat.",
    },
    loop: {
      type: "string",
      enum: [...LOOP_LEVELS],
      description:
        "Recycling severity: none = fine; soft = a beat repeated once or twice; hard = several turns of recycling with no progress.",
    },
    urgency: {
      type: "integer",
      enum: [...URGENCY_LEVELS],
      description:
        "0 = fine; 1 = approaching peak; 2 = scene exhausted, conclude within 1-2 turns; 3 = recycled for several turns, conclusion MANDATORY next turn. Escalate only from actual repetition.",
    },
    resolved: {
      type: "boolean",
      description:
        "true only if the latest turn actually concluded the scene with a definitive outcome.",
    },
    resolutionHint: {
      type: "string",
      description:
        "Optional natural way to conclude THIS scene in its actual context (for urgency >= 2). Never invent conflict, enemies or chases. May be omitted.",
    },
  },
  required: [
    "sameScene",
    "progress",
    "stall",
    "repeat",
    "loop",
    "urgency",
    "resolved",
  ],
  additionalProperties: false,
};

/** Tool result (ack shape mirroring character.update_outfit). */
export const ReportSceneResultSchema = z
  .object({ ok: z.literal(true) })
  .strict();

/** Final task output after the tool round. */
export const ProbeOutputSchema = z
  .object({ reported: z.boolean() })
  .strict();

