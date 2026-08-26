import type { JsonObject, StageId } from "@rpengineext/contracts";

/**
 * Runtime engine configuration (host may override partials).
 * @see docs/architecture/08-configuration.md
 */
export interface EngineConfig {
  readonly modules: {
    readonly strictManifest: boolean;
    /** Fail boot when a required capability is missing. */
    readonly failOnMissingCapability: boolean;
  };
  /**
   * Host-provided per-module config sections, keyed by
   * {@link import("@rpengineext/contracts").ConfigSchemaDefinition.key}.
   * Validated at boot against registered config schemas.
   */
  readonly moduleConfig: Readonly<Record<string, JsonObject>>;
  readonly turn: {
    readonly stageTimeoutsMs: Readonly<Record<StageId, number>>;
    /** v1 supports reject-on-busy only (queue is out of scope). */
    readonly sessionBusyPolicy: "error";
    readonly defaultTurnKind: "player";
    /** Max retained clientActionId → TurnResult entries per session. */
    readonly idempotencyLimit: number;
    /**
     * Fallback locale when session meta has no `locale`.
     * Forwarded to localization contributors and narrative.write.
     */
    readonly locale: string;
  };
  readonly agents: {
    /** mock uses scripts; llm uses LlmPort for standard tasks. */
    readonly mode: "mock" | "llm";
    /** Model name/alias forwarded to LlmPort (from host env/config). */
    readonly defaultModel: string;
    readonly maxParallelPerTurn: number;
    readonly maxRepairAttempts: number;
    readonly defaultTimeoutMs: number;
    readonly temperature?: number;
    /**
     * When true, NORMALIZE may call `action.interpret` for free_text
     * after normalizers/classifiers (doc optional path).
     */
    readonly enableActionInterpret: boolean;
    /**
     * When true, prefer {@link import("@rpengineext/contracts").LlmPort.completeStream}
     * for standard tasks and emit non-authoritative `llm.stream.delta` events.
     */
    readonly streaming: boolean;
    /** Max model→tool→model rounds for generic tool-calling tasks. */
    readonly maxToolRounds: number;
    /**
     * Narrative prompt profiles (ADR 0007): model alias → `id@version`.
     * Absent mapping falls back to `defaultPromptProfile` → `default@1.0.0`.
     */
    readonly promptProfiles?: Readonly<Record<string, string>>;
    /**
     * Fallback `id@version` when no per-model mapping matches.
     * Default: `default@1.0.0` (built-in profile, always present).
     */
    readonly defaultPromptProfile?: string;
    /**
     * Env quick override (`RP_NARRATIVE_PROMPT_PROFILE`); wins over both
     * per-model mapping and fallback (experiments without config edits).
     */
    readonly promptProfileOverride?: string;
    /**
     * Directory with `*.json` prompt profiles; default `data/prompts`.
     * Explicitly set dir must exist (boot fail), default may be absent (warn).
     */
    readonly promptProfilesDir?: string;
  };
  readonly persistence: {
    readonly policy: "per_turn" | "manual";
  };
  readonly tracing: {
    readonly enabled: boolean;
    readonly directory: string;
    readonly includePrompts: boolean;
    readonly includeRawModelOutput: boolean;
    readonly includeFullStateSnapshots: boolean;
    readonly maxStringFieldChars: number;
    readonly maxArrayItems: number;
    readonly redactKeys: readonly string[];
    readonly writeOnReject: boolean;
    readonly writeOnCommit: boolean;
    readonly failTurnOnWriteError: boolean;
  };
  readonly logging: {
    readonly level: string;
    readonly json: boolean;
  };
}
