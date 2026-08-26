import type { z } from "zod";

import type { Result, Failure } from "../result.ts";
import type { JsonObject } from "../json.ts";
import type { StateCommand } from "../state/commands.ts";
import type { WorldState } from "../state/world-state.ts";
import type { AgentTask, AgentTaskConstraints } from "../agents/task.ts";
import type { LlmMessage } from "../agents/llm-port.ts";

/**
 * Layer A — catalog registration definitions.
 * @see docs/architecture/12-extension-surface.md
 */

export interface SliceDefinition {
  readonly name: string;
  readonly schemaVersion: number;
  /** Runtime schema for slice root object (Zod preferred). */
  readonly schema: z.ZodType<JsonObject>;
  readonly initialValue?: JsonObject;
}

export interface CommandDefinition {
  readonly type: string;
  readonly slice: string;
  readonly payloadSchema: z.ZodType<JsonObject>;
  /**
   * Pure apply against a draft state copy. Must not perform I/O.
   *
   * @param state - draft world state
   * @param command - command being applied
   */
  apply(
    state: WorldState,
    command: StateCommand,
  ): Result<WorldState, Failure>;
  validate?(
    state: WorldState,
    command: StateCommand,
  ): Result<void, Failure>;
}

export interface InvariantDefinition {
  readonly id: string;
  readonly slice?: string;
  check(state: WorldState): Result<void, Failure>;
}

export interface ConflictKeyDefinition {
  readonly id: string;
  /** Dot path pattern within a slice, e.g. `actors.*` */
  readonly path: string;
  readonly slice: string;
}

export interface AgentTaskTypeDefinition {
  readonly type: string;
  readonly inputSchema: z.ZodType<JsonObject>;
  readonly outputSchema: z.ZodType<JsonObject>;
  readonly defaultConstraints?: Partial<AgentTaskConstraints>;
  readonly description?: string;
  /**
   * Optional LLM message builder for generic / tool-calling tasks.
   * When present, core can run the task via LlmPort without a dedicated adapter.
   */
  readonly buildMessages?: (task: AgentTask) => readonly LlmMessage[];
}

export interface AgentToolDefinition {
  readonly id: string;
  readonly description: string;
  readonly argsSchema: z.ZodType<JsonObject>;
  readonly resultSchema: z.ZodType<JsonObject>;
  readonly permission?: string;
  /**
   * JSON Schema for LLM tool parameters. When omitted, a permissive object schema is used.
   */
  readonly parametersJsonSchema?: JsonObject;
}

export interface ActionTypeDefinition {
  readonly actionType: string;
  readonly schema?: z.ZodType<JsonObject>;
  readonly description?: string;
}

export interface IntentTypeDefinition {
  readonly intentType: string;
  readonly schema?: z.ZodType<JsonObject>;
  readonly description?: string;
}

export interface PublicProjectorDefinition {
  readonly id: string;
  project(state: WorldState): JsonObject;
}

export interface MemoryKindDefinition {
  readonly kind: string;
  readonly schema?: z.ZodType<JsonObject>;
}

export interface ReadModelDefinition<TArgs = JsonObject, TOut = unknown> {
  readonly id: string;
  /** Optional args schema validated on every call (fail → MODULE_READ_MODEL_ARGS_INVALID). */
  readonly argsSchema?: z.ZodType<TArgs>;
  get(state: WorldState, args: TArgs): TOut;
}

export interface TemplateDefinition {
  readonly id: string;
  readonly text: string;
}

export interface ConfigSchemaDefinition {
  readonly key: string;
  readonly schema: z.ZodType<JsonObject>;
}

export interface MigrationDefinition {
  readonly slice: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(oldSlice: JsonObject): Result<JsonObject, Failure>;
}

export interface CapabilityDefinition {
  readonly id: string;
}
