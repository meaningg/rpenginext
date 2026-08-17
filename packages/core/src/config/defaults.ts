import { STAGE_IDS } from "@rpengineext/contracts";

import type { EngineConfig } from "./types.ts";

const DEFAULT_STAGE_TIMEOUT_MS = 30_000;

function buildStageTimeouts(): Record<(typeof STAGE_IDS)[number], number> {
  const map = {} as Record<(typeof STAGE_IDS)[number], number>;
  for (const stage of STAGE_IDS) {
    map[stage] = DEFAULT_STAGE_TIMEOUT_MS;
  }
  return map;
}

/**
 * Safe default engine configuration for dev/CLI.
 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  modules: {
    strictManifest: true,
    failOnMissingCapability: true,
  },
  turn: {
    stageTimeoutsMs: buildStageTimeouts(),
    sessionBusyPolicy: "error",
    defaultTurnKind: "player",
    idempotencyLimit: 256,
    locale: "en",
  },
  agents: {
    mode: "mock",
    defaultModel: "",
    maxParallelPerTurn: 4,
    maxRepairAttempts: 1,
    defaultTimeoutMs: 15_000,
    temperature: 0.7,
    enableActionInterpret: false,
  },
  persistence: {
    policy: "per_turn",
  },
  tracing: {
    enabled: true,
    directory: "data/traces",
    includePrompts: true,
    includeRawModelOutput: true,
    includeFullStateSnapshots: false,
    maxStringFieldChars: 20_000,
    maxArrayItems: 200,
    redactKeys: [
      "apiKey",
      "api_key",
      "authorization",
      "password",
      "secret",
      "token",
    ],
    writeOnReject: true,
    writeOnCommit: true,
    failTurnOnWriteError: false,
  },
  logging: {
    level: "info",
    json: false,
  },
};

/**
 * Deep-merges a partial config over defaults (turn.stageTimeoutsMs shallow-merged).
 *
 * @param overrides - partial host overrides
 */
export type EngineConfigOverrides = {
  readonly modules?: Partial<EngineConfig["modules"]>;
  readonly turn?: Partial<Omit<EngineConfig["turn"], "stageTimeoutsMs">> &
    {
      readonly stageTimeoutsMs?: Partial<
        EngineConfig["turn"]["stageTimeoutsMs"]
      >;
    };
  readonly agents?: Partial<EngineConfig["agents"]>;
  readonly persistence?: Partial<EngineConfig["persistence"]>;
  readonly tracing?: Partial<EngineConfig["tracing"]>;
  readonly logging?: Partial<EngineConfig["logging"]>;
};

export function mergeEngineConfig(
  overrides?: EngineConfigOverrides,
): EngineConfig {
  if (!overrides) {
    return DEFAULT_ENGINE_CONFIG;
  }
  return {
    modules: { ...DEFAULT_ENGINE_CONFIG.modules, ...overrides.modules },
    turn: {
      ...DEFAULT_ENGINE_CONFIG.turn,
      ...overrides.turn,
      stageTimeoutsMs: {
        ...DEFAULT_ENGINE_CONFIG.turn.stageTimeoutsMs,
        ...overrides.turn?.stageTimeoutsMs,
      },
    },
    agents: { ...DEFAULT_ENGINE_CONFIG.agents, ...overrides.agents },
    persistence: {
      ...DEFAULT_ENGINE_CONFIG.persistence,
      ...overrides.persistence,
    },
    tracing: { ...DEFAULT_ENGINE_CONFIG.tracing, ...overrides.tracing },
    logging: { ...DEFAULT_ENGINE_CONFIG.logging, ...overrides.logging },
  };
}
