import {
  CONTRACTS_VERSION,
  err,
  failure,
  ok,
  type Engine,
  type EngineDependencies,
  type Failure,
  type Module,
  type ModuleFactory,
  type Result,
  type TurnLogger,
} from "@rpengineext/contracts";

import { AgentOrchestrator } from "./agents/agent-orchestrator.ts";
import {
  createDefaultMockAgentScript,
  createEmptyMockAgentScript,
  type MockAgentScript,
} from "./agents/mock-agent-script.ts";
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
  readonly traceSink: MemoryTraceSink | EngineDependencies["traceSink"];
  readonly config: EngineConfig;
}

/**
 * Composition root: boots registry, wires pipeline, returns Engine facade.
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
  });

  const boot = await registry.boot(options.modules ?? []);
  if (!boot.ok) {
    return boot;
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
  });

  log.info(
    {
      coreVersion: CORE_VERSION,
      contractsVersion: CONTRACTS_VERSION,
      agentsMode,
      modules: registry.getModules().map((m) => m.module.manifest.id),
    },
    "engine created",
  );

  return ok({
    engine: runtime,
    runtime,
    orchestrator,
    registry,
    traceSink,
    config,
  });
}

/**
 * Adapts a structured logger to TurnLogger if needed (identity for compatible loggers).
 *
 * @param log - logger
 */
export function asTurnLogger(log: TurnLogger): TurnLogger {
  return log;
}

/**
 * Convenience failure when createEngine is used incorrectly.
 */
export function engineNotCreated(message: string): Failure {
  return failure("INTERNAL", message);
}

void err;
