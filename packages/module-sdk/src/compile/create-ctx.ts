import {
  enqueueModuleOpProposal,
  type ActionIntent,
  type JsonObject,
  type NormalizedAction,
  type Passage,
  type PlayerAction,
  type StateCommand,
  type TurnContext,
  type TurnKind,
  type TurnLogger,
  type WorldState,
} from "@rpengineext/contracts";

import type { ModuleCtx, ScheduleSystemRequest } from "../types/context.ts";
import { commandType, createCommandId } from "../util/ids.ts";

export interface CtxSession {
  readonly commands: StateCommand[];
  readonly systemRequests: ScheduleSystemRequest[];
}

export interface CreateModuleCtxOptions<TSlice, TConfig> {
  readonly moduleId: string;
  readonly sliceName: string;
  readonly slice: TSlice;
  readonly config: TConfig;
  readonly meta?: JsonObject;
  readonly log: TurnLogger;
  readonly turnCtx?: TurnContext;
  readonly action?: PlayerAction;
  readonly normalizedAction?: NormalizedAction;
  readonly intent?: ActionIntent;
  readonly passage?: Passage;
  readonly turnKind?: TurnKind;
  readonly locale?: string;
  readonly world?: WorldState;
  readonly allowedReadSlices?: readonly string[];
  /** Known op names from IR — unknown op() fails fast. */
  readonly knownOps: ReadonlySet<string>;
  /**
   * - collect: ops become StateCommands immediately
   * - propose: ops go through foundation ModuleOpProposal protocol (tools)
   */
  readonly opMode: "collect" | "propose";
}

/**
 * Builds an author ModuleCtx + mutable session collectors.
 */
export function createModuleCtx<TSlice, TConfig>(
  options: CreateModuleCtxOptions<TSlice, TConfig>,
): { ctx: ModuleCtx<TSlice, TConfig>; session: CtxSession } {
  const session: CtxSession = {
    commands: [],
    systemRequests: [],
  };

  const pushOp = (op: string, payload?: JsonObject, reason?: string) => {
    if (!options.knownOps.has(op)) {
      throw new Error(
        `module ${options.moduleId}: unknown op "${op}" (not in IR slice.ops)`,
      );
    }
    const body = (payload ?? {}) as JsonObject;
    const why = reason ?? `${options.moduleId}.${op}`;

    if (options.opMode === "propose") {
      if (!options.turnCtx) {
        throw new Error(
          `module ${options.moduleId}: propose-mode op requires turn context`,
        );
      }
      enqueueModuleOpProposal(options.turnCtx.extras as Record<string, unknown>, {
        moduleId: options.moduleId,
        slice: options.sliceName,
        op,
        payload: body,
        reason: why,
      });
      return;
    }

    session.commands.push({
      commandId: createCommandId(),
      type: commandType(options.sliceName, op),
      slice: options.sliceName,
      payload: body,
      reason: why,
      source: { kind: "module", id: options.moduleId },
    });
  };

  const ctx: ModuleCtx<TSlice, TConfig> = {
    moduleId: options.moduleId,
    sliceName: options.sliceName,
    turnId: options.turnCtx?.turnId,
    sessionId: options.turnCtx?.sessionId,
    slice: options.slice,
    config: options.config,
    meta: options.meta ?? {},
    action: options.action,
    normalizedAction: options.normalizedAction,
    intent: options.intent,
    passage: options.passage,
    turnKind: options.turnKind,
    locale: options.locale,
    log: options.log,
    op: pushOp,
    proposeOp: pushOp,
    readSlice<T>(name: string): T | undefined {
      const allowed = options.allowedReadSlices ?? [];
      if (name !== options.sliceName && !allowed.includes(name)) {
        throw new Error(
          `module ${options.moduleId}: readSlice("${name}") denied — declare access.read`,
        );
      }
      const world = options.world ?? options.turnCtx?.stateView;
      if (!world) return undefined;
      return world.slices[name] as T | undefined;
    },
    scheduleSystem(request: ScheduleSystemRequest) {
      session.systemRequests.push(request);
    },
    note(title: string, body?: string, data?: unknown) {
      options.turnCtx?.trace.note({
        namespace: options.moduleId,
        title,
        body: body ?? "",
        ...(data !== undefined ? { data: data as JsonObject } : {}),
      });
    },
  };

  return { ctx, session };
}

/**
 * Converts deferred proposals into state commands.
 */
export function proposalsToCommands(
  proposals: readonly {
    readonly op: string;
    readonly payload: JsonObject;
    readonly reason: string;
    readonly moduleId: string;
    readonly slice: string;
  }[],
): StateCommand[] {
  return proposals.map((item) => ({
    commandId: createCommandId(),
    type: commandType(item.slice, item.op),
    slice: item.slice,
    payload: item.payload,
    reason: item.reason,
    source: { kind: "module" as const, id: item.moduleId },
  }));
}
