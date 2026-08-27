import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import {
  DEFAULT_CLIMAX_SATURATED_BEATS,
  DEFAULT_HARD_SATURATED_BEATS,
  DEFAULT_HISTORY_CAP,
  DEFAULT_PROGRESS_HIGH,
  MAX_HINT_LENGTH,
} from "./constants.ts";
import { SceneTypeSchema, type SceneType } from "./schema.ts";

/**
 * Validated host config section for scene-controller.
 *
 * All knobs are data sizing / feature toggles. There are no content
 * heuristics: every judgment about scenes comes from the LLM probe.
 */
export const SceneControllerConfigObjectSchema = z
  .object({
    /** Closed-scene log cap. */
    historyCap: z.number().int().positive().default(DEFAULT_HISTORY_CAP),
    /** Schedule the per-turn LLM probe (off = module inert except bookkeeping). */
    probeEnabled: z.boolean().default(true),
    /** Hard-stop guard: deny an action identical to the previous one when the LLM judged the scene loop "hard". */
    hardStopEnabled: z.boolean().default(true),
    /** Progress-clock saturation threshold: probe `progress >= this` counts as "scene nearly done". */
    saturatedProgress: z.number().min(0).max(1).default(DEFAULT_PROGRESS_HIGH),
    /** Saturated probes before guidance escalates to climax (urgency floor 2). */
    climaxSaturatedBeats: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_CLIMAX_SATURATED_BEATS),
    /** Saturated probes before guidance escalates to hard (urgency floor 3). */
    hardSaturatedBeats: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_HARD_SATURATED_BEATS),
    /** Per-type neutral resolution templates; used only when the verdict provides no hint. */
    resolutionHints: z
      .record(SceneTypeSchema, z.string().min(1).max(MAX_HINT_LENGTH))
      .default({} as Record<z.infer<typeof SceneTypeSchema>, string>),
  })
  .strict();

export const SceneControllerConfigSchema =
  SceneControllerConfigObjectSchema as unknown as z.ZodType<JsonObject>;

export type SceneControllerConfig = {
  readonly historyCap: number;
  readonly probeEnabled: boolean;
  readonly hardStopEnabled: boolean;
  readonly saturatedProgress: number;
  readonly climaxSaturatedBeats: number;
  readonly hardSaturatedBeats: number;
  readonly resolutionHints: Partial<Record<SceneType, string>>;
};

/**
 * Resolves factory options against defaults (validated).
 *
 * @param options - factory options
 */
export function resolveSceneControllerConfig(
  options: SceneControllerModuleFactoryOptions = {},
): SceneControllerConfig {
  const parsed = SceneControllerConfigObjectSchema.safeParse({
    historyCap: options.historyCap,
    probeEnabled: options.probeEnabled,
    hardStopEnabled: options.hardStopEnabled,
    saturatedProgress: options.saturatedProgress,
    climaxSaturatedBeats: options.climaxSaturatedBeats,
    hardSaturatedBeats: options.hardSaturatedBeats,
    resolutionHints: options.resolutionHints,
  });
  if (parsed.success) return parsed.data;
  return SceneControllerConfigObjectSchema.parse({});
}

/**
 * Factory options for {@link createSceneControllerModule}.
 */
export interface SceneControllerModuleFactoryOptions {
  readonly historyCap?: number;
  readonly probeEnabled?: boolean;
  readonly hardStopEnabled?: boolean;
  readonly saturatedProgress?: number;
  readonly climaxSaturatedBeats?: number;
  readonly hardSaturatedBeats?: number;
  readonly resolutionHints?: Partial<Record<SceneType, string>>;
}