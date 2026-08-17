import {
  createPermissionChecker,
  err,
  failure,
  ok,
  type AgentResult,
  type AgentTask,
  type Failure,
  type JsonObject,
  type PermissionChecker,
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
 * Core-scoped permission checker (all core permissions).
 */
export function createCorePermissionChecker(): PermissionChecker {
  return createPermissionChecker([
    "state:read",
    "state:propose:*",
    "agent:call:*",
    "rng:use",
  ]);
}

/**
 * Reject helper when propose is used outside allowed stages.
 */
export function proposeClosed(): Result<void, Failure> {
  return err(
    failure(
      "INTERNAL",
      "propose() is only allowed during propose/validate draft window",
    ),
  );
}
