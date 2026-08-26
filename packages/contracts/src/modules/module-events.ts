import type { z } from "zod";

import type { JsonObject } from "../json.ts";
import type { WorldState } from "../state/world-state.ts";

/**
 * Read-oriented ctx surface available to event subscribers (observe-only).
 * Structural subset of the sdk {@link ModuleCtx}; sdk satisfies this type.
 */
export interface ModuleSubscribeCtx {
  readonly moduleId: string;
  readonly sliceName: string;
  readonly config: JsonObject;
  readonly slice?: unknown;
  readonly log: import("../turn/context.ts").TurnLogger;
  readonly world?: WorldState;
  readonly passage?: unknown;
  readModel(name: string, args?: JsonObject): JsonObject;
  readSlice<T = unknown>(sliceName: string): T | undefined;
  scheduleSystem(request: {
    readonly reason: string;
    readonly payload?: JsonObject;
    readonly mode?: "inline" | "background";
  }): void;
  emit(name: string, payload?: JsonObject): void;
  note(title: string, body?: string, data?: unknown): void;
}

/**
 * Canonical event name: `<moduleId>` (с `-` → `_`) + `.` + local kebab name.
 * Pattern is validated at define time (invalid → `MODULE_DEFINE_INVALID`).
 */
export type ModuleEventName = string;

/**
 * Event emitter declaration (specs/06 §7.2) — static, compile-time.
 */
export interface ModuleEmitDecl {
  /** Local kebab-case name; canonical = `<moduleId>.<name>`. */
  readonly name: string;
  /** Payload validation (like op payload schemas). */
  readonly schema?: z.ZodType<JsonObject>;
  readonly description?: string;
}

/**
 * Static subscription declaration (specs/06 §7.2).
 */
export interface ModuleSubscribeDecl {
  /** Canonical event name (dot-complete: `<moduleId>.<name>`). */
  readonly name: string;
  /** Lower runs earlier (default 100). */
  readonly priority?: number;
  readonly handler: (
    ctx: ModuleSubscribeCtx,
    event: { readonly payload: JsonObject },
  ) => void | Promise<void>;
}

/**
 * A single turn-scoped module event instance dispatched post-outcome.
 */
export interface ModuleEvent {
  /** Canonical event name. */
  readonly name: string;
  readonly payload: JsonObject;
  /** Emitting module id. */
  readonly moduleId: string;
}

/**
 * Registry record for one declared emit (canonical name → schema/owner).
 */
export interface ModuleEventPublisher {
  readonly name: string;
  readonly schema?: z.ZodType<JsonObject>;
  readonly moduleId: string;
}

/**
 * Registry record for one static subscription.
 */
export interface ModuleEventSubscription {
  readonly name: string;
  readonly priority: number;
  readonly moduleId: string;
  handler(
    ctx: import("../turn/context.ts").TurnContext,
    event: { readonly payload: JsonObject },
  ): void | Promise<void>;
}

/**
 * Reserved `turnCtx.extras` key carrying module events emitted within a turn.
 * Pattern mirrors `MODULE_OP_PROPOSALS_EXTRAS_KEY` (module-proposals.ts).
 */
export const MODULE_EVENTS_EXTRAS_KEY = "__module_events" as const;

/**
 * Queues one module event into the extras bag.
 *
 * @param extras - turn ctx extras bag
 * @param eventsKey - reserved extras key (stable across sdk/core; internal)
 * @param event - the emitted event
 */
export function enqueueModuleEvent(
  extras: Record<string, unknown>,
  event: ModuleEvent,
): void {
  const list = (extras[MODULE_EVENTS_EXTRAS_KEY] as ModuleEvent[] | undefined) ?? [];
  list.push(event);
  extras[MODULE_EVENTS_EXTRAS_KEY] = list;
}

/**
 * Takes (and clears) all queued module events from the extras bag.
 *
 * @param extras - turn ctx extras bag
 */
export function takeModuleEvents(extras: Record<string, unknown>): ModuleEvent[] {
  const list = (extras[MODULE_EVENTS_EXTRAS_KEY] as ModuleEvent[] | undefined) ?? [];
  delete extras[MODULE_EVENTS_EXTRAS_KEY];
  return list;
}