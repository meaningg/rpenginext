import type { Result, Failure } from "../result.ts";
import type { TurnLogger } from "../turn/context.ts";
import type {
  ActionTypeDefinition,
  AgentTaskTypeDefinition,
  AgentToolDefinition,
  CapabilityDefinition,
  ChoiceKindDefinition,
  CommandDefinition,
  ConfigSchemaDefinition,
  ConflictKeyDefinition,
  IntentTypeDefinition,
  InvariantDefinition,
  MemoryKindDefinition,
  MigrationDefinition,
  PublicProjectorDefinition,
  ReadModelDefinition,
  SliceDefinition,
  TemplateDefinition,
} from "./catalogs.ts";
import type {
  ActionClassifier,
  AfterCommitHook,
  AgentTaskContributor,
  AgentToolHandler,
  BriefPolicy,
  ChoiceContributor,
  ChoiceFilter,
  CliCommandProvider,
  CommandDecorator,
  CommandValidator,
  ConflictResolver,
  DebugDumper,
  DisambiguationProvider,
  DraftSimulator,
  EntityResolver,
  Guard,
  HelpProvider,
  InputNormalizer,
  IntentContributor,
  IntentScorer,
  Invariant,
  LocalizationContributor,
  NarrativeContextProvider,
  NarrativeCritic,
  NarrativeStyleProvider,
  OnTurnRejected,
  PostNarrativeContributor,
  OutputRepairHintProvider,
  PassageAssembler,
  Planner,
  PolicyRule,
  PrerequisiteChecker,
  PromptFragmentProvider,
  ResourceCostEvaluator,
  SalienceProvider,
  SaveMetadataProvider,
  SessionBootstrap,
  SessionHydrator,
  SoftGuard,
  StatusPanelProvider,
  SystemTurnScheduler,
  TransitionContributor,
  TurnSetup,
  TurnTeardown,
} from "./extension-ports.ts";
import type { StageInterceptor } from "./interceptors.ts";
import type { ModuleManifest } from "./manifest.ts";

/**
 * Registration API available during `module.register(ctx)`.
 * Catalog (A) + interceptors (B) + typed ports (C).
 */
export interface ModuleRegisterContext {
  readonly manifest: ModuleManifest;
  readonly log: TurnLogger;

  // --- Layer A: catalogs ---------------------------------------------------
  registerSlice(def: SliceDefinition): Result<void, Failure>;
  registerCommand(def: CommandDefinition): Result<void, Failure>;
  registerInvariant(def: InvariantDefinition): Result<void, Failure>;
  registerConflictKey(def: ConflictKeyDefinition): Result<void, Failure>;
  registerAgentTaskType(def: AgentTaskTypeDefinition): Result<void, Failure>;
  registerAgentTool(def: AgentToolDefinition): Result<void, Failure>;
  registerActionType(def: ActionTypeDefinition): Result<void, Failure>;
  registerIntentType(def: IntentTypeDefinition): Result<void, Failure>;
  registerChoiceKind(def: ChoiceKindDefinition): Result<void, Failure>;
  registerPublicProjector(def: PublicProjectorDefinition): Result<void, Failure>;
  registerMemoryKind(def: MemoryKindDefinition): Result<void, Failure>;
  registerCapability(def: CapabilityDefinition | string): Result<void, Failure>;
  registerReadModel(def: ReadModelDefinition): Result<void, Failure>;
  registerTemplate(def: TemplateDefinition): Result<void, Failure>;
  registerConfigSchema(def: ConfigSchemaDefinition): Result<void, Failure>;
  registerMigration(def: MigrationDefinition): Result<void, Failure>;

  // --- Layer B: interceptors -----------------------------------------------
  addInterceptor(interceptor: StageInterceptor): Result<void, Failure>;

  // --- Layer C: typed ports ------------------------------------------------
  addInputNormalizer(handler: InputNormalizer): Result<void, Failure>;
  addActionClassifier(handler: ActionClassifier): Result<void, Failure>;
  addEntityResolver(handler: EntityResolver): Result<void, Failure>;
  addIntentContributor(handler: IntentContributor): Result<void, Failure>;
  addIntentScorer(handler: IntentScorer): Result<void, Failure>;
  addDisambiguationProvider(handler: DisambiguationProvider): Result<void, Failure>;
  addGuard(handler: Guard): Result<void, Failure>;
  addSoftGuard(handler: SoftGuard): Result<void, Failure>;
  addResourceCostEvaluator(handler: ResourceCostEvaluator): Result<void, Failure>;
  addPrerequisiteChecker(handler: PrerequisiteChecker): Result<void, Failure>;
  addPolicyRule(handler: PolicyRule): Result<void, Failure>;
  addPlanner(handler: Planner): Result<void, Failure>;
  addSalienceProvider(handler: SalienceProvider): Result<void, Failure>;
  addAgentTaskContributor(handler: AgentTaskContributor): Result<void, Failure>;
  /** Runtime tool handler paired with {@link registerAgentTool}. */
  addAgentToolHandler(handler: AgentToolHandler): Result<void, Failure>;
  addBriefPolicy(handler: BriefPolicy): Result<void, Failure>;
  addPromptFragmentProvider(handler: PromptFragmentProvider): Result<void, Failure>;
  addOutputRepairHintProvider(handler: OutputRepairHintProvider): Result<void, Failure>;
  addTransitionContributor(handler: TransitionContributor): Result<void, Failure>;
  addCommandDecorator(handler: CommandDecorator): Result<void, Failure>;
  addCommandValidator(handler: CommandValidator): Result<void, Failure>;
  addInvariantPort(handler: Invariant): Result<void, Failure>;
  addConflictResolver(handler: ConflictResolver): Result<void, Failure>;
  addDraftSimulator(handler: DraftSimulator): Result<void, Failure>;
  addNarrativeContextProvider(handler: NarrativeContextProvider): Result<void, Failure>;
  addNarrativeStyleProvider(handler: NarrativeStyleProvider): Result<void, Failure>;
  addNarrativeCritic(handler: NarrativeCritic): Result<void, Failure>;
  addPostNarrativeContributor(handler: PostNarrativeContributor): Result<void, Failure>;
  addPassageAssembler(handler: PassageAssembler): Result<void, Failure>;
  addChoiceContributor(handler: ChoiceContributor): Result<void, Failure>;
  addChoiceFilter(handler: ChoiceFilter): Result<void, Failure>;
  addStatusPanelProvider(handler: StatusPanelProvider): Result<void, Failure>;
  addLocalizationContributor(handler: LocalizationContributor): Result<void, Failure>;
  addSessionBootstrap(handler: SessionBootstrap): Result<void, Failure>;
  addSessionHydrator(handler: SessionHydrator): Result<void, Failure>;
  addTurnSetup(handler: TurnSetup): Result<void, Failure>;
  addTurnTeardown(handler: TurnTeardown): Result<void, Failure>;
  addOnTurnRejected(handler: OnTurnRejected): Result<void, Failure>;
  addAfterCommitHook(handler: AfterCommitHook): Result<void, Failure>;
  addSystemTurnScheduler(handler: SystemTurnScheduler): Result<void, Failure>;
  addHelpProvider(handler: HelpProvider): Result<void, Failure>;
  addDebugDumper(handler: DebugDumper): Result<void, Failure>;
  addCliCommandProvider(handler: CliCommandProvider): Result<void, Failure>;
  addSaveMetadataProvider(handler: SaveMetadataProvider): Result<void, Failure>;
}
