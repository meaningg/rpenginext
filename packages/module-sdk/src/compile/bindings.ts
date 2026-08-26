import type { z } from "zod";

import type {
  AgentTask,
  JsonObject,
  LlmMessage,
  WorldState,
} from "@rpengineext/contracts";

import type {
  AiTaskDef,
  AiToolDef,
  EventsCapability,
  HostCapability,
  NarrativeCapability,
  RulesCapability,
  SeedCapability,
  StateCapability,
  TurnCapability,
} from "../types/capabilities.ts";
import type { ModuleCtx } from "../types/context.ts";
import type { NormalizedModuleDefinition } from "../types/definition.ts";
import { defaultSliceName, namespacedId } from "../util/ids.ts";
import { resolveOp, type ResolvedOp } from "./resolve-op.ts";

/**
 * Runtime bindings paired with CompiledModuleIR (functions live here, not in IR).
 */
export interface ModuleBindings {
  readonly state?: {
    readonly schema: StateCapability["schema"];
    readonly initial: unknown;
    readonly ops: ReadonlyMap<string, ResolvedOp>;
    readonly migrations?: StateCapability["migrations"];
  };
  readonly config?: {
    readonly key: string;
    readonly schema: z.ZodType<JsonObject>;
    readonly defaults: JsonObject;
    readonly factoryConfig: JsonObject;
    readonly hostModuleConfig?: JsonObject;
  };
  readonly allowedReadSlices: readonly string[];
  readonly seeds: readonly SeedCapability[];
  readonly rules: readonly RulesCapability[];
  readonly turns: readonly TurnCapability[];
  readonly narratives: readonly NarrativeCapability[];
  readonly host: readonly HostCapability[];
  readonly aiTasks: ReadonlyMap<
    string,
    AiTaskDef & { readonly type: string; readonly toolIds: readonly string[] }
  >;
  readonly aiTools: ReadonlyMap<
    string,
    AiToolDef & { readonly id: string }
  >;
  readonly knownOps: ReadonlySet<string>;
  /** Events capability (canonical names + subscribe handlers). */
  readonly events: {
    readonly emit: readonly ({
      readonly name: string;
      readonly schema?: z.ZodType<JsonObject>;
      readonly description?: string;
    })[];
    readonly subscribe: readonly {
      readonly name: string;
      readonly priority: number;
      readonly moduleId: string;
      handler(
        ctx: ModuleCtx,
        event: { readonly payload: JsonObject },
      ): void | Promise<void>;
    }[];
  };
}

/**
 * Builds bindings from a normalized definition (paired with IR).
 */
export function buildBindings(
  normalized: NormalizedModuleDefinition,
  runtimeConfig?: {
    readonly moduleConfig?: JsonObject;
    readonly factoryConfig?: JsonObject;
  },
  sliceName?: string,
): ModuleBindings {
  const stateCap = normalized.capabilities.find(
    (c): c is StateCapability => c.kind === "state",
  );
  const configCap = normalized.capabilities.find((c) => c.kind === "config");
  const accessCap = normalized.capabilities.find((c) => c.kind === "access");

  const ops = new Map<string, ResolvedOp>();
  if (stateCap?.ops) {
    for (const [key, def] of Object.entries(stateCap.ops)) {
      ops.set(key, resolveOp(def));
    }
  }

  const resolvedSlice =
    sliceName ?? stateCap?.name ?? defaultSliceName(normalized.id);
  const configKey =
    configCap && configCap.kind === "config"
      ? (configCap.key ?? resolvedSlice)
      : resolvedSlice;

  const factoryConfig = runtimeConfig?.factoryConfig ?? {};
  const defaults = {
    ...(configCap && configCap.kind === "config" ? (configCap.defaults ?? {}) : {}),
    ...factoryConfig,
  } as JsonObject;

  const aiTasks = new Map<
    string,
    AiTaskDef & { type: string; toolIds: readonly string[] }
  >();
  const aiTools = new Map<string, AiToolDef & { id: string }>();

  // Task/tool wire ids stay namespaced by module id (stable external contract).
  for (const cap of normalized.capabilities) {
    if (cap.kind !== "ai") continue;
    for (const [localKey, task] of Object.entries(cap.tasks ?? {})) {
      const type = namespacedId(normalized.id, localKey);
      const toolIds = (task.tools ?? []).map((k) =>
        namespacedId(normalized.id, k),
      );
      aiTasks.set(localKey, { ...task, type, toolIds });
    }
    for (const [localKey, tool] of Object.entries(cap.tools ?? {})) {
      const id = namespacedId(normalized.id, localKey);
      aiTools.set(localKey, { ...tool, id });
    }
  }

  // Events: canonical names = `<moduleId>.<local>`; subscriptions keep priority + handler.
  const eventPrefix = normalized.id.replace(/-/g, "_");
  const eventsEmit: {
    readonly name: string;
    readonly schema?: z.ZodType<JsonObject>;
    readonly description?: string;
  }[] = [];
  const eventsSubscribe: {
    readonly name: string;
    readonly priority: number;
    readonly moduleId: string;
    handler(
      ctx: ModuleCtx,
      event: { readonly payload: JsonObject },
    ): void | Promise<void>;
  }[] = [];
  for (const cap of normalized.capabilities) {
    if (cap.kind !== "events") continue;
    for (const decl of cap.emit ?? []) {
      eventsEmit.push({
        name: `${eventPrefix}.${decl.name}`,
        ...(decl.schema ? { schema: decl.schema as z.ZodType<JsonObject> } : {}),
        ...(decl.description ? { description: decl.description } : {}),
      });
    }
    for (const decl of cap.subscribe ?? []) {
      eventsSubscribe.push({
        name: decl.name,
        priority: decl.priority ?? 100,
        moduleId: normalized.id,
        handler: decl.handler as never,
      });
    }
  }

  return {
    ...(stateCap
      ? {
          state: {
            schema: stateCap.schema,
            initial: stateCap.initial,
            ops,
            migrations: stateCap.migrations,
          },
        }
      : {}),
    ...(configCap && configCap.kind === "config"
      ? {
          config: {
            key: configKey,
            schema: configCap.schema,
            defaults,
            factoryConfig,
            hostModuleConfig: runtimeConfig?.moduleConfig,
          },
        }
      : {}),
    allowedReadSlices:
      accessCap && accessCap.kind === "access" ? (accessCap.read ?? []) : [],
    seeds: normalized.capabilities.filter(
      (c): c is SeedCapability => c.kind === "seed",
    ),
    rules: normalized.capabilities.filter(
      (c): c is RulesCapability => c.kind === "rules",
    ),
    turns: normalized.capabilities.filter(
      (c): c is TurnCapability => c.kind === "turn",
    ),
    narratives: normalized.capabilities.filter(
      (c): c is NarrativeCapability => c.kind === "narrative",
    ),
    host: normalized.capabilities.filter(
      (c): c is HostCapability => c.kind === "host",
    ),
    aiTasks,
    aiTools,
    knownOps: new Set(ops.keys()),
    events: { emit: eventsEmit, subscribe: eventsSubscribe },
  };
}

export type { ResolvedOp };
export type { LlmMessage, AgentTask, WorldState };
