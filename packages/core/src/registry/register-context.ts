import {
  err,
  failure,
  ok,
  type ActionClassifier,
  type ActionTypeDefinition,
  type AfterCommitHook,
  type AgentTaskContributor,
  type AgentTaskTypeDefinition,
  type AgentToolDefinition,
  type AgentToolHandler,
  type BriefPolicy,
  type CapabilityDefinition,
  type CliCommandProvider,
  type CommandDecorator,
  type CommandDefinition,
  type CommandValidator,
  type ConfigSchemaDefinition,
  type ConflictKeyDefinition,
  type ConflictResolver,
  type DebugDumper,
  type DisambiguationProvider,
  type DraftSimulator,
  type EntityResolver,
  type Failure,
  type Guard,
  type HelpProvider,
  type InputNormalizer,
  type IntentContributor,
  type IntentScorer,
  type IntentTypeDefinition,
  type Invariant,
  type InvariantDefinition,
  type LocalizationContributor,
  type MemoryKindDefinition,
  type MigrationDefinition,
  type ModuleManifest,
  type ModuleRegisterContext,
  type NarrativeContextProvider,
  type NarrativeCritic,
  type NarrativePromptContributor,
  type NarrativeStyleProvider,
  type OnTurnRejected,
  type PostNarrativeContributor,
  type OutputRepairHintProvider,
  type PassageAssembler,
  type Planner,
  type PolicyRule,
  type PrerequisiteChecker,
  type PromptFragmentProvider,
  type PublicProjectorDefinition,
  type ReadModelDefinition,
  type ResourceCostEvaluator,
  type Result,
  type SalienceProvider,
  type SaveMetadataProvider,
  type SessionBootstrap,
  type SessionHydrator,
  type SliceDefinition,
  type SoftGuard,
  type StageInterceptor,
  type StatusPanelProvider,
  type SystemTurnScheduler,
  type TemplateDefinition,
  type TransitionContributor,
  type TurnLogger,
  type TurnSetup,
  type TurnTeardown,
} from "@rpengineext/contracts";

import type { ContributionIndex, Owned } from "./contribution-index.ts";

/**
 * Builds a ModuleRegisterContext bound to one module and a shared index.
 *
 * @param manifest - module manifest
 * @param log - module-scoped logger
 * @param index - shared contribution index
 */
export interface CreateRegisterContextOptions {
  readonly strictManifest?: boolean;
  readonly effectiveContributes?: readonly string[];
  /** Host engine moduleConfig bag at boot. */
  readonly moduleConfig?: import("@rpengineext/contracts").JsonObject;
}

export interface RegisterContextBundle {
  readonly ctx: ModuleRegisterContext;
  /** Failures returned by register* / add* that the module may have ignored. */
  readonly takeErrors: () => Failure[];
}

export function createRegisterContext(
  manifest: ModuleManifest,
  log: TurnLogger,
  index: ContributionIndex,
  options: CreateRegisterContextOptions = {},
): RegisterContextBundle {
  const owner = {
    moduleId: manifest.id,
    priority: manifest.priority,
  };
  const strict = options.strictManifest === true;
  const contributes = new Set(options.effectiveContributes ?? []);
  const errors: Failure[] = [];
  const track = <T>(result: Result<T, Failure>): Result<T, Failure> => {
    if (!result.ok) errors.push(result.error);
    return result;
  };

  const requireContribute = (port: string): Result<void, Failure> => {
    if (!strict) return ok(undefined);
    if (contributes.has(port)) return ok(undefined);
    return err(
      failure(
        "REGISTRATION_INVALID",
        `module ${manifest.id} registered ${port} without declaring it in contributes/extensionPoints (strictManifest)`,
        { causedBy: [manifest.id] },
      ),
    );
  };

  const requireRegister = (token: string): Result<void, Failure> => {
    if (!strict) return ok(undefined);
    const registers = manifest.registers ?? [];
    if (registers.length === 0) {
      return err(
        failure(
          "REGISTRATION_INVALID",
          `module ${manifest.id} called register* (${token}) but manifest.registers is empty (strictManifest)`,
          { causedBy: [manifest.id] },
        ),
      );
    }
    const kind = token.split(":")[0] ?? token;
    const matches = registers.some((item) => {
      if (item === token || item === kind) return true;
      if (item.endsWith(".*") && token.startsWith(item.slice(0, -1))) return true;
      if (item.endsWith("*") && token.startsWith(item.slice(0, -1))) return true;
      return token.startsWith(`${item}:`) || token.startsWith(`${item}.`);
    });
    if (matches) return ok(undefined);
    return err(
      failure(
        "REGISTRATION_INVALID",
        `module ${manifest.id} registered "${token}" without matching manifest.registers entry (strictManifest)`,
        { causedBy: [manifest.id] },
      ),
    );
  };

  const push = <T>(
    list: Owned<T>[],
    value: T,
    port?: string,
  ): Result<void, Failure> => {
    if (port) {
      const check = requireContribute(port);
      if (!check.ok) return track(check);
    }
    list.push({ ...owner, value });
    return ok(undefined);
  };

  const putUnique = <T>(
    map: Map<string, Owned<T>>,
    key: string,
    value: T,
    label: string,
    registerToken?: string,
  ): Result<void, Failure> => {
    if (registerToken) {
      const check = requireRegister(registerToken);
      if (!check.ok) return track(check);
    }
    if (map.has(key)) {
      return track(
        err(
          failure(
            "REGISTRATION_INVALID",
            `duplicate ${label}: ${key} (module ${manifest.id})`,
          ),
        ),
      );
    }
    map.set(key, { ...owner, value });
    return ok(undefined);
  };

  const ctx: ModuleRegisterContext = {
    manifest,
    log,
    moduleConfig: options.moduleConfig ?? {},

    registerSlice(def: SliceDefinition) {
      return track(
        putUnique(index.slices, def.name, def, "slice", `slice:${def.name}`),
      );
    },
    registerCommand(def: CommandDefinition) {
      return track(
        putUnique(index.commands, def.type, def, "command", `command:${def.type}`),
      );
    },
    registerInvariant(def: InvariantDefinition) {
      const check = requireRegister(`invariant:${def.id}`);
      if (!check.ok) return track(check);
      return track(push(index.invariants, def));
    },
    registerConflictKey(def: ConflictKeyDefinition) {
      const check = requireRegister(`conflict-key:${def.id}`);
      if (!check.ok) return track(check);
      return track(push(index.conflictKeys, def));
    },
    registerAgentTaskType(def: AgentTaskTypeDefinition) {
      return track(
        putUnique(
          index.agentTaskTypes,
          def.type,
          def,
          "agent task type",
          `agent-task:${def.type}`,
        ),
      );
    },
    registerAgentTool(def: AgentToolDefinition) {
      return track(
        putUnique(
          index.agentTools,
          def.id,
          def,
          "agent tool",
          `agent-tool:${def.id}`,
        ),
      );
    },
    registerActionType(def: ActionTypeDefinition) {
      return track(
        putUnique(
          index.actionTypes,
          def.actionType,
          def,
          "action type",
          `action-type:${def.actionType}`,
        ),
      );
    },
    registerIntentType(def: IntentTypeDefinition) {
      return track(
        putUnique(
          index.intentTypes,
          def.intentType,
          def,
          "intent type",
          `intent-type:${def.intentType}`,
        ),
      );
    },
    registerPublicProjector(def: PublicProjectorDefinition) {
      const check = requireRegister(`public-projector:${def.id}`);
      if (!check.ok) return track(check);
      return track(push(index.publicProjectors, def));
    },
    registerMemoryKind(def: MemoryKindDefinition) {
      return track(
        putUnique(
          index.memoryKinds,
          def.kind,
          def,
          "memory kind",
          `memory-kind:${def.kind}`,
        ),
      );
    },
    registerCapability(def: CapabilityDefinition | string) {
      index.addCapability(def);
      return ok(undefined);
    },
    registerReadModel(def: ReadModelDefinition) {
      return track(
        putUnique(
          index.readModels,
          def.id,
          def,
          "read model",
          `read-model:${def.id}`,
        ),
      );
    },
    registerTemplate(def: TemplateDefinition) {
      return track(
        putUnique(index.templates, def.id, def, "template", `template:${def.id}`),
      );
    },
    registerConfigSchema(def: ConfigSchemaDefinition) {
      return track(
        putUnique(
          index.configSchemas,
          def.key,
          def,
          "config schema",
          `config:${def.key}`,
        ),
      );
    },
    registerMigration(def: MigrationDefinition) {
      const check = requireRegister(`migration:${def.slice}`);
      if (!check.ok) return track(check);
      return track(push(index.migrations, def));
    },

    addInterceptor(interceptor: StageInterceptor) {
      if (strict) {
        const declared = (manifest.interceptors ?? []).some(
          (item) =>
            item.stage === interceptor.stage && item.when === interceptor.when,
        );
        if (!declared) {
          return track(
            err(
              failure(
                "REGISTRATION_INVALID",
                `module ${manifest.id} added interceptor ${interceptor.stage}/${interceptor.when} without manifest.interceptors entry (strictManifest)`,
                { causedBy: [manifest.id] },
              ),
            ),
          );
        }
      }
      return track(push(index.interceptors, interceptor));
    },

    addInputNormalizer(handler: InputNormalizer) {
      return push(index.inputNormalizers, handler, "InputNormalizer");
    },
    addActionClassifier(handler: ActionClassifier) {
      return push(index.actionClassifiers, handler, "ActionClassifier");
    },
    addEntityResolver(handler: EntityResolver) {
      return push(index.entityResolvers, handler, "EntityResolver");
    },
    addIntentContributor(handler: IntentContributor) {
      return push(index.intentContributors, handler, "IntentContributor");
    },
    addIntentScorer(handler: IntentScorer) {
      return push(index.intentScorers, handler, "IntentScorer");
    },
    addDisambiguationProvider(handler: DisambiguationProvider) {
      return push(index.disambiguationProviders, handler, "DisambiguationProvider");
    },
    addGuard(handler: Guard) {
      return push(index.guards, handler, "Guard");
    },
    addSoftGuard(handler: SoftGuard) {
      return push(index.softGuards, handler, "SoftGuard");
    },
    addResourceCostEvaluator(handler: ResourceCostEvaluator) {
      return push(index.resourceCostEvaluators, handler, "ResourceCostEvaluator");
    },
    addPrerequisiteChecker(handler: PrerequisiteChecker) {
      return push(index.prerequisiteCheckers, handler, "PrerequisiteChecker");
    },
    addPolicyRule(handler: PolicyRule) {
      return push(index.policyRules, handler, "PolicyRule");
    },
    addPlanner(handler: Planner) {
      return push(index.planners, handler, "Planner");
    },
    addSalienceProvider(handler: SalienceProvider) {
      return push(index.salienceProviders, handler, "SalienceProvider");
    },
    addAgentTaskContributor(handler: AgentTaskContributor) {
      return push(index.agentTaskContributors, handler, "AgentTaskContributor");
    },
    addAgentToolHandler(handler: AgentToolHandler) {
      return push(index.agentToolHandlers, handler, "AgentTool");
    },
    addBriefPolicy(handler: BriefPolicy) {
      return push(index.briefPolicies, handler, "BriefPolicy");
    },
    addPromptFragmentProvider(handler: PromptFragmentProvider) {
      return push(index.promptFragmentProviders, handler, "PromptFragmentProvider");
    },
    addNarrativePromptContributor(handler: NarrativePromptContributor) {
      return push(
        index.narrativePromptContributors,
        handler,
        "NarrativePromptContributor",
      );
    },
    addOutputRepairHintProvider(handler: OutputRepairHintProvider) {
      return push(
        index.outputRepairHintProviders,
        handler,
        "OutputRepairHintProvider",
      );
    },
    addTransitionContributor(handler: TransitionContributor) {
      return push(index.transitionContributors, handler, "TransitionContributor");
    },
    addCommandDecorator(handler: CommandDecorator) {
      return push(index.commandDecorators, handler, "CommandDecorator");
    },
    addCommandValidator(handler: CommandValidator) {
      return push(index.commandValidators, handler, "CommandValidator");
    },
    addInvariantPort(handler: Invariant) {
      return push(index.invariantPorts, handler, "Invariant");
    },
    addConflictResolver(handler: ConflictResolver) {
      return push(index.conflictResolvers, handler, "ConflictResolver");
    },
    addDraftSimulator(handler: DraftSimulator) {
      return push(index.draftSimulators, handler, "DraftSimulator");
    },
    addNarrativeContextProvider(handler: NarrativeContextProvider) {
      return push(
        index.narrativeContextProviders,
        handler,
        "NarrativeContextProvider",
      );
    },
    addNarrativeStyleProvider(handler: NarrativeStyleProvider) {
      return push(index.narrativeStyleProviders, handler, "NarrativeStyleProvider");
    },
    addNarrativeCritic(handler: NarrativeCritic) {
      return push(index.narrativeCritics, handler, "NarrativeCritic");
    },
    addPostNarrativeContributor(handler: PostNarrativeContributor) {
      return push(
        index.postNarrativeContributors,
        handler,
        "PostNarrativeContributor",
      );
    },
    addPassageAssembler(handler: PassageAssembler) {
      return push(index.passageAssemblers, handler, "PassageAssembler");
    },
    addStatusPanelProvider(handler: StatusPanelProvider) {
      return push(index.statusPanelProviders, handler, "StatusPanelProvider");
    },
    addLocalizationContributor(handler: LocalizationContributor) {
      return push(
        index.localizationContributors,
        handler,
        "LocalizationContributor",
      );
    },
    addSessionBootstrap(handler: SessionBootstrap) {
      return push(index.sessionBootstraps, handler, "SessionBootstrap");
    },
    addSessionHydrator(handler: SessionHydrator) {
      return push(index.sessionHydrators, handler, "SessionHydrator");
    },
    addTurnSetup(handler: TurnSetup) {
      return push(index.turnSetups, handler, "TurnSetup");
    },
    addTurnTeardown(handler: TurnTeardown) {
      return push(index.turnTeardowns, handler, "TurnTeardown");
    },
    addOnTurnRejected(handler: OnTurnRejected) {
      return push(index.onTurnRejected, handler, "OnTurnRejected");
    },
    addAfterCommitHook(handler: AfterCommitHook) {
      return push(index.afterCommitHooks, handler, "AfterCommitHook");
    },
    addSystemTurnScheduler(handler: SystemTurnScheduler) {
      return push(index.systemTurnSchedulers, handler, "SystemTurnScheduler");
    },
    addHelpProvider(handler: HelpProvider) {
      return push(index.helpProviders, handler, "HelpProvider");
    },
    addDebugDumper(handler: DebugDumper) {
      return push(index.debugDumpers, handler, "DebugDumper");
    },
    addCliCommandProvider(handler: CliCommandProvider) {
      return push(index.cliCommandProviders, handler, "CliCommandProvider");
    },
    addSaveMetadataProvider(handler: SaveMetadataProvider) {
      return push(index.saveMetadataProviders, handler, "SaveMetadataProvider");
    },
  };

  return {
    ctx,
    takeErrors: () => {
      const copy = [...errors];
      errors.length = 0;
      return copy;
    },
  };
}
