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
  type FailureDetails,
  ok,
  err,
  failure,
  moduleFailure,
  mapResult,
  isOk,
  isErr,
  ModuleCtxViolation,
  isModuleCtxViolation,
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
  MODULE_FAILURE_CODES,
  type ModuleFailureCode,
  ModuleFailureCodeSchema,
  MODULE_EVENT_MAX_CASCADE_DEPTH,
  MODULE_EVENT_MAX_BURST_PER_TURN,
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
  type DisambiguationOption,
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
  type NarrativePromptChannel,
  type NarrativePromptSection,
  type NarrativePromptContributor,
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
  type StatusPanelProvider,
  type LocalizationContributor,
  type SessionBootstrap,
  type SessionHydrator,
  type TurnSetup,
  type TurnTeardown,
  type OnTurnRejected,
  type AfterCommitHook,
  type SystemTurnScheduler,
  type SystemTurnScheduleMode,
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

export {
  MODULE_IR_VERSION,
  SUPPORTED_MODULE_IR_VERSIONS,
  type ModuleIrVersion,
  type CompiledOpIr,
  type CompiledSliceIr,
  type CompiledMomentsIr,
  type CompiledEventEmitIr,
  type CompiledEventSubscribeIr,
  type CompiledEventsIr,
  type CompiledLifecycleIr,
  type CompiledAiTaskIr,
  type CompiledAiToolIr,
  type CompiledModuleIR,
  type CompiledModule,
} from "./modules/compiled-ir.ts";

export {
  MODULE_EVENTS_EXTRAS_KEY,
  type ModuleEventName,
  type ModuleEmitDecl,
  type ModuleSubscribeDecl,
  type ModuleEvent,
  type ModuleEventPublisher,
  type ModuleEventSubscription,
  type ModuleSubscribeCtx,
  enqueueModuleEvent,
  takeModuleEvents,
} from "./modules/module-events.ts";

export {
  MODULE_OP_PROPOSALS_EXTRAS_KEY,
  MODULE_SYSTEM_SCHEDULES_EXTRAS_PREFIX,
  type ModuleOpProposal,
  type ModuleSystemScheduleProposal,
  enqueueModuleOpProposal,
  takeModuleOpProposals,
  setModuleSystemSchedules,
  takeModuleSystemSchedules,
} from "./modules/module-proposals.ts";

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
  LlmToolDefinition,
  LlmToolCall,
  LlmToolChoice,
  LlmFinishReason,
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
  type PendingSystemTurnSnapshot,
  PendingSystemTurnSchema,
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
