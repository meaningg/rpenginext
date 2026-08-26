import type {
  ActionIntent,
  JsonObject,
  NormalizedAction,
  Passage,
  PlayerAction,
  SystemTurnScheduleMode,
  TurnKind,
  TurnLogger,
} from "@rpengineext/contracts";

/**
 * System turn request scheduled after a successful player commit.
 */
export interface ScheduleSystemRequest {
  readonly reason: string;
  readonly payload?: JsonObject;
  readonly mode?: SystemTurnScheduleMode;
}

/**
 * Author-facing module context available inside capability handlers.
 *
 * @typeParam TSlice - module slice type
 * @typeParam TConfig - module config type
 */
export interface ModuleCtx<TSlice = unknown, TConfig = unknown> {
  readonly moduleId: string;
  readonly sliceName: string;
  readonly turnId?: string;
  readonly sessionId?: string;
  readonly slice: TSlice;
  readonly config: TConfig;
  readonly meta: JsonObject;
  readonly action?: PlayerAction;
  readonly normalizedAction?: NormalizedAction;
  readonly intent?: ActionIntent;
  readonly passage?: Passage;
  readonly turnKind?: TurnKind;
  readonly locale?: string;
  readonly log: TurnLogger;

  /**
   * Propose a named state op (becomes a StateCommand).
   *
   * @param op - op key declared on state capability
   * @param payload - op payload
   * @param reason - optional journal reason
   */
  op(op: string, payload?: JsonObject, reason?: string): void;

  /**
   * Alias of {@link op} for tool handlers (same semantics).
   */
  proposeOp(op: string, payload?: JsonObject, reason?: string): void;

  /**
   * Resolves a registered module readModel (specs/06 §6).
   * Never returns undefined: unknown name → fail-loud `MODULE_READ_MODEL_UNKNOWN`;
   * args fail provider schema → `MODULE_READ_MODEL_ARGS_INVALID` (in all moments).
   *
   * @param name - readModel id (`<moduleId>.<local>`)
   * @param args - optional provider args
   */
  readModel<T extends JsonObject = JsonObject>(name: string, args?: JsonObject): T;

  /**
   * Emits a module event (specs/06 §7). Only allowed in `turn.committed` /
   * `turn.rejected` / `event.dispatch` — other moments fail-loud
   * with `MODULE_EVENT_EMIT_FORBIDDEN`.
   *
   * @param name - canonical event name (`<moduleId>.<local>`)
   * @param payload - event payload validated against events.emit schema
   */
  emit(name: string, payload?: JsonObject): void;

  /**
   * Read another module slice (requires access.read).
   *
   * @param sliceName - target slice
   */
  readSlice<T = unknown>(sliceName: string): T | undefined;

  /**
   * Schedule a follow-up system turn (only meaningful from committed).
   *
   * @param request - schedule request
   */
  scheduleSystem(request: ScheduleSystemRequest): void;

  /**
   * Write a trace note under this module namespace.
   *
   * @param title - note title
   * @param body - optional body
   * @param data - optional structured data
   */
  note(title: string, body?: string, data?: unknown): void;
}
