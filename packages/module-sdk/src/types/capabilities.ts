import type { z } from "zod";

import type {
  AgentTask,
  JsonObject,
  LlmMessage,
  WorldState,
} from "@rpengineext/contracts";

import type { ModuleCtx } from "./context.ts";

/** Closed capability kind catalog (sdk v1). */
export const CAPABILITY_KINDS = [
  "state",
  "seed",
  "rules",
  "turn",
  "narrative",
  "ai",
  "host",
  "config",
  "access",
  "events",
] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

/**
 * Named slice op: pure transform slice + payload → next slice.
 *
 * @typeParam TSlice - slice type
 * @typeParam TPayload - payload type
 */
export type SliceOpFn<TSlice, TPayload = JsonObject> = (
  slice: TSlice,
  payload: TPayload,
) => TSlice;

/**
 * Minimal parser surface accepted for op payloads (Zod schemas satisfy this).
 * Kept structural so object-form `apply` keeps contextual typing.
 */
export interface SliceOpPayloadSchema<TPayload = unknown> {
  safeParse(data: unknown):
    | { success: true; data: TPayload }
    | { success: false; error: unknown };
}

/**
 * Object-form op with optional payload schema.
 *
 * @typeParam TSlice - slice type
 * @typeParam TPayload - payload type
 */
export interface SliceOpObjectDef<TSlice, TPayload = JsonObject> {
  readonly payload?: SliceOpPayloadSchema<TPayload>;
  readonly apply: SliceOpFn<TSlice, TPayload>;
}

/**
 * Op definition: bare function or `{ payload, apply }` object.
 *
 * @typeParam TSlice - slice type
 * @typeParam TPayload - payload type
 */
export type SliceOpDef<TSlice, TPayload = JsonObject> =
  | SliceOpFn<TSlice, TPayload>
  | SliceOpObjectDef<TSlice, TPayload>;

/**
 * Primary module state (one slice per module in v1).
 *
 * @typeParam TSlice - slice type
 */
export interface StateCapability<TSlice = JsonObject> {
  readonly kind: "state";
  /** Slice name; default = module id with `-` → `_`. */
  readonly name?: string;
  readonly schemaVersion?: number;
  readonly schema: z.ZodType<TSlice>;
  readonly initial: TSlice;
  /**
   * Named ops. Payload type defaults to `any` so authors may omit annotations;
   * prefer `{ payload: schema, apply }` for runtime validation.
   */
  readonly ops?: Readonly<Record<string, SliceOpDef<TSlice, any>>>;
  readonly migrations?: Readonly<
    Record<number, (oldSlice: unknown) => TSlice>
  >;
}

/**
 * Seed slice from session meta on new game.
 */
export interface SeedCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "seed";
  /** Top-level session meta key. */
  readonly fromMeta: string;
  readonly parse?: z.ZodType<unknown>;
  readonly when?: "new_game";
  readonly apply: (
    value: unknown,
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => void | Promise<void>;
}

/**
 * Hard/soft rules.
 */
export interface RulesCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "rules";
  readonly guard?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => void | Promise<void>;
  readonly soft?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => string[] | void | Promise<string[] | void>;
  readonly invariant?: (
    slice: TSlice,
    state: WorldState,
  ) => void | Promise<void>;
}

/**
 * Turn lifecycle moments (author vocabulary, not pipeline stages).
 */
export interface TurnCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "turn";
  /** Propose state before narrative. */
  readonly change?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => void | Promise<void>;
  /** Propose state after prose is known (still draft). */
  readonly afterProse?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => void | Promise<void>;
  /** Observe-only + schedule system turns. */
  readonly committed?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => void | Promise<void>;
  readonly rejected?: (
    ctx: ModuleCtx<TSlice, TConfig> & { readonly failureCode?: string },
  ) => void | Promise<void>;
  readonly load?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => void | Promise<void>;
}

/**
 * Narrative prompt / brief contribution.
 */
export interface NarrativeSectionInput {
  readonly id?: string;
  readonly title?: string;
  readonly text: string;
  readonly priority?: number;
  readonly channel?: "system" | "user";
}

/**
 * Verdict of a `narrative.critic` run (mirrors the NarrativeCritic port result).
 */
export type NarrativeCritique =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface NarrativeCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "narrative";
  readonly system?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) =>
    | NarrativeSectionInput
    | NarrativeSectionInput[]
    | string
    | null
    | undefined
    | Promise<
        | NarrativeSectionInput
        | NarrativeSectionInput[]
        | string
        | null
        | undefined
      >;
  readonly user?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) =>
    | NarrativeSectionInput
    | NarrativeSectionInput[]
    | string
    | null
    | undefined
    | Promise<
        | NarrativeSectionInput
        | NarrativeSectionInput[]
        | string
        | null
        | undefined
      >;
  /** Structured brief namespace data (module id / slice name). */
  readonly brief?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => JsonObject | null | undefined | Promise<JsonObject | null | undefined>;
  /**
   * Chat history for narrative.write.
   * When provided, brief gains `history` automatically.
   */
  readonly history?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) =>
    | readonly { readonly role: "user" | "assistant"; readonly content: string }[]
    | Promise<
        readonly {
          readonly role: "user" | "assistant";
          readonly content: string;
        }[]
      >;
  readonly style?: {
    readonly tone?: string;
    readonly rating?: string;
    readonly voice?: string;
    readonly constraints?: readonly string[];
  };
  /**
   * Post-LLM semantic gate (ADR 0008): rejects a bad narrative draft with a
   * reason → core reruns narrative.write with the same context + failed example
   * + reasons. Read-only moment (op/proposeOp/emit/deny → fail-loud).
   * `null`/`undefined` result is treated as ok (critic "did not notice").
   */
  readonly critic?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) =>
    | NarrativeCritique
    | null
    | undefined
    | Promise<NarrativeCritique | null | undefined>;
}

/**
 * AI task definition (local key → namespaced task type).
 */
export interface AiTaskDef<TSlice = unknown, TConfig = unknown> {
  readonly description?: string;
  readonly input: z.ZodType<JsonObject>;
  readonly output: z.ZodType<JsonObject>;
  readonly optional?: boolean;
  readonly timeoutMs?: number;
  readonly maxRepairAttempts?: number;
  readonly maxToolRounds?: number;
  readonly temperature?: number;
  /** Local tool keys declared in the same ai capability. */
  readonly tools?: readonly string[];
  readonly messages?: (
    input: JsonObject,
    task: AgentTask,
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => readonly LlmMessage[];
  /** When to enqueue this task. */
  readonly runOn?: {
    /** Match system action text / reason. */
    readonly systemReason?: string;
  };
}

/**
 * AI tool definition (local key → namespaced tool id).
 */
export interface AiToolDef<TSlice = unknown, TConfig = unknown> {
  readonly description: string;
  readonly args: z.ZodType<JsonObject>;
  readonly result?: z.ZodType<JsonObject>;
  readonly parametersJsonSchema?: JsonObject;
  readonly handler: (
    args: JsonObject,
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => JsonObject | Promise<JsonObject>;
}

export interface AiCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "ai";
  readonly tasks?: Readonly<Record<string, AiTaskDef<TSlice, TConfig>>>;
  readonly tools?: Readonly<Record<string, AiToolDef<TSlice, TConfig>>>;
}

export interface HostStatusLine {
  readonly slot: string;
  readonly text: string;
}

/**
 * One readModel provider: bare handler function or `{ args, get }` with an
 * optional args schema (validated per call → MODULE_READ_MODEL_ARGS_INVALID).
 */
export type HostReadModelDef<TConfig = unknown> =
  | ((state: WorldState, args: JsonObject, config: TConfig) => JsonObject)
  | {
      /** Optional args schema; validated on every call. */
      readonly args?: import("zod").z.ZodType<JsonObject>;
      readonly get: (
        state: WorldState,
        args: JsonObject,
        config: TConfig,
      ) => JsonObject;
    };

export interface HostCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "host";
  readonly status?: (
    ctx: ModuleCtx<TSlice, TConfig>,
  ) => HostStatusLine[] | Promise<HostStatusLine[]>;
  readonly help?: readonly { readonly id: string; readonly body: string }[];
  readonly readModels?: Readonly<Record<string, HostReadModelDef<TConfig>>>;
}

export interface ConfigCapability<TConfig extends JsonObject = JsonObject> {
  readonly kind: "config";
  /** moduleConfig key; default = slice name. */
  readonly key?: string;
  readonly schema: z.ZodType<TConfig>;
  readonly defaults?: TConfig;
}

export interface AccessCapability {
  readonly kind: "access";
  /** Other slice names this module may read. */
  readonly read?: readonly string[];
}

/**
 * Module events (specs/06 §7): static emit declarations + static subscriptions.
 * Emit is only allowed in `turn.committed` / `turn.rejected` / `event.dispatch`;
 * handlers are observe-only (op/deny fail-loud).
 */
export interface EventsCapability<TSlice = unknown, TConfig = unknown> {
  readonly kind: "events";
  readonly emit?: readonly {
    readonly name: string;
    readonly schema?: z.ZodType<JsonObject>;
    readonly description?: string;
  }[];
  readonly subscribe?: readonly {
    /** Canonical event name (dot-complete). */
    readonly name: string;
    readonly priority?: number;
    readonly handler: (
      ctx: ModuleCtx<TSlice, TConfig>,
      event: { readonly payload: JsonObject },
    ) => void | Promise<void>;
  }[];
}

export type Capability =
  | StateCapability
  | SeedCapability
  | RulesCapability
  | TurnCapability
  | NarrativeCapability
  | AiCapability
  | HostCapability
  | ConfigCapability
  | AccessCapability
  | EventsCapability;
