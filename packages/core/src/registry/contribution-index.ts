import type {
  ActionClassifier,
  ActionTypeDefinition,
  AfterCommitHook,
  AgentTaskContributor,
  AgentTaskTypeDefinition,
  AgentToolDefinition,
  AgentToolHandler,
  BriefPolicy,
  CapabilityDefinition,
  CliCommandProvider,
  CommandDecorator,
  CommandDefinition,
  CommandValidator,
  ConfigSchemaDefinition,
  ConflictKeyDefinition,
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
  IntentTypeDefinition,
  Invariant,
  InvariantDefinition,
  LocalizationContributor,
  MemoryKindDefinition,
  MigrationDefinition,
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
  PublicProjectorDefinition,
  ReadModelDefinition,
  ResourceCostEvaluator,
  SalienceProvider,
  SaveMetadataProvider,
  SessionBootstrap,
  SessionHydrator,
  SliceDefinition,
  SoftGuard,
  StageInterceptor,
  StatusPanelProvider,
  SystemTurnScheduler,
  TemplateDefinition,
  TransitionContributor,
  TurnSetup,
  TurnTeardown,
} from "@rpengineext/contracts";

/**
 * Ordered contribution bag entry tagged with owning module.
 */
export interface Owned<T> {
  readonly moduleId: string;
  readonly priority: number;
  readonly value: T;
}

/**
 * Central store for catalog registrations, interceptors, and typed ports.
 */
export class ContributionIndex {
  readonly slices = new Map<string, Owned<SliceDefinition>>();
  readonly commands = new Map<string, Owned<CommandDefinition>>();
  readonly invariants: Owned<InvariantDefinition>[] = [];
  readonly conflictKeys: Owned<ConflictKeyDefinition>[] = [];
  readonly agentTaskTypes = new Map<string, Owned<AgentTaskTypeDefinition>>();
  readonly agentTools = new Map<string, Owned<AgentToolDefinition>>();
  readonly actionTypes = new Map<string, Owned<ActionTypeDefinition>>();
  readonly intentTypes = new Map<string, Owned<IntentTypeDefinition>>();
  readonly publicProjectors: Owned<PublicProjectorDefinition>[] = [];
  readonly memoryKinds = new Map<string, Owned<MemoryKindDefinition>>();
  readonly capabilities = new Set<string>();
  readonly readModels = new Map<string, Owned<ReadModelDefinition>>();
  readonly templates = new Map<string, Owned<TemplateDefinition>>();
  readonly configSchemas = new Map<string, Owned<ConfigSchemaDefinition>>();
  readonly migrations: Owned<MigrationDefinition>[] = [];

  readonly interceptors: Owned<StageInterceptor>[] = [];

  readonly inputNormalizers: Owned<InputNormalizer>[] = [];
  readonly actionClassifiers: Owned<ActionClassifier>[] = [];
  readonly entityResolvers: Owned<EntityResolver>[] = [];
  readonly intentContributors: Owned<IntentContributor>[] = [];
  readonly intentScorers: Owned<IntentScorer>[] = [];
  readonly disambiguationProviders: Owned<DisambiguationProvider>[] = [];
  readonly guards: Owned<Guard>[] = [];
  readonly softGuards: Owned<SoftGuard>[] = [];
  readonly resourceCostEvaluators: Owned<ResourceCostEvaluator>[] = [];
  readonly prerequisiteCheckers: Owned<PrerequisiteChecker>[] = [];
  readonly policyRules: Owned<PolicyRule>[] = [];
  readonly planners: Owned<Planner>[] = [];
  readonly salienceProviders: Owned<SalienceProvider>[] = [];
  readonly agentTaskContributors: Owned<AgentTaskContributor>[] = [];
  readonly agentToolHandlers: Owned<AgentToolHandler>[] = [];
  readonly briefPolicies: Owned<BriefPolicy>[] = [];
  readonly promptFragmentProviders: Owned<PromptFragmentProvider>[] = [];
  readonly outputRepairHintProviders: Owned<OutputRepairHintProvider>[] = [];
  readonly transitionContributors: Owned<TransitionContributor>[] = [];
  readonly commandDecorators: Owned<CommandDecorator>[] = [];
  readonly commandValidators: Owned<CommandValidator>[] = [];
  readonly invariantPorts: Owned<Invariant>[] = [];
  readonly conflictResolvers: Owned<ConflictResolver>[] = [];
  readonly draftSimulators: Owned<DraftSimulator>[] = [];
  readonly narrativeContextProviders: Owned<NarrativeContextProvider>[] = [];
  readonly narrativeStyleProviders: Owned<NarrativeStyleProvider>[] = [];
  readonly narrativeCritics: Owned<NarrativeCritic>[] = [];
  readonly postNarrativeContributors: Owned<PostNarrativeContributor>[] = [];
  readonly passageAssemblers: Owned<PassageAssembler>[] = [];
  readonly statusPanelProviders: Owned<StatusPanelProvider>[] = [];
  readonly localizationContributors: Owned<LocalizationContributor>[] = [];
  readonly sessionBootstraps: Owned<SessionBootstrap>[] = [];
  readonly sessionHydrators: Owned<SessionHydrator>[] = [];
  readonly turnSetups: Owned<TurnSetup>[] = [];
  readonly turnTeardowns: Owned<TurnTeardown>[] = [];
  readonly onTurnRejected: Owned<OnTurnRejected>[] = [];
  readonly afterCommitHooks: Owned<AfterCommitHook>[] = [];
  readonly systemTurnSchedulers: Owned<SystemTurnScheduler>[] = [];
  readonly helpProviders: Owned<HelpProvider>[] = [];
  readonly debugDumpers: Owned<DebugDumper>[] = [];
  readonly cliCommandProviders: Owned<CliCommandProvider>[] = [];
  readonly saveMetadataProviders: Owned<SaveMetadataProvider>[] = [];

  /**
   * Sorts owned lists by (priority asc, moduleId asc).
   */
  sortAll(): void {
    const lists: Owned<unknown>[][] = [
      this.invariants,
      this.conflictKeys,
      this.publicProjectors,
      this.migrations,
      this.interceptors,
      this.inputNormalizers,
      this.actionClassifiers,
      this.entityResolvers,
      this.intentContributors,
      this.intentScorers,
      this.disambiguationProviders,
      this.guards,
      this.softGuards,
      this.resourceCostEvaluators,
      this.prerequisiteCheckers,
      this.policyRules,
      this.planners,
      this.salienceProviders,
      this.agentTaskContributors,
      this.agentToolHandlers,
      this.briefPolicies,
      this.promptFragmentProviders,
      this.outputRepairHintProviders,
      this.transitionContributors,
      this.commandDecorators,
      this.commandValidators,
      this.invariantPorts,
      this.conflictResolvers,
      this.draftSimulators,
      this.narrativeContextProviders,
      this.narrativeStyleProviders,
      this.narrativeCritics,
      this.postNarrativeContributors,
      this.passageAssemblers,
      this.statusPanelProviders,
      this.localizationContributors,
      this.sessionBootstraps,
      this.sessionHydrators,
      this.turnSetups,
      this.turnTeardowns,
      this.onTurnRejected,
      this.afterCommitHooks,
      this.systemTurnSchedulers,
      this.helpProviders,
      this.debugDumpers,
      this.cliCommandProviders,
      this.saveMetadataProviders,
    ];
    for (const list of lists) {
      list.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.moduleId.localeCompare(b.moduleId);
      });
    }
  }

  /**
   * Returns interceptors for a stage/when pair in deterministic order.
   *
   * @param stage - interceptor stage id
   * @param when - before | after | onError
   */
  getInterceptors(
    stage: string,
    when: "before" | "after" | "onError",
  ): readonly Owned<StageInterceptor>[] {
    return this.interceptors.filter(
      (item) => item.value.stage === stage && item.value.when === when,
    );
  }

  /**
   * Records a provided capability id.
   *
   * @param def - capability definition or raw id
   */
  addCapability(def: CapabilityDefinition | string): void {
    const id = typeof def === "string" ? def : def.id;
    this.capabilities.add(id);
  }
}
