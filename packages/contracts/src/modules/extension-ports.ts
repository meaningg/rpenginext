import type { Result, Failure } from "../result.ts";
import type { StateCommand } from "../state/commands.ts";
import type { JsonObject } from "../json.ts";
import type { TurnContext } from "../turn/context.ts";
import type {
  ActionIntent,
  NormalizedAction,
  PlayerAction,
} from "../turn/action.ts";
import type { Passage } from "../turn/passage.ts";
import type { AgentTask } from "../agents/task.ts";
import type { WorldState } from "../state/world-state.ts";
import type { TurnKind } from "../turn/stages.ts";

/**
 * Closed set of typed contribution port ids (layer C, freeze v1).
 * @see docs/architecture/12-extension-surface.md
 */
export const CONTRIBUTION_PORT_IDS = [
  // Input & understanding
  "InputNormalizer",
  "ActionClassifier",
  "EntityResolver",
  "IntentContributor",
  "IntentScorer",
  "DisambiguationProvider",
  // Rules & legality
  "Guard",
  "SoftGuard",
  "ResourceCostEvaluator",
  "PrerequisiteChecker",
  "PolicyRule",
  // Planning & AI
  "Planner",
  "SalienceProvider",
  "AgentTaskContributor",
  "AgentTool",
  "BriefPolicy",
  "PromptFragmentProvider",
  "OutputRepairHintProvider",
  // World transition
  "TransitionContributor",
  "CommandDecorator",
  "CommandValidator",
  "Invariant",
  "ConflictResolver",
  "DraftSimulator",
  // Narrative & presentation
  "NarrativeContextProvider",
  "NarrativeStyleProvider",
  "NarrativeCritic",
  "PostNarrativeContributor",
  "PassageAssembler",
  "StatusPanelProvider",
  "LocalizationContributor",
  // Lifecycle
  "SessionBootstrap",
  "SessionHydrator",
  "TurnSetup",
  "TurnTeardown",
  "OnTurnRejected",
  "AfterCommitHook",
  "SystemTurnScheduler",
  // Host-facing
  "HelpProvider",
  "DebugDumper",
  "CliCommandProvider",
  "SaveMetadataProvider",
] as const;

export type ContributionPortId = (typeof CONTRIBUTION_PORT_IDS)[number];

/**
 * Returns true if value is a known contribution port id.
 *
 * @param value - candidate
 */
export function isContributionPortId(
  value: string,
): value is ContributionPortId {
  return (CONTRIBUTION_PORT_IDS as readonly string[]).includes(value);
}

/** Generic async handler shape used by most ports. */
export type PortHandler<I, O> = (
  input: I,
  ctx: TurnContext,
) => Promise<Result<O, Failure>> | Result<O, Failure>;

// --- Input & understanding -------------------------------------------------

export interface InputNormalizer {
  normalize: PortHandler<PlayerAction, Partial<NormalizedAction>>;
}

export interface ActionClassifier {
  classify: PortHandler<
    { raw: PlayerAction; normalized?: NormalizedAction },
    { actionType: string; confidence: number }[]
  >;
}

export interface EntityResolver {
  resolve: PortHandler<
    { text: string; normalized?: NormalizedAction },
    { ref: string; entityId: string; confidence: number }[]
  >;
}

export interface IntentContributor {
  contribute: PortHandler<
    { action: NormalizedAction; intent: ActionIntent },
    { patches: JsonObject }
  >;
}

export interface IntentScorer {
  score: PortHandler<
    { candidates: ActionIntent[] },
    { intentType: string; score: number }[]
  >;
}

/**
 * Candidate clarification option for ambiguous entity resolution failures.
 * Not a player-turn input surface — only failure details.
 */
export interface DisambiguationOption {
  readonly id: string;
  readonly label: string;
  readonly payload?: JsonObject;
}

export interface DisambiguationProvider {
  provide: PortHandler<
    { reason: string; candidates: unknown[] },
    { options: DisambiguationOption[] }
  >;
}

// --- Rules & legality ------------------------------------------------------

export interface GuardDecision {
  readonly allow: boolean;
  readonly code?: string;
  readonly message?: string;
}

export interface Guard {
  check: PortHandler<
    { action: NormalizedAction; intent: ActionIntent },
    GuardDecision
  >;
}

export interface SoftGuard {
  check: PortHandler<
    { action: NormalizedAction; intent: ActionIntent },
    { warnings: string[] }
  >;
}

export interface ResourceCostEvaluator {
  evaluate: PortHandler<
    { intent: ActionIntent },
    { costs: Record<string, number> }
  >;
}

export interface PrerequisiteChecker {
  check: PortHandler<
    { intent: ActionIntent },
    { missing: string[] }
  >;
}

export interface PolicyRule {
  evaluate: PortHandler<
    { intent: ActionIntent; draftCommands: readonly StateCommand[] },
    { decision: "allow" | "deny"; reason?: string }
  >;
}

// --- Planning & AI ---------------------------------------------------------

export interface Planner {
  plan: PortHandler<
    { intent: ActionIntent },
    { artifacts: JsonObject; suggestedTasks: AgentTask[] }
  >;
}

export interface SalienceProvider {
  provide: PortHandler<
    { intent: ActionIntent },
    { entityIds: string[]; scores?: Record<string, number> }
  >;
}

export interface AgentTaskContributor {
  contribute: PortHandler<
    {
      stage: string;
      intent?: ActionIntent;
      turnKind?: TurnKind;
      rawAction?: PlayerAction;
    },
    { tasks: AgentTask[] }
  >;
}

export interface AgentToolHandler {
  readonly id: string;
  readonly description: string;
  invoke(
    args: JsonObject,
    ctx: TurnContext,
  ): Promise<Result<JsonObject, Failure>> | Result<JsonObject, Failure>;
}

export interface BriefPolicy {
  contribute: PortHandler<
    Record<string, never>,
    { denyMention: string[]; allowMention?: string[] }
  >;
}

export interface PromptFragmentProvider {
  provide: PortHandler<
    { slot: string },
    { fragments: { id: string; text: string; priority?: number }[] }
  >;
}

export interface OutputRepairHintProvider {
  provide: PortHandler<
    { taskType: string; schemaError: string },
    { hints: string[] }
  >;
}

// --- World transition ------------------------------------------------------

export interface TransitionContributor {
  contribute: PortHandler<
    { intent: ActionIntent; planArtifacts: JsonObject },
    { commands: StateCommand[] }
  >;
}

export interface CommandDecorator {
  decorate: PortHandler<
    { commands: readonly StateCommand[] },
    { commands: StateCommand[] }
  >;
}

export interface CommandValidator {
  validate: PortHandler<
    { command: StateCommand; draft: WorldState },
    { ok: true } | { ok: false; reason: string }
  >;
}

export interface Invariant {
  check: PortHandler<{ draft: WorldState }, { ok: true } | { ok: false; reason: string }>;
}

export interface ConflictResolver {
  resolve: PortHandler<
    {
      key: string;
      commands: readonly StateCommand[];
      draft: WorldState;
    },
    { commands: StateCommand[] }
  >;
}

export interface DraftSimulator {
  simulate: PortHandler<
    { draft: WorldState; commands: readonly StateCommand[] },
    { preview: JsonObject }
  >;
}

// --- Narrative & presentation ----------------------------------------------

export interface NarrativeContextProvider {
  provide: PortHandler<
    { draft: WorldState; intent: ActionIntent },
    { namespace: string; data: JsonObject }
  >;
}

export interface NarrativeStyleProvider {
  provide: PortHandler<
    Record<string, never>,
    { tone?: string; rating?: string; voice?: string; constraints?: string[] }
  >;
}

export interface NarrativeCritic {
  critique: PortHandler<
    { prose: string; brief: JsonObject; draft: WorldState },
    { ok: true } | { ok: false; reason: string }
  >;
}

/**
 * Emits draft StateCommands after passage prose is known and before COMMIT.
 * Used for same-turn materialization (e.g. working-memory pairs).
 */
export interface PostNarrativeContributor {
  contribute: PortHandler<
    {
      passage: Passage;
      intent: ActionIntent;
      draft: WorldState;
      rawAction: PlayerAction;
      turnKind: TurnKind;
    },
    { commands: StateCommand[] }
  >;
}

export interface PassageAssembler {
  assemble: PortHandler<
    { prose: string; draft: WorldState },
    { sections: { slot: string; priority: number; body: string }[] }
  >;
}

export interface StatusPanelProvider {
  provide: PortHandler<
    { draft: WorldState },
    { lines: { slot: string; text: string }[] }
  >;
}

export interface LocalizationContributor {
  provide: PortHandler<
    { locale: string },
    { strings: Record<string, string> }
  >;
}

// --- Lifecycle -------------------------------------------------------------

export interface SessionBootstrap {
  bootstrap: PortHandler<
    { isNewGame: boolean; meta: JsonObject; seed?: string },
    { commands: StateCommand[] }
  >;
}

export interface SessionHydrator {
  hydrate: PortHandler<{ state: WorldState }, void>;
}

export interface TurnSetup {
  setup: PortHandler<Record<string, never>, { extras?: JsonObject }>;
}

export interface TurnTeardown {
  teardown: PortHandler<Record<string, never>, void>;
}

export interface OnTurnRejected {
  onRejected: PortHandler<{ failure: Failure }, void>;
}

export interface AfterCommitHook {
  afterCommit: PortHandler<
    { passage: Passage; acceptedCommands: readonly StateCommand[] },
    void
  >;
}

/**
 * When to run a scheduled system turn relative to the player response.
 * - inline: drain before returning the player TurnResult (legacy default)
 * - background: return player result first; run when the session is free
 */
export type SystemTurnScheduleMode = "inline" | "background";

export interface SystemTurnScheduler {
  schedule: PortHandler<
    {
      passage: Passage;
      acceptedCommands: readonly StateCommand[];
      rawAction: PlayerAction;
      turnKind: TurnKind;
    },
    {
      requests: {
        reason: string;
        payload?: JsonObject;
        mode?: SystemTurnScheduleMode;
      }[];
    }
  >;
}

// --- Host-facing -----------------------------------------------------------

export interface HelpProvider {
  provide: PortHandler<{ topic?: string }, { topics: { id: string; body: string }[] }>;
}

export interface DebugDumper {
  dump: PortHandler<{ state: WorldState }, { namespace: string; data: JsonObject }>;
}

export interface CliCommandProvider {
  commands: PortHandler<
    Record<string, never>,
    {
      commands: {
        name: string;
        description: string;
        handler: (
          args: string[],
          ctx: TurnContext,
        ) => Promise<Result<string, Failure>> | Result<string, Failure>;
      }[];
    }
  >;
}

export interface SaveMetadataProvider {
  provide: PortHandler<
    { state: WorldState },
    { fields: Record<string, string | number | boolean> }
  >;
}
