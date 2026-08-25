import path from "node:path";

import {
  ResponsesLlmPort,
} from "@rpengineext/agents-responses";
import { StoryCatalog } from "@rpengineext/content-stories";
import {
  err,
  failure,
  ok,
  type Engine,
  type Failure,
  type Module,
  type Result,
} from "@rpengineext/contracts";
import {
  CORE_VERSION,
  createDefaultMockAgentScript,
  createEngine,
  EventBus,
  FilesystemTraceSink,
  type CreateEngineSuccess,
  type EngineConfig,
  type SessionRuntime,
} from "@rpengineext/core";
import { createLogger, type Logger } from "@rpengineext/logger";
import { createCharacterModule } from "@rpengineext/module-character";
import { createSummaryModule } from "@rpengineext/module-summary";
import { createWorldCanonModule } from "@rpengineext/module-world-canon";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";
import { SqlitePersistence } from "@rpengineext/persistence-sqlite";

import { readHostEnv, type HostEnv } from "./env.ts";

/**
 * Options for {@link createHostRuntime}.
 */
export interface CreateHostRuntimeOptions {
  readonly env?: Record<string, string | undefined>;
  readonly forceMock?: boolean;
  readonly loggerName?: string;
  readonly extraModules?: readonly Module[];
  readonly hostEnv?: HostEnv;
}

/**
 * Shared runtime bag for CLI/API hosts.
 */
export interface HostRuntime {
  readonly env: HostEnv;
  readonly log: Logger;
  readonly engine: Engine;
  readonly runtime: SessionRuntime;
  readonly events: EventBus;
  readonly config: EngineConfig;
  readonly persistence: SqlitePersistence;
  readonly storyCatalog: StoryCatalog;
  readonly created: CreateEngineSuccess;
  stop(): Promise<void>;
}

/**
 * Boots logger, sqlite, story catalog, modules, and engine.
 *
 * @param options - bootstrap options
 */
export async function createHostRuntime(
  options: CreateHostRuntimeOptions = {},
): Promise<Result<HostRuntime, Failure>> {
  const envBag = options.env ?? process.env;
  const hostEnv =
    options.hostEnv ??
    readHostEnv(envBag, { forceMock: options.forceMock === true });

  if (hostEnv.agentsMode === "llm") {
    if (!hostEnv.llm.apiKey || !hostEnv.llm.baseUrl || !hostEnv.llm.model) {
      return err(
        failure(
          "CONFIG_INVALID",
          "LLM mode requires RP_LLM_API_KEY, RP_LLM_BASE_URL, and RP_LLM_MODEL (or use mock mode)",
        ),
      );
    }
  }

  const log = createLogger({
    name: options.loggerName ?? "rpengineext-host",
    level: hostEnv.logLevel,
    json: hostEnv.logJson,
  });

  const stories = StoryCatalog.loadFromDirectory(hostEnv.storiesDir);
  if (!stories.ok) {
    return stories;
  }

  const tracesDir = path.join(hostEnv.dataDir, "traces");
  const traceSink = new FilesystemTraceSink(hostEnv.dataDir);
  const events = new EventBus();

  let persistence: SqlitePersistence;
  try {
    persistence = await SqlitePersistence.open({
      dataDir: hostEnv.dataDir,
      databaseFile: hostEnv.sqlitePath,
    });
  } catch (error) {
    return err(
      failure("INTERNAL", "failed to open engine sqlite", {
        details: String(error),
      }),
    );
  }

  const llm =
    hostEnv.agentsMode === "llm" &&
    hostEnv.llm.apiKey &&
    hostEnv.llm.baseUrl
      ? new ResponsesLlmPort({
          baseUrl: hostEnv.llm.baseUrl,
          apiKey: hostEnv.llm.apiKey,
          defaultModel: hostEnv.llm.model,
          log,
        })
      : undefined;

  const modules: Module[] = [
    createWorkingMemoryModule({ windowPairs: hostEnv.workingMemoryWindow }),
    createWorldCanonModule(),
    createCharacterModule(),
    // Summary interval follows the working-memory window by default.
    createSummaryModule({ intervalTurns: hostEnv.workingMemoryWindow }),
    ...(options.extraModules ?? []),
  ];

  const created = await createEngine({
    deps: {
      log,
      persistence,
      traceSink,
      llm,
      events,
    },
    modules,
    mockAgentScript:
      hostEnv.agentsMode === "mock"
        ? createDefaultMockAgentScript()
        : undefined,
    config: {
      moduleConfig: {
        working_memory: { windowPairs: hostEnv.workingMemoryWindow },
      },
      agents: {
        mode: hostEnv.agentsMode,
        defaultModel: hostEnv.llm.model ?? "",
        defaultTimeoutMs: hostEnv.llm.timeoutMs ?? 60_000,
        maxRepairAttempts: 2,
        streaming: hostEnv.agentsStreaming,
      },
      tracing: {
        enabled: true,
        directory: tracesDir,
      },
      persistence: {
        policy: "per_turn",
      },
    },
  });

  if (!created.ok) {
    persistence.close();
    return created;
  }

  const value = created.value;
  log.info(
    {
      coreVersion: CORE_VERSION,
      agentsMode: hostEnv.agentsMode,
      dataDir: path.resolve(hostEnv.dataDir),
      sqlite: persistence.databaseFile,
      stories: hostEnv.storiesDir,
      templateCount: stories.value.list().length,
    },
    "host runtime ready",
  );

  return ok({
    env: hostEnv,
    log,
    engine: value.engine,
    runtime: value.runtime,
    events: value.events,
    config: value.config,
    persistence,
    storyCatalog: stories.value,
    created: value,
    stop: async () => {
      await value.engine.stop();
      persistence.close();
    },
  });
}
