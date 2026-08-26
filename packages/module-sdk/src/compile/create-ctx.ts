import {
  enqueueModuleEvent,
  enqueueModuleOpProposal,
  type ActionIntent,
  type JsonObject,
  ModuleCtxViolation,
  type ModuleEvent,
  type NormalizedAction,
  type Passage,
  type PlayerAction,
  type StateCommand,
  type TurnContext,
  type TurnKind,
  type TurnLogger,
  type WorldState,
} from "@rpengineext/contracts";
import type { z } from "zod";

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
  /** Known op names from IR — unknown op() fails with MODULE_OP_UNKNOWN. */
  readonly knownOps: ReadonlySet<string>;
  /**
   * - collect: ops become StateCommands immediately
   * - propose: ops go through foundation ModuleOpProposal protocol (tools)
   */
  readonly opMode: "collect" | "propose";
  /** Moment name for permission guards (specs/01 §4.2), e.g. `turn.committed`. */
  readonly momentName?: string;
  /** Whether ctx.op / proposeOp is permitted in this moment (default true). */
  readonly writeAllowed?: boolean;
  /** Whether ctx.emit is permitted (default false; true in committed/rejected/event.dispatch). */
  readonly emitAllowed?: boolean;
  /** Whether scheduleSystem is permitted (default false; true in committed/event.dispatch). */
  readonly scheduleAllowed?: boolean;
  /** Canonical emit names declared by this module (fail-loud unknown → MODULE_EVENT_UNKNOWN). */
  readonly knownEmitNames?: ReadonlySet<string>;
  /** Payload schemas per canonical event name (fail → MODULE_EVENT_PAYLOAD_INVALID). */
  readonly emitSchemas?: ReadonlyMap<string, z.ZodType<JsonObject>>;
  /** Custom emit sink (event dispatch context); default = turnCtx.extras queue. */
  readonly emitSink?: (event: ModuleEvent) => void;
}

function forbidden(
  code: string,
  what: string,
  moment: string | undefined,
  details: { moduleId: string; [key: string]: unknown },
): ModuleCtxViolation {
  return new ModuleCtxViolation(
    code,
    `[${code}] ${what} in moment "${moment ?? "?"}" (module: ${details.moduleId}). Hint: this moment forbids the call — check the normative moments table (docs/modules/sdk-reference.md).`,
    details,
  );
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

  const writeAllowed = options.writeAllowed !== false;
  const emitAllowed = options.emitAllowed === true;
  const scheduleAllowed = options.scheduleAllowed === true;

  const pushOp = (op: string, payload?: JsonObject, reason?: string) => {
    if (!writeAllowed) {
      throw forbidden(
        "MODULE_MOMENT_OP_FORBIDDEN",
        `ctx.op("${op}") is forbidden`,
        options.momentName,
        { moduleId: options.moduleId, op, moment: options.momentName },
      );
    }
    if (!options.knownOps.has(op)) {
      const known = [...options.knownOps];
      throw new ModuleCtxViolation(
        "MODULE_OP_UNKNOWN",
        `[MODULE_OP_UNKNOWN] unknown op "${op}" (module: ${options.moduleId}). Hint: declare ops in state.ops; known ops: ${known.length ? known.join(", ") : "(none)"}.`,
        { moduleId: options.moduleId, op },
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

  const emit = (name: string, payload?: JsonObject) => {
    if (!emitAllowed) {
      throw forbidden(
        "MODULE_EVENT_EMIT_FORBIDDEN",
        `ctx.emit("${name}") is forbidden`,
        options.momentName,
        { moduleId: options.moduleId, event: name, moment: options.momentName },
      );
    }
    if (!options.knownEmitNames || !options.knownEmitNames.has(name)) {
      const known = [...(options.knownEmitNames ?? [])];
      const hint =
        known.length > 0
          ? known.slice(0, 8).join(", ") + (known.length > 8 ? ", …" : "")
          : "(none declared)";
      throw new ModuleCtxViolation(
        "MODULE_EVENT_UNKNOWN",
        `[MODULE_EVENT_UNKNOWN] emit of unknown event "${name}" (module: ${options.moduleId}). Hint: declare it in events.emit; known: ${hint}.`,
        { moduleId: options.moduleId, event: name },
      );
    }
    const body = (payload ?? {}) as JsonObject;
    const schema = options.emitSchemas?.get(name);
    if (schema) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ModuleCtxViolation(
          "MODULE_EVENT_PAYLOAD_INVALID",
          `[MODULE_EVENT_PAYLOAD_INVALID] emit "${name}" payload failed declared schema (module: ${options.moduleId}). Hint: fix payload per events.emit schema.`,
          {
            moduleId: options.moduleId,
            event: name,
            path: parsed.error.issues?.[0]?.path ?? [],
          },
        );
      }
    }
    const event: ModuleEvent = { name, payload: body, moduleId: options.moduleId };
    if (options.emitSink) {
      options.emitSink(event);
      return;
    }
    if (!options.turnCtx) {
      throw new Error(`module ${options.moduleId}: emit requires turn context`);
    }
    enqueueModuleEvent(options.turnCtx.extras as Record<string, unknown>, event);
  };

  const readModel = <T extends JsonObject = JsonObject>(
    name: string,
    args?: JsonObject,
  ): T => {
    const turnCtx = options.turnCtx;
    if (!turnCtx?.readModel) {
      throw new ModuleCtxViolation(
        "MODULE_READ_MODEL_UNKNOWN",
        `[MODULE_READ_MODEL_UNKNOWN] readModel("${name}") unavailable in this context (module: ${options.moduleId}). Hint: readModel requires a running turn.`,
        { moduleId: options.moduleId, name },
      );
    }
    const result = turnCtx.readModel(name, args);
    if (!result.ok) {
      throw new ModuleCtxViolation(
        result.error.code === "MODULE_READ_MODEL_UNKNOWN"
          ? "MODULE_READ_MODEL_UNKNOWN"
          : "MODULE_READ_MODEL_ARGS_INVALID",
        `[${result.error.code}] readModel("${name}") failed (module: ${options.moduleId}). Hint: ${result.error.message}.`,
        {
          moduleId: options.moduleId,
          name,
          ...(typeof result.error.details === "object" &&
          result.error.details !== null &&
          "path" in (result.error.details as object)
            ? { path: (result.error.details as { path?: unknown }).path }
            : {}),
        },
      );
    }
    return result.value as T;
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
    readModel,
    emit,
    scheduleSystem(request: ScheduleSystemRequest) {
      if (!scheduleAllowed) {
        throw forbidden(
          "MODULE_MOMENT_OP_FORBIDDEN",
          `scheduleSystem("${request.reason}") is forbidden`,
          options.momentName,
          {
            moduleId: options.moduleId,
            moment: options.momentName,
            taskType: request.reason,
          },
        );
      }
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