import type { NarrativeSectionInput } from "@rpengineext/module-sdk";

import type { JsonObject } from "@rpengineext/contracts";

import {
  DEFAULT_CLIMAX_SATURATED_BEATS,
  DEFAULT_HARD_SATURATED_BEATS,
  NARRATIVE_SECTION_ID,
  NARRATIVE_SECTION_PRIORITY,
  NARRATIVE_SECTION_TITLE,
} from "./constants.ts";
import type { GuidanceMode, Urgency } from "./constants.ts";
import type { SceneControllerConfig } from "./config.ts";
import type { SceneControllerSlice, SceneType } from "./schema.ts";

/** Config slice consumed by the deterministic escalation ladder. */
type TempoConfig = Pick<
  SceneControllerConfig,
  "climaxSaturatedBeats" | "hardSaturatedBeats"
>;

const DEFAULT_TEMPO_CONFIG: TempoConfig = {
  climaxSaturatedBeats: DEFAULT_CLIMAX_SATURATED_BEATS,
  hardSaturatedBeats: DEFAULT_HARD_SATURATED_BEATS,
};

/**
 * Projection of LLM verdicts into guidance — pure, no stored state.
 * Everything (mode, urgency, loop) originates from the probe; this file only
 * shapes it into narrative text / brief / guard decisions.
 */

/**
 * Neutral per-type fallback hints. Used only when the verdict carries no
 * contextual hint. Every template is outcome-neutral and genre-agnostic —
 * none pushes toward conflict, enemies or chases.
 */
export const DEFAULT_RESOLUTION_HINTS: Readonly<Record<SceneType, string>> = {
  social: "Разговор приходит к итогу, стороны расходятся с ясным результатом.",
  exploration: "Ключевое найдено или ясно, что больше здесь ничего нет, — герой двигается дальше.",
  confrontation:
    "Столкновение получает исход, ставящий точку: победа, отступление или исчерпание иным способом.",
  negotiation:
    "Договорённость достигнута или сорвана — окончательно.",
  mystery: "Найдена улика или ответ, достаточный, чтобы двигаться дальше.",
  travel: "Путь завершён: прибытие, препятствие позади или смена направления.",
  preparation:
    "Подготовка закончена: план и средства готовы, начинается собственно действие.",
  downtime:
    "Отдых завершён: герой восстановился, мир предлагает новое.",
  ceremony:
    "Событие отыграно, герой выходит из него с ясным результатом.",
  discovery: "Знание получено, осмыслено и применено.",
  conflict:
    "Конфликт исчерпан: одна из сторон добивается своего или он снят иначе.",
  other: "Сцена завершается естественно по своему контексту, без повторения сыгранных битов.",
};

/**
 * Deterministic escalation floor from the progress clock. Content-neutral:
 * it only encodes "the model has judged the scene near-done for N consecutive
 * unresolved probes" (see `highProgressBeats`), never a genre/quality call.
 *
 * @param slice - scene-controller slice
 * @param config - tempo thresholds (fall back to defaults when omitted)
 * @returns 0 none · 2 climax · 3 hard
 */
export function deriveDeterministicFloor(
  slice: SceneControllerSlice,
  config?: TempoConfig,
): Urgency {
  if (!slice.current) return 0;
  const cfg = config ?? DEFAULT_TEMPO_CONFIG;
  const beats = slice.highProgressBeats ?? 0;
  if (beats >= cfg.hardSaturatedBeats) return 3;
  if (beats >= cfg.climaxSaturatedBeats) return 2;
  return 0;
}

/**
 * Effective urgency for guidance: the model's own urgency, never lower than
 * the deterministic progress-clock floor. The floor cannot be cancelled by a
 * noisy (oscillating) model verdict — a saturated scene stays escalated.
 *
 * @param slice - scene-controller slice
 * @param config - tempo thresholds
 */
export function effectiveUrgency(
  slice: SceneControllerSlice,
  config?: TempoConfig,
): Urgency {
  const model = slice.lastVerdict?.urgency ?? 0;
  const floor = deriveDeterministicFloor(slice, config);
  return (model > floor ? model : floor) as Urgency;
}

/**
 * Derived guidance mode for the current scene.
 *
 * - `null` — no active scene (nothing to guide)
 * - `develop` — proceeding normally
 * - `climax` — scene exhausted; conclude within 1–2 turns
 * - `hard` — recycled for several turns; conclusion mandatory next turn
 *
 * Model `urgency`/`loop` verdicts as before, plus the deterministic
 * progress-clock floor (a scene judged near-done that never resolves).
 *
 * @param slice - scene-controller slice
 * @param config - tempo thresholds (optional; defaults when omitted)
 */
export function deriveGuidanceMode(
  slice: SceneControllerSlice,
  config?: TempoConfig,
): GuidanceMode | null {
  if (!slice.current) return null;
  const verdict = slice.lastVerdict;
  if (!verdict) return "develop";
  const urgency = effectiveUrgency(slice, config);
  if (slice.loopLevel === "hard" || urgency === 3) return "hard";
  if (slice.loopLevel === "soft" || urgency === 2) return "climax";
  return "develop";
}

/**
 * Resolution hint precedence: verdict hint → config per-type template →
 * built-in neutral per-type template.
 *
 * @param slice - scene-controller slice
 * @param config - module config
 */
export function resolveResolutionHint(
  slice: SceneControllerSlice,
  config: SceneControllerConfig,
): string | null {
  if (!slice.current) return null;
  const fromVerdict = slice.lastVerdict?.resolutionHint?.trim();
  if (fromVerdict) return fromVerdict;
  const fromConfig = config.resolutionHints[slice.current.type];
  if (fromConfig?.trim()) return fromConfig;
  return DEFAULT_RESOLUTION_HINTS[slice.current.type];
}

function quote(value: string): string {
  return `«${value}»`;
}

/**
 * Builds the SCENE CONTROL narrative section for the current turn.
 *
 * @param slice - scene-controller slice
 * @param config - module config
 */
export function buildSceneControlSection(
  slice: SceneControllerSlice,
  config: SceneControllerConfig,
): NarrativeSectionInput | null {
  const mode = deriveGuidanceMode(slice, config);
  if (!mode || !slice.current) return null;

  const scene = slice.current;
  const label = scene.label.trim() ? quote(scene.label) : "текущая";
  const type = scene.type;
  const beat = scene.beat;

  let text: string;
  if (mode === "develop") {
    text = [
      `Активная сцена: ${label} (${type}), ход ${beat}.`,
      "Веди сцену к естественной развязке: каждый ход должен продвигать действие — новые факты, события или выборы.",
      "Не повторяй уже сыгранный поворот (тот же исход, тот же приём): один раз максимум, дальше только развитие или завершение.",
    ].join("\n");
  } else if (mode === "climax") {
    const hint = resolveResolutionHint(slice, config);
    text = [
      `Сцена ${label} (${type}) идёт ${beat} ходов и исчерпала развитие.`,
      "Заверши её в ближайшие один-два хода: кульминация, решение и последствия.",
      "Повторение уже сыгранных событий недопустимо.",
      ...(hint ? [`Завершение должно быть органично контексту сцены: ${hint}`] : []),
    ].join("\n");
  } else {
    const hint = resolveResolutionHint(slice, config);
    text = [
      `ЖЁСТКИЙ ПРЕДЕЛ: сцена ${label} (${type}) идёт ${beat} ходов и повторяет одни и те же биты.`,
      "Развязка обязательна в этом ходе — событие, окончательно и органично закрывающее сцену",
      ...(hint ? [`(ориентир: ${hint})`] : []),
      "Дальше история переходит к новой сцене.",
    ].join("\n");
  }

  return {
    id: NARRATIVE_SECTION_ID,
    title: NARRATIVE_SECTION_TITLE,
    priority: NARRATIVE_SECTION_PRIORITY,
    channel: "system",
    text,
  };
}

/**
 * Structured brief contribution for the narrative writer.
 *
 * @param slice - scene-controller slice
 * @param config - module config
 */
export function buildSceneBrief(
  slice: SceneControllerSlice,
  config: SceneControllerConfig,
): JsonObject | null {
  const mode = deriveGuidanceMode(slice, config);
  if (!mode || !slice.current) return null;
  return {
    scene: {
      id: slice.current.id,
      label: slice.current.label,
      type: slice.current.type,
      beat: slice.current.beat,
    },
    tempo: {
      mode,
      urgency: effectiveUrgency(slice, config),
      loopLevel: slice.loopLevel,
      consecutiveStalls: slice.consecutiveStalls,
      highProgressBeats: slice.highProgressBeats,
    },
    resolutionHint: resolveResolutionHint(slice, config),
  };
}

/**
 * Hard-stop guard decision — LLM-driven.
 *
 * Blocks only when the probe judged the scene loop `hard` AND the player
 * action text is exactly identical (after trim) to the previous turn's.
 * Semantic repetition is the LLM's call; this is a plain anti-spam rule.
 * The last player text comes from the `working_memory.window` readModel.
 *
 * @param slice - scene-controller slice
 * @param actionText - current normalized player text
 * @param lastUserText - previous turn's player text (working-memory)
 * @param hardStopEnabled - config toggle
 */
export function shouldDenyRepeatedAction(
  slice: SceneControllerSlice,
  actionText: string | undefined,
  lastUserText: string | undefined,
  hardStopEnabled: boolean,
): boolean {
  if (!hardStopEnabled) return false;
  if (slice.loopLevel !== "hard") return false;
  const text = actionText?.trim();
  if (!text || !lastUserText) return false;
  return text === lastUserText.trim();
}
