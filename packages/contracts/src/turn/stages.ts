import { z } from "zod";

/**
 * Fixed turn pipeline stage ids (v1). Order is normative; modules cannot reorder.
 * @see docs/architecture/06-turn-pipeline.md
 */
export const STAGE_IDS = [
  "begin",
  "normalize",
  "intent",
  "guard",
  "plan",
  "propose",
  "validate_commands",
  "narrate",
  "present",
  "commit",
  "after",
  "end",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export const StageIdSchema = z.enum(STAGE_IDS);

/**
 * Lifecycle points that accept stage interceptors beyond pipeline stages.
 */
export const INTERCEPTOR_STAGE_IDS = [
  ...STAGE_IDS,
  "session.start",
  "session.stop",
  "turn.begin",
  "turn.end",
] as const;

export type InterceptorStageId = (typeof INTERCEPTOR_STAGE_IDS)[number];

export const InterceptorStageIdSchema = z.enum(INTERCEPTOR_STAGE_IDS);

export const INTERCEPTOR_WHEN = ["before", "after", "onError"] as const;
export type InterceptorWhen = (typeof INTERCEPTOR_WHEN)[number];
export const InterceptorWhenSchema = z.enum(INTERCEPTOR_WHEN);

/**
 * Turn kinds accepted by the pipeline.
 */
export const TURN_KINDS = ["player", "system", "restore"] as const;
export type TurnKind = (typeof TURN_KINDS)[number];
export const TurnKindSchema = z.enum(TURN_KINDS);
