import {
  createPermissionChecker,
  type AgentResult,
  type AgentTask,
  type Failure,
  type JsonObject,
  type PermissionChecker,
  type PermissionToken,
  type Result,
  type StateCommand,
  type TraceNote,
  type TurnContext,
  type TurnLogger,
  type TurnRng,
  type WorldState,
} from "@rpengineext/contracts";

import { deepFreeze } from "../util/freeze.ts";

/**
 * Mutable extras bag used during a turn.
 */
export type MutableExtras = Record<string, unknown>;

export interface TurnContextHost {
  readonly turnId: string;
  readonly sessionId: string;
  getStateView(): WorldState;
  propose(commands: readonly StateCommand[]): Result<void, Failure>;
  requestAgent(task: AgentTask): Promise<AgentResult>;
  note(note: TraceNote): void;
  readonly extras: MutableExtras;
  readonly log: TurnLogger;
  readonly rng?: TurnRng;
  readonly permissions: PermissionChecker;
}

/**
 * Creates a TurnContext bound to a host implementation.
 *
 * @param host - backing turn services
 */
export function createTurnContext(host: TurnContextHost): TurnContext {
  return {
    turnId: host.turnId,
    sessionId: host.sessionId,
    get stateView() {
      return deepFreeze(host.getStateView()) as WorldState;
    },
    rng: host.rng,
    permissions: host.permissions,
    propose(commands) {
      return host.propose(commands);
    },
    requestAgent(task) {
      return host.requestAgent(task);
    },
    log: host.log,
    trace: {
      note(note: TraceNote) {
        host.note(note);
      },
    },
    get extras() {
      return host.extras as JsonObject;
    },
  };
}

/**
 * Core-scoped permission checker (full technical privileges for pipeline internals).
 */
export function createCorePermissionChecker(): PermissionChecker {
  return createPermissionChecker([
    "state:read",
    "state:propose:*",
    "agent:call:*",
    "rng:use",
    "memory:read",
    "memory:write",
    "canon:read",
    "canon:propose",
  ]);
}

/**
 * Builds a permission checker from a module's granted tokens.
 *
 * @param granted - module manifest permissions
 */
export function createModulePermissionChecker(
  granted: readonly PermissionToken[],
): PermissionChecker {
  return createPermissionChecker(granted);
}

/**
 * Returns a TurnContext view with a different permission checker.
 * Used so module handlers see their own grants, not core's full set.
 *
 * @param ctx - base turn context
 * @param permissions - effective checker for the module
 */
export function withPermissions(
  ctx: TurnContext,
  permissions: PermissionChecker,
): TurnContext {
  return {
    get turnId() {
      return ctx.turnId;
    },
    get sessionId() {
      return ctx.sessionId;
    },
    get stateView() {
      return ctx.stateView;
    },
    get rng() {
      return ctx.rng;
    },
    permissions,
    propose(commands) {
      return ctx.propose(commands);
    },
    requestAgent(task) {
      return ctx.requestAgent(task);
    },
    log: ctx.log,
    trace: ctx.trace,
    get extras() {
      return ctx.extras;
    },
  };
}
