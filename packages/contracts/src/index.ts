/**
 * `@rpengineext/contracts` — public schemas, ports, and extension surface.
 *
 * Core, modules, agents, persistence, and hosts depend on this package.
 * It must stay free of runtime engine logic and concrete I/O drivers.
 *
 * @packageDocumentation
 */

export {
  CONTRACTS_VERSION,
  CORE_STATE_CAPABILITY,
  SESSION_FORMAT_VERSION,
  TRACE_FORMAT_VERSION,
} from "./version.ts";

export {
  type Result,
  type Failure,
  ok,
  err,
  failure,
  mapResult,
  isOk,
  isErr,
} from "./result.ts";

export {
  type SessionId,
  type TurnId,
  type PassageId,
  type CommandId,
  type TaskId,
  type ModuleId,
  type ProposalId,
  type ClientActionId,
  IdStringSchema,
  asSessionId,
  asTurnId,
  asPassageId,
  asCommandId,
  asTaskId,
  asModuleId,
  asProposalId,
  asClientActionId,
} from "./ids.ts";

export {
  type JsonValue,
  type JsonObject,
  JsonValueSchema,
  JsonObjectSchema,
} from "./json.ts";

export {
  TURN_FAILURE_CODES,
  type TurnFailureCode,
  TurnFailureCodeSchema,
  BOOT_FAILURE_CODES,
  type BootFailureCode,
  BootFailureCodeSchema,
} from "./errors.ts";

export {
  type CoreStateSlice,
  CoreStateSliceSchema,
  type WorldState,
  WorldStateSchema,
  createEmptyWorldState,
} from "./state/world-state.ts";

export {
  type CommandSourceKind,
  CommandSourceKindSchema,
  type CommandSource,
  CommandSourceSchema,
  type StateCommand,
  StateCommandSchema,
  parseStateCommand,
  CORE_COMMAND_TYPES,
  type CoreCommandType,
} from "./state/commands.ts";

export {
  type Proposal,
  ProposalSchema,
  parseProposal,
} from "./state/proposal.ts";

export {
  STAGE_IDS,
  type StageId,
  StageIdSchema,
  INTERCEPTOR_STAGE_IDS,
  type InterceptorStageId,
  InterceptorStageIdSchema,
  INTERCEPTOR_WHEN,
  type InterceptorWhen,
  InterceptorWhenSchema,
  TURN_KINDS,
  type TurnKind,
  TurnKindSchema,
} from "./turn/stages.ts";

export {
  type PlayerAction,
  PlayerActionSchema,
  parsePlayerAction,
  type NormalizedAction,
  NormalizedActionSchema,
  type ActionIntent,
  ActionIntentSchema,
  emptyJsonObject,
} from "./turn/action.ts";

export {
  type Choice,
  ChoiceSchema,
  type PublicView,
  type Passage,
  PassageSchema,
  parsePassage,
} from "./turn/passage.ts";

export {
  type TurnFailure,
  TurnFailureSchema,
  type TurnCommitted,
  TurnCommittedSchema,
  type TurnRejected,
  TurnRejectedSchema,
  type TurnResult,
  TurnResultSchema,
  parseTurnResult,
} from "./turn/turn-result.ts";

export {
  type TurnLogger,
  type TurnTraceApi,
  type TurnRng,
  type TurnContext,
} from "./turn/context.ts";

export {
  PERMISSION_BASE_TOKENS,
  type PermissionToken,
  PermissionTokenSchema,
  isPermissionToken,
  permissionCovers,
  hasPermission,
  type PermissionChecker,
  createPermissionChecker,
  proposePermissionForSlice,
  agentCallPermission,
} from "./modules/permissions.ts";

export {
  CONTRIBUTION_PORT_IDS,
  type ContributionPortId,
  isContributionPortId,
  type PortHandler,
  type InputNormalizer,
  type ActionClassifier,
  type EntityResolver,
  type IntentContributor,
  type IntentScorer,
  type DisambiguationProvider,
  type GuardDecision,
  type Guard,
  type SoftGuard,
  type ResourceCostEvaluator,
  type PrerequisiteChecker,
  type PolicyRule,
  type Planner,
  type SalienceProvider,
  type AgentTaskContributor,
  type AgentToolHandler,
  type BriefPolicy,
  type PromptFragmentProvider,
  type OutputRepairHintProvider,
  type TransitionContributor,
  type CommandDecorator,
  type CommandValidator,
  type Invariant,
  type ConflictResolver,
  type DraftSimulator,
  type NarrativeContextProvider,
  type NarrativeStyleProvider,
  type NarrativeCritic,
  type PostNarrativeContributor,
  type PassageAssembler,
  type ChoiceContributor,
  type ChoiceFilter,
  type StatusPanelProvider,
  type LocalizationContributor,
  type SessionBootstrap,
  type SessionHydrator,
  type TurnSetup,
  type TurnTeardown,
  type OnTurnRejected,
  type AfterCommitHook,
  type SystemTurnScheduler,
  type HelpProvider,
  type DebugDumper,
  type CliCommandProvider,
  type SaveMetadataProvider,
} from "./modules/extension-ports.ts";

export {
  type InterceptorEffect,
  type StageInterceptor,
} from "./modules/interceptors.ts";

export type {
  SliceDefinition,
  CommandDefinition,
  InvariantDefinition,
  ConflictKeyDefinition,
  AgentTaskTypeDefinition,
  AgentToolDefinition,
  ActionTypeDefinition,
  IntentTypeDefinition,
  ChoiceKindDefinition,
  PublicProjectorDefinition,
  MemoryKindDefinition,
  ReadModelDefinition,
  TemplateDefinition,
  ConfigSchemaDefinition,
  MigrationDefinition,
  CapabilityDefinition,
} from "./modules/catalogs.ts";

export {
  ModuleManifestSchema,
  type ModuleManifest,
  parseModuleManifest,
  effectiveContributes,
} from "./modules/manifest.ts";

export type { ModuleRegisterContext } from "./modules/register-context.ts";

export type {
  ModuleLifecycleContext,
  Module,
  ModuleFactory,
} from "./modules/module.ts";

export {
  type AgentRequester,
  AgentRequesterSchema,
  type AgentTaskConstraints,
  AgentTaskConstraintsSchema,
  type AgentTask,
  AgentTaskSchema,
  parseAgentTask,
  type TokenUsage,
  TokenUsageSchema,
  type AgentError,
  AgentErrorSchema,
  type AgentResult,
  AgentResultSchema,
  parseAgentResult,
} from "./agents/task.ts";

export {
  STANDARD_AGENT_TASK_TYPES,
  type StandardAgentTaskType,
  NarrativeHistoryMessageSchema,
  type NarrativeHistoryMessage,
  NarrativeWriteInputSchema,
  type NarrativeWriteInput,
  NarrativeWriteOutputSchema,
  type NarrativeWriteOutput,
  parseNarrativeWriteOutput,
  ActionInterpretInputSchema,
  type ActionInterpretInput,
  ActionInterpretOutputSchema,
  type ActionInterpretOutput,
  parseActionInterpretOutput,
} from "./agents/standard-tasks.ts";

export type {
  LlmMessage,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmStreamHandlers,
  LlmPort,
} from "./agents/llm-port.ts";

export {
  type JournalEntry,
  JournalEntrySchema,
  parseJournalEntry,
} from "./persistence/journal.ts";

export {
  type SessionSnapshot,
  SessionSnapshotSchema,
  parseSessionSnapshot,
  type SessionMeta,
  SessionMetaSchema,
  EnabledModuleRefSchema,
} from "./persistence/snapshot.ts";

export type {
  PersistencePort,
  SavePointer,
  TurnPersistenceUnit,
} from "./persistence/port.ts";

export {
  type TraceNote,
  TraceNoteSchema,
  parseTraceNote,
} from "./tracing/note.ts";

export type { TraceSinkPort, TraceOutcome } from "./tracing/port.ts";

export type {
  EngineEvent,
  EngineEventType,
  EngineEventHandler,
  EventBusPort,
} from "./events/events.ts";

export type {
  Session,
  Engine,
  NewSessionSpec,
  EngineDependencies,
} from "./engine.ts";
