import type { StageId } from "@rpengineext/contracts";

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
  readonly turn: {
    readonly stageTimeoutsMs: Readonly<Record<StageId, number>>;
    readonly sessionBusyPolicy: "error";
    readonly defaultTurnKind: "player";
    /** Max retained clientActionId → TurnResult entries per session. */
    readonly idempotencyLimit: number;
    /** Locale forwarded to localization contributors (present stage). */
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
