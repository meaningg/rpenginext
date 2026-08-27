import { DEFAULT_PROGRESS_HIGH, MAX_LABEL_LENGTH } from "./constants.ts";

import type {
  LoopLevel,
  ProbeReportPayload,
  SceneControllerSlice,
  SceneInfo,
  SceneRecord,
  Verdict,
} from "./schema.ts";

/**
 * Pure slice transitions driven exclusively by LLM probe verdicts.
 * No content heuristics here — only bookkeeping (counters, history).
 * Recent-pairs context lives in working-memory (readModel), not in this slice.
 */

const LOOP_RANK: Record<LoopLevel, number> = { none: 0, soft: 1, hard: 2 };

/**
 * Max of two loop severities.
 *
 * @param a - current level
 * @param b - verdict level
 */
export function maxLoopLevel(a: LoopLevel, b: LoopLevel): LoopLevel {
  return LOOP_RANK[b] > LOOP_RANK[a] ? b : a;
}

/**
 * Next value of the deterministic progress-clock counter.
 *
 * Counts consecutive probes that judged the scene at `progress >= saturated`
 * without resolving. It is deliberately scene-transition-agnostic: a probe that
 * reports a "new" scene while keeping saturated progress (e.g. a pose change
 * that continues the same engagement) carries the counter forward instead of
 * resetting it, so a model dodging conclusion via sameScene:false cannot farm a
 * fresh clock. It resets only when progress genuinely drops below saturation or
 * when the scene is actually resolved.
 *
 * @param prev - previous counter value
 * @param progress - probe-reported progress 0..1
 * @param saturated - saturation threshold (config `saturatedProgress`)
 */
export function nextHighProgressBeats(
  prev: number,
  progress: number,
  saturated: number,
): number {
  return progress >= saturated ? prev + 1 : 0;
}

function pushHistoryRecord(
  s: SceneControllerSlice,
  record: SceneRecord,
  cap: number,
): SceneRecord[] {
  return [...s.history, record].slice(-cap);
}

function closeCurrentRecord(
  s: SceneControllerSlice,
  outcome: SceneRecord["outcome"],
  endedAtTurnId: string,
  cap: number,
): SceneRecord[] {
  const current = s.current;
  if (!current) return s.history;
  return pushHistoryRecord(
    s,
    {
      id: current.id,
      label: current.label,
      type: current.type,
      beats: current.beat,
      outcome,
      endedAtTurnId,
    },
    cap,
  );
}

/**
 * Applies `record_turn` — the only deterministic slice write beside the
 * verdict: stores the latest player turn id (bookkeeping for scene records)
 * and counts the player turn.
 *
 * @param s - slice
 * @param payload - record_turn payload
 */
export function applyRecordTurn(
  s: SceneControllerSlice,
  payload: { turnId: string },
): SceneControllerSlice {
  return {
    ...s,
    lastTurnId: payload.turnId,
    counters: { ...s.counters, playerTurns: s.counters.playerTurns + 1 },
  };
}

/**
 * Picks the strict verdict shape from a probe_report payload (dropping the
 * transport fields `sourceTurnId` / `historyCap` and normalizing optional
 * soft fields to null before storing).
 *
 * @param payload - full op payload
 */
export function toVerdict(payload: ProbeReportPayload): Verdict {
  return {
    sameScene: payload.sameScene,
    label: payload.label ?? null,
    type: payload.type ?? null,
    progress: payload.progress,
    stall: payload.stall,
    repeat: payload.repeat,
    loop: payload.loop,
    urgency: payload.urgency,
    resolved: payload.resolved,
    resolutionHint: payload.resolutionHint ?? null,
  };
}

/**
 * Applies `probe_report` — all scene-state changes come from here.
 *
 * Verdict transitions:
 * - `resolved` → close current scene as resolved, drop active scene
 * - `sameScene` (with active scene) → refresh: beat+1, loop/stall accumulation
 * - otherwise → transition: close current scene (if any) as transitioned,
 *   begin a new scene with beat 1
 *
 * @param s - slice
 * @param verdict - probe verdict
 * @param observedTurnId - player turn the verdict observes (from slice, not the model)
 * @param historyCap - closed-scene log cap (factory config)
 * @param saturatedProgress - progress-clock saturation threshold (config)
 */
export function applyProbeReport(
  s: SceneControllerSlice,
  verdict: Verdict,
  observedTurnId: string,
  historyCap: number,
  saturatedProgress: number = DEFAULT_PROGRESS_HIGH,
): SceneControllerSlice {
  const probes = s.counters.probes + 1;

  if (verdict.resolved) {
    return {
      ...s,
      current: null,
      loopLevel: "none",
      consecutiveStalls: 0,
      highProgressBeats: 0,
      lastVerdict: verdict,
      history: closeCurrentRecord(s, "resolved", observedTurnId, historyCap),
      counters: {
        ...s.counters,
        probes,
        resolvedScenes: s.counters.resolvedScenes + (s.current ? 1 : 0),
      },
    };
  }

  const continuing = s.current !== null && verdict.sameScene;
  if (continuing && s.current) {
    const current: SceneInfo = {
      ...s.current,
      beat: s.current.beat + 1,
      lastConfirmTurnId: observedTurnId,
      lastProgress: verdict.progress,
    };
    return {
      ...s,
      current,
      loopLevel: maxLoopLevel(s.loopLevel, verdict.loop),
      consecutiveStalls: verdict.stall ? s.consecutiveStalls + 1 : 0,
      highProgressBeats: nextHighProgressBeats(
        s.highProgressBeats,
        verdict.progress,
        saturatedProgress,
      ),
      lastVerdict: verdict,
      counters: { ...s.counters, probes },
    };
  }

  // Begin a new scene (first probe or transition). Scene ids are assigned by
  // the module (sequential) — the model never invents scene ids, so it cannot
  // fragment a scene with random ids.
  const scenes = s.counters.scenes + 1;
  const current: SceneInfo = {
    id: `scene-${String(scenes).padStart(3, "0")}`,
    label: verdict.label?.trim().slice(0, MAX_LABEL_LENGTH) ?? "",
    type: verdict.type ?? "other",
    beat: 1,
    startedAtTurnId: observedTurnId,
    lastConfirmTurnId: observedTurnId,
    lastProgress: verdict.progress,
  };
  return {
    ...s,
    current,
    loopLevel: verdict.loop,
    consecutiveStalls: verdict.stall ? 1 : 0,
    highProgressBeats: nextHighProgressBeats(
      s.highProgressBeats,
      verdict.progress,
      saturatedProgress,
    ),
    lastVerdict: verdict,
    history: s.current
      ? closeCurrentRecord(s, "transitioned", observedTurnId, historyCap)
      : s.history,
    counters: {
      ...s.counters,
      probes,
      scenes,
    },
  };
}