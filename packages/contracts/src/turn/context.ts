import type { Result } from "../result.ts";
import type { Failure } from "../result.ts";
import type { StateCommand } from "../state/commands.ts";
import type { WorldState } from "../state/world-state.ts";
import type { AgentTask, AgentResult } from "../agents/task.ts";
import type { TraceNote } from "../tracing/note.ts";
import type { JsonObject } from "../json.ts";
import type { PermissionChecker } from "../modules/permissions.ts";

/**
 * Minimal structured logger surface injected into turn/module contexts.
 * Hosts typically adapt `@rpengineext/logger` to this shape.
 */
export interface TurnLogger {
  debug(message: string): void;
  debug(fields: object, message?: string): void;
  info(message: string): void;
  info(fields: object, message?: string): void;
  warn(message: string): void;
  warn(fields: object, message?: string): void;
  error(message: string): void;
  error(fields: object, message?: string): void;
  child(bindings: Record<string, unknown>): TurnLogger;
}

/**
 * Module-facing API for namespaced turn trace annotations.
 */
export interface TurnTraceApi {
  /**
   * Adds a namespaced note rendered under "Module notes" in the turn `.md`.
   *
   * @param note - annotation payload
   */
  note(note: TraceNote): void;
}

/**
 * Seeded RNG handle for deterministic mechanics modules.
 */
export interface TurnRng {
  /**
   * Returns the next float in [0, 1).
   */
  next(): number;

  /**
   * Returns an integer in [min, max] inclusive.
   *
   * @param min - lower bound
   * @param max - upper bound
   */
  int(min: number, max: number): number;
}

/**
 * Read-oriented turn context with limited proposers (normative).
 * @see docs/architecture/02-core.md
 */
export interface TurnContext {
  readonly turnId: string;
  readonly sessionId: string;
  /** Deep-frozen / readonly projection of authoritative or draft view per stage policy. */
  readonly stateView: WorldState;
  readonly rng?: TurnRng;
  readonly permissions: PermissionChecker;
  /**
   * Resolves a registered module readModel.
   * Unknown name → fail-loud failure with code `MODULE_READ_MODEL_UNKNOWN`
   * (never undefined); args fail provider schema → `MODULE_READ_MODEL_ARGS_INVALID`.
   *
   * @param name - registered readModel id
   * @param args - optional provider args
   */
  readModel?(name: string, args?: JsonObject): Result<unknown, Failure>;
  /**
   * Buffers commands into the turn draft (not committed).
   *
   * @param commands - candidate state commands
   */
  propose(commands: readonly StateCommand[]): Result<void, Failure>;
  /**
   * Enqueues or executes an agent task per stage policy.
   *
   * @param task - agent task request
   * @param opts - optional per-call overrides (round marker / streaming)
   */
  requestAgent(task: AgentTask, opts?: AgentRequestOptions): Promise<AgentResult>;
  readonly log: TurnLogger;
  readonly trace: TurnTraceApi;
  /** Namespaced bag for stage-local data (not persistence truth). */
  readonly extras: JsonObject;
}

/**
 * Per-call requestAgent options (ADR 0008 critic loop).
 */
export interface AgentRequestOptions {
  /** 0-based critic round; newer round ⇒ hosts reset the stream preview. */
  readonly round?: number;
  /** Per-call streaming override; default = host/config preference. */
  readonly stream?: boolean;
}
