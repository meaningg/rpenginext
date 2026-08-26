import path from "node:path";

import {
  ResponsesLlmPort,
} from "@rpengineext/agents-responses";
import { StoryCatalog } from "@rpengineext/content-stories";
import {
  err,
  failure,
  moduleFailure,
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
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";
import { SqlitePersistence } from "@rpengineext/persistence-sqlite";

import { readHostEnv, type HostEnv } from "./env.ts";
import {
  expandProfile,
  MODULE_CATALOG,
  resolveMergedIds,
  type ModuleProfileId,
} from "./module-catalog.ts";
import {
  discoverModulePool,
  instantiateFromPool,
  resolvePool,
  type ModulePoolEntry,
} from "./module-discovery.ts";

/**
 * Options for {@link createHostRuntime}.
 *
 * Module composition precedence (specs/04 §4.1.1 — locked):
 * `options.modules` (exclusive) > `RP_MODULES` > profile
 * (`options.moduleProfile` ?? `RP_MODULE_PROFILE` ?? `core-book`),
 * then `enabledModuleIds` add, `disabledModuleIds` + `RP_DISABLE_MODULES`
 * remove; `extraModules` always appended last.
 *
 * Module discovery (ADR 0006): `moduleDirs` / `RP_MODULE_DIRS` extend the
 * id pool; default scan root is `packages/modules` (workspace). `options.modules`
 * skips discovery entirely (exclusive).
 */
export interface CreateHostRuntimeOptions {
  readonly env?: Record<string, string | undefined>;
  readonly forceMock?: boolean;
  readonly loggerName?: string;
  readonly extraModules?: readonly Module[];
  readonly hostEnv?: HostEnv;

  /** Full override — exclusive with profile/id resolution (skips catalog). */
  readonly modules?: readonly Module[];
  readonly moduleProfile?: ModuleProfileId;
  readonly enabledModuleIds?: readonly string[];
  readonly disabledModuleIds?: readonly string[];
  /** Module discovery roots (ADR 0006); explicit roots must exist. */
  readonly moduleDirs?: readonly string[];
}

/**
 * Resolved module inventory for one boot (host runtime + ops surface).
 */
export interface HostModuleInfo {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  readonly provides: readonly string[];
  readonly requires: readonly string[];
  readonly slices: readonly string[];
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
  /** Module inventory (specs/04 §6.1). */
  listModules(): readonly HostModuleInfo[];
  stop(): Promise<void>;
}

/**
 * Resolves the module list per the locked precedence matrix (specs/04 §4.1.1)
 * over the merged id pool (catalog ⊕ discovery, ADR 0006). `options.modules`
 * short-circuits (exclusive); `extraModules` appends in {@link createHostRuntime}.
 *
 * @param options - host options
 * @param env - normalized host env
 * @param pool - merged module pool (defaults to the first-party catalog)
 */
export async function resolveHostModules(
  options: CreateHostRuntimeOptions,
  env: HostEnv,
  pool: readonly ModulePoolEntry[] = MODULE_CATALOG,
): Promise<Result<{ modules: Module[]; ids: readonly string[] }, Failure>> {
  if (options.modules) {
    // Exclusive Module[] — skip profile/id resolution entirely.
    return ok({ modules: [...options.modules], ids: [] });
  }

  const enabledSet = options.enabledModuleIds ?? [];
  const disabledSet = options.disabledModuleIds ?? [];
  const conflict = enabledSet.filter((id) => disabledSet.includes(id));
  if (conflict.length > 0) {
    // Both full lists in details (specs/04 §4.1.1 locked decision).
    return err(
      moduleFailure(
        "CONFIG_INVALID",
        `module id(s) present in both enabledModuleIds and disabledModuleIds: ${conflict.join(", ")}. Hint: pick one side for each id.`,
        {
          moduleIds: conflict,
          enabledModuleIds: [...enabledSet],
          disabledModuleIds: [...disabledSet],
        },
      ),
    );
  }

  let baseIds: readonly string[];
  if (env.modules) {
    // RP_MODULES replaces the profile set (list order).
    baseIds = env.modules;
  } else {
    const profile = options.moduleProfile ?? env.moduleProfile ?? "core-book";
    baseIds = expandProfile(profile);
  }

  const merged = resolveMergedIds(baseIds, enabledSet);
  if (!merged.ok) return merged;
  const disabled = new Set([...disabledSet, ...env.disableModules]);
  const finalIds = merged.value.filter((id) => !disabled.has(id));

  const instantiated = await instantiateFromPool(finalIds, pool);
  if (!instantiated.ok) return instantiated;

  return ok({ modules: instantiated.value, ids: finalIds });
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

  // Module discovery (ADR 0006): explicit roots must exist; the default
  // `packages/modules` root warns-and-skips when absent (e.g. assembled deploys).
  // `options.modules` is exclusive — discovery is skipped entirely (D7).
  let pool: readonly ModulePoolEntry[] = MODULE_CATALOG;
  if (!options.modules) {
    const DEFAULT_MODULE_DIRS = ["packages/modules"] as const;
    const explicitDirs =
      options.moduleDirs !== undefined || hostEnv.moduleDirs !== undefined;
    const moduleDirs = options.moduleDirs ?? hostEnv.moduleDirs ?? DEFAULT_MODULE_DIRS;
    const discovered = await discoverModulePool(moduleDirs, {
      strict: explicitDirs,
      log: log.child({ component: "module-discovery" }),
    });
    if (!discovered.ok) {
      persistence.close();
      return discovered;
    }
    pool = resolvePool(MODULE_CATALOG, discovered.value, log);
  }

  // Module composition (specs/04): profiles / env / options / extraModules.
  const resolved = await resolveHostModules(options, hostEnv, pool);
  if (!resolved.ok) {
    persistence.close();
    return resolved;
  }
  const catalogModules = resolved.value.modules;

  // The working-memory window is a host env knob: re-instantiate the catalog
  // instance with the resolved window (factory config mirrors RP_WORKING_MEMORY_WINDOW).
  const modules: Module[] = catalogModules.map((mod) => {
    if (mod.manifest.id === "working-memory") {
      return createWorkingMemoryModule({
        windowPairs: hostEnv.workingMemoryWindow,
      });
    }
    return mod;
  });

  const created = await createEngine({
    deps: {
      log,
      persistence,
      traceSink,
      llm,
      events,
    },
    modules: [...modules, ...(options.extraModules ?? [])],
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
  const moduleInfo: HostModuleInfo[] = value.registry.getModules().map((m) => ({
    id: m.module.manifest.id,
    version: m.module.manifest.version,
    priority: m.priority,
    provides: [...m.module.manifest.provides],
    requires: [...m.module.manifest.requires],
    slices: m.module.manifest.stateSlices.map((s) => s.name),
  }));

  log.info(
    {
      coreVersion: CORE_VERSION,
      agentsMode: hostEnv.agentsMode,
      dataDir: path.resolve(hostEnv.dataDir),
      sqlite: persistence.databaseFile,
      stories: hostEnv.storiesDir,
      templateCount: stories.value.list().length,
      modules: moduleInfo.map((m) => ({
        id: m.id,
        version: m.version,
        priority: m.priority,
      })),
      moduleProfile: hostEnv.moduleProfile ?? undefined,
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
    listModules() {
      return Object.freeze([...moduleInfo]);
    },
    stop: async () => {
      await value.engine.stop();
      persistence.close();
    },
  });
}