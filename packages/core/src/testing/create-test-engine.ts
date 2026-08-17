import type {
  Engine,
  Failure,
  Module,
  ModuleFactory,
  Result,
  TurnLogger,
} from "@rpengineext/contracts";
import { createLogger } from "@rpengineext/logger";

import {
  createEngine,
  type CreateEngineSuccess,
} from "../create-engine.ts";
import type { MockAgentScript } from "../agents/mock-agent-script.ts";
import { MemoryTraceSink } from "../tracing/memory-trace-sink.ts";
import { InMemoryPersistence } from "../persistence/in-memory-persistence.ts";
import { createFixedClock } from "../util/clock.ts";
import { createFixtureHelloModule } from "./fixture-hello-module.ts";

export interface CreateTestEngineOptions {
  readonly modules?: readonly (Module | ModuleFactory)[];
  readonly includeFixtureHello?: boolean;
  readonly mockAgentScript?: MockAgentScript;
  readonly log?: TurnLogger;
  readonly silentLog?: boolean;
  readonly llm?: import("@rpengineext/contracts").LlmPort;
  readonly agentsMode?: "mock" | "llm";
  readonly defaultModel?: string;
}

export interface TestEngineBundle extends CreateEngineSuccess {
  readonly engine: Engine;
  readonly memoryTraceSink: MemoryTraceSink;
  readonly persistence: InMemoryPersistence;
}

/**
 * Boots an in-memory engine suitable for unit/golden tests.
 *
 * @param options - test options
 */
export async function createTestEngine(
  options: CreateTestEngineOptions = {},
): Promise<Result<TestEngineBundle, Failure>> {
  const memoryTraceSink = new MemoryTraceSink();
  const persistence = new InMemoryPersistence();
  const log =
    options.log ??
    createLogger({
      name: "core-test",
      level: options.silentLog === false ? "debug" : "error",
      json: true,
    });

  const modules = [
    ...(options.includeFixtureHello ? [createFixtureHelloModule()] : []),
    ...(options.modules ?? []),
  ];

  const created = await createEngine({
    deps: {
      log,
      persistence,
      traceSink: memoryTraceSink,
      llm: options.llm,
    },
    modules,
    mockAgentScript: options.mockAgentScript,
    clock: createFixedClock("2026-01-01T00:00:00.000Z", 1000),
    config: {
      agents: {
        mode: options.agentsMode ?? (options.llm ? "llm" : "mock"),
        defaultModel: options.defaultModel ?? "test-model",
      },
      tracing: {
        directory: "memory://traces",
      },
      logging: { level: "error", json: true },
    },
  });

  if (!created.ok) {
    return created;
  }

  return {
    ok: true,
    value: {
      ...created.value,
      memoryTraceSink,
      persistence,
    },
  };
}
