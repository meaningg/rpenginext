import {
  CONTRACTS_VERSION,
  err,
  failure,
  ok,
  type ConfigSchemaDefinition,
  type Engine,
  type EngineDependencies,
  type Failure,
  type JsonObject,
  type Module,
  type ModuleFactory,
  type Result,
} from "@rpengineext/contracts";

import { AgentOrchestrator } from "./agents/agent-orchestrator.ts";
import {
  createDefaultMockAgentScript,
  createEmptyMockAgentScript,
  type MockAgentScript,
} from "./agents/mock-agent-script.ts";
import {
  createPromptProfileRegistry,
  resolveNarrativePromptProfile,
} from "./agents/prompts/profile-registry.ts";
import { mergeEngineConfig } from "./config/defaults.ts";
import type { EngineConfig } from "./config/types.ts";
import { EventBus } from "./events/event-bus.ts";
import { InMemoryPersistence } from "./persistence/in-memory-persistence.ts";
import { ModuleRegistry } from "./registry/module-registry.ts";
import { SessionRuntime } from "./session/session-runtime.ts";
import { MemoryTraceSink } from "./tracing/memory-trace-sink.ts";
import { TurnTracer } from "./tracing/turn-tracer.ts";
import { createSystemClock, type Clock } from "./util/clock.ts";
import { CORE_VERSION } from "./version.ts";

/**
 * Options for {@link createEngine}.
 */
export interface CreateEngineOptions {
  readonly deps: EngineDependencies;
  readonly config?: Parameters<typeof mergeEngineConfig>[0];
  readonly modules?: readonly (Module | ModuleFactory)[];
  readonly clock?: Clock;
  readonly mockAgentScript?: MockAgentScript;
}

export interface CreateEngineSuccess {
  readonly engine: Engine;
  readonly runtime: SessionRuntime;
  readonly orchestrator: AgentOrchestrator;
  readonly registry: ModuleRegistry;
  readonly events: EventBus;
  readonly traceSink: MemoryTraceSink | EngineDependencies["traceSink"];
  readonly config: EngineConfig;
}

/**
 * Composition root: boots registry, validates module config schemas, wires runtime.
 *
 * @param options - engine options
 */
export async function createEngine(
  options: CreateEngineOptions,
): Promise<Result<CreateEngineSuccess, Failure>> {
  const config = mergeEngineConfig(options.config);
  const clock = options.clock ?? createSystemClock();
  const log = options.deps.log;
  const events =
    options.deps.events instanceof EventBus
      ? options.deps.events
      : new EventBus();
  const persistence = options.deps.persistence ?? new InMemoryPersistence();
  const traceSink = options.deps.traceSink ?? new MemoryTraceSink();

  const registry = new ModuleRegistry({
    log,
    coreVersion: CORE_VERSION,
    contractsVersion: CONTRACTS_VERSION,
    failOnMissingCapability: config.modules.failOnMissingCapability,
    strictManifest: config.modules.strictManifest,
    moduleConfig: config.moduleConfig,
  });

  const boot = await registry.boot(options.modules ?? []);
  if (!boot.ok) {
    return boot;
  }

  const configCheck = validateModuleConfigs(
    registry.getIndex().configSchemas,
    config.moduleConfig,
  );
  if (!configCheck.ok) {
    return configCheck;
  }

  const started = await registry.startAll();
  if (!started.ok) {
    return started;
  }

  const agentsMode = config.agents.mode;
  const resolvedMock =
    options.mockAgentScript ??
    (agentsMode === "mock"
      ? createDefaultMockAgentScript()
      : createEmptyMockAgentScript());

  // Narrative prompt profiles (ADR 0007): load files + resolve per session boot.
  const promptRegistry = createPromptProfileRegistry({
    dir: config.agents.promptProfilesDir,
    explicitDir: config.agents.promptProfilesDir !== undefined,
    log,
  });
  if (!promptRegistry.ok) {
    return promptRegistry;
  }
  const narrativePrompt = resolveNarrativePromptProfile({
    registry: promptRegistry.value,
    model: config.agents.defaultModel,
    profilesByModel: config.agents.promptProfiles,
    defaultProfile: config.agents.defaultPromptProfile,
    override: config.agents.promptProfileOverride,
  });
  if (!narrativePrompt.ok) {
    return narrativePrompt;
  }

  const orchestrator = new AgentOrchestrator({
    log,
    clock,
    events,
    llm: options.deps.llm,
    index: registry.getIndex(),
    mockScript: resolvedMock,
    maxRepairAttempts: config.agents.maxRepairAttempts,
    mode: agentsMode,
    defaultModel: config.agents.defaultModel,
    defaultTemperature: config.agents.temperature,
    maxParallelPerTurn: config.agents.maxParallelPerTurn,
    getModulePermissions: (moduleId) => registry.getModulePermissions(moduleId),
    streaming: config.agents.streaming,
    promptProfile: narrativePrompt.value.profile,
    promptProfileRef: narrativePrompt.value.ref,
  });

  const tracer = new TurnTracer({
    config: config.tracing,
    sink: traceSink,
    clock,
    log,
    events,
  });

  const runtime = new SessionRuntime({
    log,
    clock,
    config,
    registry,
    orchestrator,
    tracer,
    persistence,
    events,
    promptProfileRef: narrativePrompt.value.ref,
  });

  log.info(
    {
      coreVersion: CORE_VERSION,
      contractsVersion: CONTRACTS_VERSION,
      agentsMode,
      narrativePromptProfile: narrativePrompt.value.ref,
      modules: registry.getModules().map((m) => ({
        id: m.module.manifest.id,
        version: m.module.manifest.version,
        priority: m.module.manifest.priority,
      })),
    },
    "engine created",
  );

  return ok({
    engine: runtime,
    runtime,
    orchestrator,
    registry,
    events,
    traceSink,
    config,
  });
}

/**
 * Validates host-provided moduleConfig sections against registered schemas.
 *
 * @param schemas - contribution index config schemas
 * @param moduleConfig - host config map keyed by schema key
 */
export function validateModuleConfigs(
  schemas: ReadonlyMap<string, { readonly value: ConfigSchemaDefinition }>,
  moduleConfig: Readonly<Record<string, JsonObject>>,
): Result<void, Failure> {
  for (const [key, owned] of schemas) {
    const raw = moduleConfig[key] ?? {};
    const parsed = owned.value.schema.safeParse(raw);
    if (!parsed.success) {
      return err(
        failure(
          "CONFIG_INVALID",
          `moduleConfig["${key}"] failed registered config schema (module: unknown). Hint: fix the config section per the module public contract / config schema.`,
          { details: parsed.error.flatten() },
        ),
      );
    }
  }
  return ok(undefined);
}
